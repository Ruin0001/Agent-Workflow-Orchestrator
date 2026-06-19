import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { resolveArtifactPaths, type ArtifactPaths } from "../artifacts/paths.js";
import {
  validateAllowedChangeManifest,
  type AllowedChangeManifest,
} from "../artifacts/manifest.js";
import { runAgent } from "../agents/runner.js";
import type { AgentRunResult } from "../agents/adapter.js";
import { DEFAULT_CONFIG_FILE } from "../config/defaults.js";
import { loadConfig } from "../config/load.js";
import type { AgentFlowConfig, AgentRole } from "../config/schema.js";
import { filesystemError, validationError } from "../core/errors.js";
import { parseJson } from "../core/json.js";
import { err, ok, type Result } from "../core/result.js";
import { appendRunLogEntry } from "../logging/run-log.js";
import { redactSecrets } from "../logging/redact.js";
import { acquireLockfile, releaseLockfile } from "../locks/lockfile.js";
import { renderPrompt } from "../prompts/render.js";
import type { WorkflowState } from "../state/schema.js";
import { readState, writeState } from "../state/store.js";
import { getActorForPhase, type WorkflowActor } from "../workflow/actors.js";
import { evaluateNextGates } from "../workflow/gates.js";
import { isWorkflowPhase, type WorkflowPhase } from "../workflow/phases.js";
import { validateTransition } from "../workflow/transitions.js";
import { checkGitCleanTree, collectGitDiffSummary, type ChangedFile } from "../guards/git-diff.js";
import { enforceChangePolicy } from "../guards/policy.js";

export type NextOptions = {
  workspace?: string;
  configPath?: string;
};

export type NextStepResult = {
  message: string;
  phase: WorkflowPhase;
  actor: AgentRole;
  runId: string;
  proposedNextPhase: WorkflowPhase;
  acceptedNextPhase: WorkflowPhase;
  artifactPaths: string[];
};

type Proposal = {
  runId: string;
  nextPhase: WorkflowPhase;
  artifacts: string[];
  summary: string;
};

type GuardrailLogResult = {
  status: "skipped" | "passed" | "limited" | "blocked";
  code?: string;
  reason?: string;
};

export async function nextCommand(options: NextOptions = {}): Promise<Result<string>> {
  const result = await nextStepCommand(options);
  if (!result.ok) return result;
  return ok(result.value.message);
}

export async function nextStepCommand(options: NextOptions = {}): Promise<Result<NextStepResult>> {
  const workspace = options.workspace ?? process.cwd();
  const configPath = options.configPath ?? DEFAULT_CONFIG_FILE;
  const loadedConfig = await loadConfig({ cwd: workspace, configPath });
  if (!loadedConfig.ok) return err(loadedConfig.error);

  const config = loadedConfig.value;
  const shouldUseGitGuardrails =
    config.guardrails.requireGitForFullGuardrails ||
    config.guardrails.requireCleanWorkingTree;
  let limitedGuardrailMode = false;
  if (shouldUseGitGuardrails) {
    const cleanTree = await checkGitCleanTree(workspace, config);
    if (!cleanTree.ok) return cleanTree;
    limitedGuardrailMode = cleanTree.value.limited && config.guardrails.requireGitForFullGuardrails;
  }

  const lockPath = resolvePath(workspace, join(config.workspace.stateDir, "agent-flow.lock"));
  const lock = await acquireLockfile(lockPath, "agent-flow next");
  if (!lock.ok) return err(lock.error);

  let operationSucceeded = false;
  let successResult: NextStepResult | undefined;
  let releaseFailureMessage: string | undefined;
  try {
    const statePath = resolvePath(workspace, join(config.workspace.stateDir, "workflow_state.json"));
    const stateResult = await readState(statePath);
    if (!stateResult.ok) return err(stateResult.error);

    const state = stateResult.value;
    const activeGate = Object.entries(state.gates).find(([, gate]) => gate.active);
    if (activeGate !== undefined) {
      const [gateName, gate] = activeGate;
      return err({
        code: "USER_GATE_ACTIVE",
        path: "$.gates",
        message: `User gate is active: ${gateName}`,
        details: { gate: gateName, reason: gate.reason },
      });
    }

    const currentActor = getActorForPhase(state.phase);
    if (currentActor === undefined || currentActor !== state.currentActor) {
      return err(validationError("$.currentActor", `Current actor does not match phase ${state.phase}`));
    }
    if (currentActor !== "implementation" && currentActor !== "review") {
      return err({
        code: "NO_AGENT_FOR_PHASE",
        path: "$.phase",
        message: `Phase ${state.phase} is handled by ${currentActor}, not an agent.`,
      });
    }

    const artifactPaths = resolveArtifactPaths(config, state);
    const agent = config.agents[currentActor];
    const blockedCommand = findBlockedAgentCommand(agent, config.guardrails.blockedCommands);
    if (blockedCommand !== undefined) {
      return err({
        code: "BLOCKED_COMMAND",
        path: "$.agents",
        message: `Configured agent command matches blockedCommands: ${blockedCommand}`,
        details: { command: commandSummary(agent) },
      });
    }

    const runId = randomUUID();
    const prompt = renderPrompt({
      state,
      config,
      artifactPaths,
      role: currentActor,
      stopCondition:
        `Stop after completing exactly one workflow phase. Write .agent/next_state_proposal.json with runId "${runId}", nextPhase, artifacts, and summary before exiting.`,
      guardrails: [
        `This runId is required in next_state_proposal.json: ${runId}`,
        "Use only the artifact paths listed in this prompt.",
        "Do not implement Task 8 guardrail modules.",
        "Do not continue into the next phase after writing the proposal.",
      ],
    });

    const promptPersisted = await persistPromptIfConfigured(workspace, config, state, prompt);
    if (!promptPersisted.ok) return promptPersisted;

    const proposalPath = resolvePath(workspace, join(config.workspace.stateDir, "next_state_proposal.json"));
    const proposalRemoved = await removeProposalIfPresent(proposalPath);
    if (!proposalRemoved.ok) return proposalRemoved;

    const runResult = await runAgent({
      role: agent.role,
      command: agent.command,
      args: agent.args,
      cwd: workspace,
      input: prompt,
      timeoutMs: agent.timeoutSeconds * 1000,
    });

    const postRunGuardrails = await enforcePostRunGuardrails(
      workspace,
      config,
      artifactPaths,
      shouldUseGitGuardrails,
    );
    if (!postRunGuardrails.ok) {
      const runLog = await appendAgentRunLog({
        workspace,
        config,
        state,
        actor: currentActor,
        agent,
        result: runResult,
        promptPath: promptPersisted.value,
        artifactPaths: [],
        filesChanged: [],
        guardrailResult: {
          status: "blocked",
          code: postRunGuardrails.error.code,
          reason: postRunGuardrails.error.message,
        },
        proposedNextPhase: null,
        acceptedNextPhase: null,
        outcome: "failed",
        failureCode: postRunGuardrails.error.code,
      });
      if (!runLog.ok) return runLog;
      return postRunGuardrails;
    }
    if (postRunGuardrails.value.limitedGuardrailMode) {
      limitedGuardrailMode = true;
    }
    const guardrailResult = postRunGuardrails.value.guardrailResult;
    const filesChanged = postRunGuardrails.value.changedFiles;

    if (runResult.timedOut) {
      const runLog = await appendAgentRunLog({
        workspace,
        config,
        state,
        actor: currentActor,
        agent,
        result: runResult,
        promptPath: promptPersisted.value,
        artifactPaths: [],
        filesChanged,
        guardrailResult,
        proposedNextPhase: null,
        acceptedNextPhase: null,
        outcome: "failed",
        failureCode: "AGENT_TIMEOUT",
      });
      if (!runLog.ok) return runLog;
      return err({
        code: "AGENT_TIMEOUT",
        message: `Agent timed out after ${agent.timeoutSeconds} seconds.`,
      });
    }
    if (runResult.exitCode !== 0) {
      const runLog = await appendAgentRunLog({
        workspace,
        config,
        state,
        actor: currentActor,
        agent,
        result: runResult,
        promptPath: promptPersisted.value,
        artifactPaths: [],
        filesChanged,
        guardrailResult,
        proposedNextPhase: null,
        acceptedNextPhase: null,
        outcome: "failed",
        failureCode: "AGENT_NONZERO_EXIT",
      });
      if (!runLog.ok) return runLog;
      return err({
        code: "AGENT_NONZERO_EXIT",
        message: `Agent exited non-zero with code ${runResult.exitCode ?? "unknown"}.`,
      });
    }

    const proposal = await readAndValidateProposal(
      workspace,
      config,
      state,
      artifactPaths,
      runId,
    );
    if (!proposal.ok) {
      const runLog = await appendAgentRunLog({
        workspace,
        config,
        state,
        actor: currentActor,
        agent,
        result: runResult,
        promptPath: promptPersisted.value,
        artifactPaths: [],
        filesChanged,
        guardrailResult,
        proposedNextPhase: null,
        acceptedNextPhase: null,
        outcome: "failed",
        failureCode: proposal.error.code,
      });
      if (!runLog.ok) return runLog;
      return proposal;
    }

    const gateResult = evaluateNextGates(state, config, proposal.value.nextPhase);
    if (!gateResult.ok) {
      const runLog = await appendAgentRunLog({
        workspace,
        config,
        state,
        actor: currentActor,
        agent,
        result: runResult,
        promptPath: promptPersisted.value,
        artifactPaths: proposalArtifactPaths(proposal.value, artifactPaths),
        filesChanged,
        guardrailResult,
        proposedNextPhase: proposal.value.nextPhase,
        acceptedNextPhase: null,
        outcome: "failed",
        failureCode: gateResult.error.code,
      });
      if (!runLog.ok) return runLog;
      return gateResult;
    }

    if (!shouldUseGitGuardrails) {
      const manifestValidation = await validateManifestIfPresent(workspace, artifactPaths);
      if (!manifestValidation.ok) {
        const runLog = await appendAgentRunLog({
          workspace,
          config,
          state,
          actor: currentActor,
          agent,
          result: runResult,
          promptPath: promptPersisted.value,
          artifactPaths: proposalArtifactPaths(proposal.value, artifactPaths),
          filesChanged,
          guardrailResult,
          proposedNextPhase: proposal.value.nextPhase,
          acceptedNextPhase: null,
          outcome: "failed",
          failureCode: manifestValidation.error.code,
        });
        if (!runLog.ok) return runLog;
        return manifestValidation;
      }
    }

    const nextActor = getActorForPhase(proposal.value.nextPhase);
    if (nextActor === undefined) {
      return err(validationError("$.nextPhase", "Unknown next phase"));
    }

    const updatedState = advanceState(state, proposal.value, currentActor, nextActor);
    const runLog = await appendAgentRunLog({
      workspace,
      config,
      state,
      actor: currentActor,
      agent,
      result: runResult,
      promptPath: promptPersisted.value,
      artifactPaths: proposalArtifactPaths(proposal.value, artifactPaths),
      filesChanged,
      guardrailResult,
      proposedNextPhase: proposal.value.nextPhase,
      acceptedNextPhase: proposal.value.nextPhase,
      outcome: "success",
      failureCode: null,
    });
    if (!runLog.ok) return runLog;
    const stateWrite = await writeState(statePath, updatedState);
    if (!stateWrite.ok) return err(stateWrite.error);

    operationSucceeded = true;
    const suffix = limitedGuardrailMode ? " (limited guardrail mode: Git unavailable)" : "";
    successResult = {
      message: `Advanced to ${proposal.value.nextPhase}${suffix}`,
      phase: state.phase,
      actor: currentActor,
      runId,
      proposedNextPhase: proposal.value.nextPhase,
      acceptedNextPhase: proposal.value.nextPhase,
      artifactPaths: proposalArtifactPaths(proposal.value, artifactPaths),
    };
  } finally {
    const release = await releaseLockfile(lock.value);
    if (operationSucceeded && !release.ok) {
      releaseFailureMessage = release.error.message;
    }
  }

  if (successResult !== undefined) {
    const releaseSuffix =
      releaseFailureMessage === undefined
        ? ""
        : ` (warning: lock release failed: ${releaseFailureMessage})`;
    return ok({
      ...successResult,
      message: `${successResult.message}${releaseSuffix}`,
    });
  }

  return err({
    code: "INTERNAL_ERROR",
    message: "next command reached an unexpected terminal state",
  });
}

async function enforcePostRunGuardrails(
  workspace: string,
  config: AgentFlowConfig,
  artifactPaths: ArtifactPaths,
  shouldUseGitGuardrails: boolean,
): Promise<Result<{ limitedGuardrailMode: boolean; changedFiles: string[]; guardrailResult: GuardrailLogResult }>> {
  if (!shouldUseGitGuardrails) {
    return ok({
      limitedGuardrailMode: false,
      changedFiles: [],
      guardrailResult: { status: "skipped" },
    });
  }

  const manifestValidation = await validateManifestIfPresent(workspace, artifactPaths);
  const manifest = manifestValidation.ok ? manifestValidation.value : undefined;
  const diffSummary = await collectGitDiffSummary(workspace);
  if (!diffSummary.ok) return diffSummary;
  if (diffSummary.value.limited) {
    if (!manifestValidation.ok) return manifestValidation;
    return ok({
      limitedGuardrailMode: config.guardrails.requireGitForFullGuardrails,
      changedFiles: [],
      guardrailResult: {
        status: "limited",
        reason: diffSummary.value.reason,
      },
    });
  }

  const policy = await enforceChangePolicy({
    workspace,
    config,
    changedFiles: diffSummary.value.changedFiles,
    manifest,
    ignoredPatterns: [`${config.workspace.stateDir}/**`],
  });
  if (!policy.ok) return policy;
  if (!manifestValidation.ok) return manifestValidation;

  return ok({
    limitedGuardrailMode: false,
    changedFiles: diffSummary.value.changedFiles.flatMap(changedFilePaths),
    guardrailResult: { status: "passed" },
  });
}

async function validateManifestIfPresent(
  workspace: string,
  artifactPaths: ArtifactPaths,
): Promise<Result<AllowedChangeManifest | undefined>> {
  const manifestPath = resolvePath(workspace, artifactPaths.allowed_change_manifest);
  if (!(await exists(manifestPath))) {
    return ok(undefined);
  }

  let source: string;
  try {
    source = await readFile(manifestPath, "utf8");
  } catch (error) {
    return err(filesystemError(errorMessage(error), manifestPath));
  }

  const parsed = parseJson(source, manifestPath);
  if (!parsed.ok) return parsed;
  const validation = validateAllowedChangeManifest(parsed.value);
  if (!validation.ok) return validation;
  return ok(validation.value);
}

async function persistPromptIfConfigured(
  workspace: string,
  config: AgentFlowConfig,
  state: WorkflowState,
  prompt: string,
): Promise<Result<string | null>> {
  if (config.logging.persistPrompts !== "configured") {
    return ok(null);
  }

  const promptDir = resolvePath(workspace, config.workspace.promptDir);
  const promptPath = join(promptDir, `${Date.now()}-${state.phase}.md`);
  try {
    await mkdir(promptDir, { recursive: true });
    await writeFile(promptPath, redactSecrets(prompt), "utf8");
    return ok(promptPath);
  } catch (error) {
    return err(filesystemError(errorMessage(error), promptPath));
  }
}

async function appendAgentRunLog(input: {
  workspace: string;
  config: AgentFlowConfig;
  state: WorkflowState;
  actor: AgentRole;
  agent: AgentFlowConfig["agents"][AgentRole];
  result: AgentRunResult;
  promptPath: string | null;
  artifactPaths: string[];
  filesChanged: string[];
  guardrailResult: GuardrailLogResult;
  proposedNextPhase: WorkflowPhase | null;
  acceptedNextPhase: WorkflowPhase | null;
  outcome: "success" | "failed";
  failureCode: string | null;
}): Promise<Result<void>> {
  return await appendRunLogEntry({
    logDir: resolvePath(input.workspace, input.config.workspace.logDir),
    entry: {
      timestamp: new Date().toISOString(),
      phase: input.state.phase,
      actor: input.actor,
      commandSummary: commandSummary(input.agent),
      promptPath: input.promptPath,
      artifactPaths: input.artifactPaths,
      filesChanged: input.filesChanged,
      guardrailResult: input.guardrailResult,
      proposedNextPhase: input.proposedNextPhase,
      acceptedNextPhase: input.acceptedNextPhase,
      outcome: input.outcome,
      failureCode: input.failureCode,
      commandExitCode: input.result.exitCode,
      timedOut: input.result.timedOut,
      durationMs: input.result.durationMs,
      stdout: input.result.stdout,
      stderr: input.result.stderr,
    },
  });
}

async function readAndValidateProposal(
  workspace: string,
  config: AgentFlowConfig,
  state: WorkflowState,
  artifactPaths: ArtifactPaths,
  runId: string,
): Promise<Result<Proposal>> {
  const proposalPath = resolvePath(workspace, join(config.workspace.stateDir, "next_state_proposal.json"));
  let source: string;
  try {
    source = await readFile(proposalPath, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return err({
        code: "PROPOSAL_NOT_FOUND",
        path: proposalPath,
        message: "Agent did not write next_state_proposal.json.",
      });
    }
    return err(filesystemError(errorMessage(error), proposalPath));
  }

  const parsed = parseJson(source, proposalPath);
  if (!parsed.ok) return parsed;
  const root = parsed.value;
  if (typeof root !== "object" || root === null || Array.isArray(root)) {
    return err(validationError("$", "Proposal root must be an object"));
  }

  const proposal = root as Record<string, unknown>;
  if (proposal.runId !== runId) {
    return err({
      code: "PROPOSAL_RUN_ID_MISMATCH",
      path: proposalPath,
      message: "Proposal runId does not match the current agent run.",
    });
  }

  if (!isWorkflowPhase(proposal.nextPhase)) {
    return err(validationError("$.nextPhase", "Proposal nextPhase must be a known workflow phase"));
  }

  const transition = validateTransition(state.phase, proposal.nextPhase);
  if (!transition.ok) return transition;

  if (!Array.isArray(proposal.artifacts)) {
    return err(validationError("$.artifacts", "Proposal artifacts must be an array"));
  }

  const artifacts: string[] = [];
  for (let index = 0; index < proposal.artifacts.length; index += 1) {
    const artifact = proposal.artifacts[index];
    if (typeof artifact !== "string") {
      return err(validationError(`$.artifacts[${index}]`, "Artifact names must be strings"));
    }
    if (!isKnownArtifactName(artifact, artifactPaths)) {
      return err(validationError(`$.artifacts[${index}]`, `Unknown artifact: ${artifact}`));
    }
    const artifactPath = resolvePath(workspace, artifactPaths[artifact]);
    if (!(await exists(artifactPath))) {
      return err({
        code: "ARTIFACT_NOT_FOUND",
        path: artifactPath,
        message: `Claimed artifact does not exist: ${artifact}`,
      });
    }
    artifacts.push(artifact);
  }

  const summary =
    typeof proposal.summary === "string" && proposal.summary.trim() !== ""
      ? proposal.summary
      : `Advanced from ${state.phase} to ${proposal.nextPhase}`;

  return ok({
    runId,
    nextPhase: proposal.nextPhase,
    artifacts,
    summary,
  });
}

async function removeProposalIfPresent(path: string): Promise<Result<void>> {
  try {
    await rm(path, { force: true });
    return ok(undefined);
  } catch (error) {
    return err(filesystemError(errorMessage(error), path));
  }
}

function advanceState(
  state: WorkflowState,
  proposal: Proposal,
  lastActor: AgentRole,
  nextActor: WorkflowActor,
): WorkflowState {
  const iterationCounters = { ...state.iterationCounters };
  if (proposal.nextPhase === "spec_review") {
    iterationCounters.spec_review += 1;
  } else if (proposal.nextPhase === "plan_review") {
    iterationCounters.plan_review += 1;
  } else if (proposal.nextPhase === "implementation_review") {
    iterationCounters.implementation_review += 1;
  }

  return {
    ...state,
    phase: proposal.nextPhase,
    currentActor: nextActor,
    nextActor,
    status: statusForActor(nextActor),
    iterationCounters,
    lastActor,
    lastAction: proposal.summary,
    updatedAt: new Date().toISOString(),
  };
}

function statusForActor(actor: WorkflowActor): WorkflowState["status"] {
  if (actor === "user") {
    return "waiting_for_user";
  }
  if (actor === "none") {
    return "done";
  }
  return "ready";
}

function isKnownArtifactName(
  name: string,
  artifactPaths: ArtifactPaths,
): name is keyof ArtifactPaths {
  return Object.prototype.hasOwnProperty.call(artifactPaths, name);
}

function proposalArtifactPaths(proposal: Proposal, artifactPaths: ArtifactPaths): string[] {
  return proposal.artifacts.map((artifact) => artifactPaths[artifact as keyof ArtifactPaths]);
}

function changedFilePaths(file: ChangedFile): string[] {
  return file.previousPath === undefined ? [file.path] : [file.previousPath, file.path];
}

function findBlockedAgentCommand(
  agent: AgentFlowConfig["agents"][AgentRole],
  blockedCommands: string[],
): string | undefined {
  const command = normalizeCommand(commandSummary(agent));
  return blockedCommands.find((blockedCommand) => {
    const blocked = normalizeCommand(blockedCommand);
    return blocked !== "" && command.includes(blocked);
  });
}

function commandSummary(agent: AgentFlowConfig["agents"][AgentRole]): string {
  return `${agent.command} ${agent.args.join(" ")}`.trim();
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ").toLowerCase();
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function resolvePath(workspace: string, path: string): string {
  return isAbsolute(path) ? path : join(workspace, path);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Filesystem operation failed";
}
