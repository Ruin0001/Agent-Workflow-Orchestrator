import { isAbsolute, join } from "node:path";
import type { PlanReviewVerdict } from "../artifacts/review-verdict.js";
import { DEFAULT_CONFIG_FILE } from "../config/defaults.js";
import { loadConfig } from "../config/load.js";
import { err, ok, type Result } from "../core/result.js";
import { appendDelegationDigest } from "../logging/delegation-digest.js";
import { appendRunLogEntry } from "../logging/run-log.js";
import { acquireLockfile, releaseLockfile } from "../locks/lockfile.js";
import { readState, writeState } from "../state/store.js";
import { validateTransition } from "../workflow/transitions.js";

export type ClearDelegatedUserPlanApprovalInput = {
  workspace?: string;
  configPath?: string;
  verdictPath: string;
  verdict: PlanReviewVerdict;
};

export async function clearDelegatedUserPlanApproval(
  input: ClearDelegatedUserPlanApprovalInput,
): Promise<Result<string>> {
  const workspace = input.workspace ?? process.cwd();
  const configPath = input.configPath ?? DEFAULT_CONFIG_FILE;
  const loadedConfig = await loadConfig({ cwd: workspace, configPath });
  if (!loadedConfig.ok) return err(loadedConfig.error);
  const config = loadedConfig.value;
  const statePath = resolvePath(workspace, join(config.workspace.stateDir, "workflow_state.json"));
  const lockPath = resolvePath(workspace, join(config.workspace.stateDir, "agent-flow.lock"));
  const lock = await acquireLockfile(lockPath, "agent-flow delegated gate clear");
  if (!lock.ok) return err(lock.error);

  try {
    const state = await readState(statePath);
    if (!state.ok) return err(state.error);
    if (state.value.phase !== "user_plan_approval" || state.value.currentActor !== "user") {
      return err({
        code: "DELEGATION_GATE_MISMATCH",
        path: "$.phase",
        message: "Delegated auto-clear requires user_plan_approval user gate.",
      });
    }

    const transition = validateTransition("user_plan_approval", "task_classification");
    if (!transition.ok) return transition;

    const logDir = resolvePath(workspace, config.workspace.logDir);
    const transitionText = "user_plan_approval -> task_classification" as const;
    const digest = await appendDelegationDigest({
      logDir,
      autoPasses: [
        {
          gate: "user_plan_approval",
          phase: "user_plan_approval",
          transition: transitionText,
          verdictPath: input.verdictPath,
          runId: input.verdict.runId,
          status: input.verdict.status,
          blocking: input.verdict.blocking,
          major: input.verdict.major,
          minor: input.verdict.minor,
          iteration: input.verdict.iteration,
        },
      ],
      finalStopReason: "Delegated user_plan_approval auto-cleared",
    });
    if (!digest.ok) return err(digest.error);

    const runLog = await appendRunLogEntry({
      logDir,
      entry: {
        timestamp: new Date().toISOString(),
        outcome: "delegated_auto_pass",
        gate: "user_plan_approval",
        transition: transitionText,
        verdictPath: input.verdictPath,
        verdict: input.verdict,
      },
    });
    if (!runLog.ok) return err(runLog.error);

    const updated = {
      ...state.value,
      phase: "task_classification" as const,
      status: "ready" as const,
      currentActor: "implementation" as const,
      nextActor: "implementation" as const,
      lastActor: "user" as const,
      lastAction: "Delegated auto-clear: user_plan_approval",
      updatedAt: new Date().toISOString(),
    };
    const written = await writeState(statePath, updated);
    if (!written.ok) return err(written.error);

    return ok("Delegated auto-clear: user_plan_approval -> task_classification");
  } finally {
    await releaseLockfile(lock.value);
  }
}

function resolvePath(workspace: string, path: string): string {
  return isAbsolute(path) ? path : join(workspace, path);
}
