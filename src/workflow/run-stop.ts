import type { WorkflowState } from "../state/schema.js";
import type { WorkflowActor } from "./actors.js";
import type { WorkflowPhase } from "./phases.js";

export type RunStopDecision =
  | {
      action: "stop";
      reason: "user_gate" | "done";
      phase: WorkflowPhase;
      actor: WorkflowActor;
      message: string;
      gateName?: string;
      gateReason?: string;
    }
  | {
      action: "continue";
      phase: WorkflowPhase;
      actor: WorkflowActor;
    };

export function evaluateRunStop(state: WorkflowState): RunStopDecision {
  if (state.status === "done" || state.currentActor === "none") {
    return {
      action: "stop",
      reason: "done",
      phase: state.phase,
      actor: state.currentActor,
      message: "Workflow already done",
    };
  }

  const activeGate = Object.entries(state.gates).find(([, gate]) => gate.active);
  if (activeGate !== undefined) {
    const [gateName, gate] = activeGate;
    return {
      action: "stop",
      reason: "user_gate",
      phase: state.phase,
      actor: state.currentActor,
      message: `Stopped at user gate: ${gateName}`,
      gateName,
      gateReason: gate.reason,
    };
  }

  if (state.currentActor === "user") {
    return {
      action: "stop",
      reason: "user_gate",
      phase: state.phase,
      actor: state.currentActor,
      message: `Stopped at user gate: ${state.phase}`,
    };
  }

  return {
    action: "continue",
    phase: state.phase,
    actor: state.currentActor,
  };
}
