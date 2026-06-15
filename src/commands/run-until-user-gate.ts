import { isAbsolute, join } from "node:path";
import { DEFAULT_CONFIG_FILE } from "../config/defaults.js";
import { loadConfig } from "../config/load.js";
import { err, ok, type Result } from "../core/result.js";
import { readState } from "../state/store.js";
import { evaluateRunStop, type RunStopDecision } from "../workflow/run-stop.js";
import { nextCommand } from "./next.js";

export const RUN_UNTIL_USER_GATE_MAX_STEPS = 20;

export type RunUntilUserGateOptions = {
  workspace?: string;
  configPath?: string;
};

export async function runUntilUserGateCommand(
  options: RunUntilUserGateOptions = {},
): Promise<Result<string>> {
  const workspace = options.workspace ?? process.cwd();
  const configPath = options.configPath ?? DEFAULT_CONFIG_FILE;
  const loadedConfig = await loadConfig({ cwd: workspace, configPath });
  if (!loadedConfig.ok) return err(loadedConfig.error);

  const config = loadedConfig.value;
  const statePath = resolvePath(workspace, join(config.workspace.stateDir, "workflow_state.json"));
  const stepResults: string[] = [];

  for (let stepsRun = 0; stepsRun <= RUN_UNTIL_USER_GATE_MAX_STEPS; stepsRun += 1) {
    const stateResult = await readState(statePath);
    if (!stateResult.ok) return err(stateResult.error);

    const decision = evaluateRunStop(stateResult.value);
    if (decision.action === "stop") {
      return ok(formatRunSummary(decision, stepsRun, stepResults));
    }

    if (stepsRun === RUN_UNTIL_USER_GATE_MAX_STEPS) {
      return err({
        code: "RUN_UNTIL_USER_GATE_MAX_STEPS",
        path: statePath,
        message: `Stopped after ${RUN_UNTIL_USER_GATE_MAX_STEPS} steps without reaching a user gate.`,
        details: {
          phase: decision.phase,
          actor: decision.actor,
          stepsRun,
        },
      });
    }

    const nextResult = await nextCommand({ workspace, configPath });
    if (!nextResult.ok) return err(nextResult.error);
    stepResults.push(nextResult.value);
  }

  return err({
    code: "INTERNAL_ERROR",
    message: "run-until-user-gate reached an unexpected terminal state",
  });
}

export default runUntilUserGateCommand;

function formatRunSummary(
  decision: Extract<RunStopDecision, { action: "stop" }>,
  stepsRun: number,
  stepResults: string[],
): string {
  const details = [`Steps run: ${stepsRun}`];
  if (decision.gateReason !== undefined) {
    details.push(`Gate reason: ${decision.gateReason}`);
  }
  return withRunSummary(decision.message, details, stepResults);
}

function withRunSummary(message: string, details: string[], stepResults: string[]): string {
  const lines = [message, ...details];
  if (stepResults.length > 0) {
    lines.push("", "Step results:", ...stepResults.map((result, index) => `${index + 1}. ${result}`));
  }
  return lines.join("\n");
}

function resolvePath(workspace: string, path: string): string {
  return isAbsolute(path) ? path : join(workspace, path);
}
