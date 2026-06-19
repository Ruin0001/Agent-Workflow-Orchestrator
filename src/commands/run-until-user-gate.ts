import { readFile, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { validatePlanReviewVerdict, type PlanReviewVerdict } from "../artifacts/review-verdict.js";
import { DEFAULT_CONFIG_FILE } from "../config/defaults.js";
import { loadConfig } from "../config/load.js";
import { filesystemError, validationError } from "../core/errors.js";
import { parseJson } from "../core/json.js";
import { err, ok, type AppError, type Result } from "../core/result.js";
import { readState } from "../state/store.js";
import { canDelegateUserPlanApproval } from "../workflow/delegation-policy.js";
import { evaluateRunStop, type RunStopDecision } from "../workflow/run-stop.js";
import { clearDelegatedUserPlanApproval } from "./delegated-gate-clear.js";
import { nextCommand, nextStepCommand } from "./next.js";

export const RUN_UNTIL_USER_GATE_MAX_STEPS = 20;

export type RunUntilUserGateOptions = {
  workspace?: string;
  configPath?: string;
  maxSteps?: number;
  delegated?: boolean;
};

export async function runUntilUserGateCommand(
  options: RunUntilUserGateOptions = {},
): Promise<Result<string>> {
  const maxSteps = options.maxSteps ?? RUN_UNTIL_USER_GATE_MAX_STEPS;
  if (!Number.isFinite(maxSteps) || !Number.isInteger(maxSteps) || maxSteps < 0) {
    return err(validationError("$.maxSteps", "maxSteps must be a non-negative integer"));
  }

  const workspace = options.workspace ?? process.cwd();
  const configPath = options.configPath ?? DEFAULT_CONFIG_FILE;
  const loadedConfig = await loadConfig({ cwd: workspace, configPath });
  if (!loadedConfig.ok) return err(loadedConfig.error);

  const config = loadedConfig.value;
  if (options.delegated === true && !config.delegation.enabled) {
    return err({
      code: "DELEGATION_DISABLED",
      path: "$.delegation.enabled",
      message: "Delegation is disabled; remove --delegated or enable delegation in config.",
    });
  }

  const statePath = resolvePath(workspace, join(config.workspace.stateDir, "workflow_state.json"));
  const verdictArtifactPath = `${config.workspace.artifactDir}/plan_review_verdict.json`;
  const verdictPath = resolvePath(workspace, verdictArtifactPath);
  if (options.delegated === true) {
    const removed = await removeVerdictIfPresent(verdictPath);
    if (!removed.ok) return removed;
  }

  const stepResults: string[] = [];
  let lastPlanReviewRunId: string | null = null;
  let stepsRun = 0;

  while (stepsRun < maxSteps) {
    const stateResult = await readState(statePath);
    if (!stateResult.ok) return err(stateResult.error);

    const decision = evaluateRunStop(stateResult.value);
    if (decision.action === "stop") {
      if (options.delegated === true && decision.phase === "user_plan_approval") {
        const verdictResult = await readPlanReviewVerdict(verdictPath);
        if (!verdictResult.ok) {
          return ok(formatRunSummary(decision, stepsRun, stepResults));
        }

        const policy = canDelegateUserPlanApproval({
          config,
          delegatedFlag: true,
          verdict: verdictResult.value,
          expectedRunId: lastPlanReviewRunId,
        });
        if (!policy.ok) {
          return ok(
            formatRunSummary(decision, stepsRun, stepResults, [
              `Delegation policy: ${policy.reason}`,
            ]),
          );
        }

        const cleared = await clearDelegatedUserPlanApproval({
          workspace,
          configPath,
          verdictPath: verdictArtifactPath,
          verdict: verdictResult.value,
        });
        if (!cleared.ok) return cleared;
        stepResults.push(cleared.value);
        continue;
      }
      return ok(formatRunSummary(decision, stepsRun, stepResults));
    }

    if (options.delegated === true) {
      const nextResult = await nextStepCommand({ workspace, configPath });
      if (!nextResult.ok) {
        return err(withRunSummary(nextResult.error, stepResults.length, decision.phase, decision.actor));
      }
      if (nextResult.value.phase === "plan_review") {
        lastPlanReviewRunId = nextResult.value.runId;
      }
      stepResults.push(nextResult.value.message);
    } else {
      const nextResult = await nextCommand({ workspace, configPath });
      if (!nextResult.ok) {
        return err(withRunSummary(nextResult.error, stepResults.length, decision.phase, decision.actor));
      }
      stepResults.push(nextResult.value);
    }
    stepsRun += 1;
  }

  const stateResult = await readState(statePath);
  if (!stateResult.ok) return err(stateResult.error);

  const decision = evaluateRunStop(stateResult.value);
  if (decision.action === "stop") {
    return ok(formatRunSummary(decision, stepResults.length, stepResults));
  }

  return err({
    code: "RUN_UNTIL_STEP_LIMIT",
    path: statePath,
    message: `Stopped after ${maxSteps} steps without reaching a user gate.`,
    details: {
      stepsRun: stepResults.length,
      lastPhase: decision.phase,
      lastActor: decision.actor,
      maxSteps,
    },
  });
}

async function readPlanReviewVerdict(path: string): Promise<Result<PlanReviewVerdict>> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return err({
        code: "PLAN_REVIEW_VERDICT_NOT_FOUND",
        path,
        message: "Plan review verdict was not found for delegated user_plan_approval.",
      });
    }
    return err(filesystemError(errorMessage(error), path));
  }

  const parsed = parseJson(source, path);
  if (!parsed.ok) return parsed;
  return validatePlanReviewVerdict(parsed.value);
}

async function removeVerdictIfPresent(path: string): Promise<Result<void>> {
  try {
    await rm(path, { force: true });
    return ok(undefined);
  } catch (error) {
    return err(filesystemError(errorMessage(error), path));
  }
}

function withRunSummary(
  error: AppError,
  stepsRun: number,
  lastPhase: string,
  lastActor: string,
): AppError {
  return {
    ...error,
    message: `${error.message}\nrun-until-user-gate stopped after ${stepsRun} steps.`,
    details: {
      ...error.details,
      runUntilUserGate: {
        stepsRun,
        lastPhase,
        lastActor,
      },
    },
  };
}

export default runUntilUserGateCommand;

function formatRunSummary(
  decision: Extract<RunStopDecision, { action: "stop" }>,
  stepsRun: number,
  stepResults: string[],
  extraDetails: string[] = [],
): string {
  const details = [`Steps run: ${stepsRun}`];
  if (decision.gateReason !== undefined) {
    details.push(`Gate reason: ${decision.gateReason}`);
  }
  details.push(...extraDetails);
  return formatMessageWithStepResults(decision.message, details, stepResults);
}

function formatMessageWithStepResults(
  message: string,
  details: string[],
  stepResults: string[],
): string {
  const lines = [message, ...details];
  if (stepResults.length > 0) {
    lines.push("", "Step results:", ...stepResults.map((result, index) => `${index + 1}. ${result}`));
  }
  return lines.join("\n");
}

function resolvePath(workspace: string, path: string): string {
  return isAbsolute(path) ? path : join(workspace, path);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Filesystem operation failed";
}
