import { access, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { DEFAULT_CONFIG_FILE } from "../config/defaults.js";
import { loadConfig } from "../config/load.js";
import { err, ok, type Result } from "../core/result.js";
import { readState } from "../state/store.js";
import type { WorkflowState } from "../state/schema.js";

export type StatusOptions = {
  workspace?: string;
  configPath?: string;
};

export async function statusCommand(options: StatusOptions = {}): Promise<Result<string>> {
  const workspace = options.workspace ?? process.cwd();
  const configPath = options.configPath ?? DEFAULT_CONFIG_FILE;

  const config = await loadConfig({ cwd: workspace, configPath });
  if (!config.ok && config.error.code === "CONFIG_NOT_FOUND") {
    return ok(notInitializedMessage(workspace));
  }
  if (!config.ok) return err(config.error);

  const statePath = resolvePath(workspace, join(config.value.workspace.stateDir, "workflow_state.json"));
  if (!(await exists(statePath))) {
    return ok(notInitializedMessage(workspace));
  }

  const state = await readState(statePath);
  if (!state.ok) return err(state.error);

  const delegationDigest = await readDelegationDigestSummary(workspace, config.value.workspace.logDir);

  return ok(formatStatus(state.value, delegationDigest));
}

type DelegationDigestSummary = {
  pointer: string;
  autoPassCount: number;
};

function formatStatus(
  state: WorkflowState,
  delegationDigest: DelegationDigestSummary | null = null,
): string {
  const activeGates = Object.entries(state.gates)
    .filter(([, gate]) => gate.active)
    .map(([name, gate]) => `${name}: ${gate.reason}`);
  const lock = state.lock.locked
    ? `locked by ${state.lock.lockedBy ?? "unknown"} (${state.lock.lockReason ?? "no reason"})`
    : "unlocked";

  const lines = [
    `Phase: ${state.phase}`,
    `Status: ${state.status}`,
    `Current actor: ${state.currentActor}`,
    `Next actor: ${state.nextActor}`,
    `Active gates: ${activeGates.length === 0 ? "none" : activeGates.join("; ")}`,
    `Lock: ${lock}`,
    `Next required action: ${nextRequiredAction(state)}`,
  ];
  if (delegationDigest !== null) {
    lines.push(
      `Delegation digest: ${delegationDigest.pointer}`,
      `Delegated auto-passes: ${delegationDigest.autoPassCount}`,
    );
  }
  return lines.join("\n");
}

function nextRequiredAction(state: WorkflowState): string {
  if (state.status === "done") {
    return "Workflow complete.";
  }
  if (state.lock.locked) {
    return "Resolve the active lock before continuing.";
  }
  const activeGate = Object.values(state.gates).find((gate) => gate.active);
  if (activeGate !== undefined) {
    return activeGate.reason;
  }
  return `Run the ${state.nextActor} step for ${state.phase}.`;
}

function notInitializedMessage(workspace: string): string {
  return [
    "Agent Flow is not initialized.",
    `Workspace: ${workspace}`,
    "Next required action: run agent-flow init",
  ].join("\n");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readDelegationDigestSummary(
  workspace: string,
  logDir: string,
): Promise<DelegationDigestSummary | null> {
  const latestPath = resolvePath(workspace, join(logDir, "delegation_digest_latest.md"));
  if (!(await exists(latestPath))) {
    return null;
  }

  const source = await readFile(latestPath, "utf8");
  return {
    pointer: `${logDir}/delegation_digest_latest.md`,
    autoPassCount: (source.match(/Gate: user_plan_approval/g) ?? []).length,
  };
}

function resolvePath(workspace: string, path: string): string {
  return isAbsolute(path) ? path : join(workspace, path);
}
