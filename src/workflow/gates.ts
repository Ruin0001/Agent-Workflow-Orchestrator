import type { AgentFlowConfig } from "../config/schema.js";
import { err, ok, type Result } from "../core/result.js";
import type { WorkflowState } from "../state/schema.js";
import type { WorkflowPhase } from "./phases.js";

const reviewLimitByPhase = {
  spec_review: "maxSpecReviewIterations",
  plan_review: "maxPlanReviewIterations",
  implementation_review: "maxImplementationReviewIterations",
} as const satisfies Record<
  ReviewPhase,
  keyof Pick<
    AgentFlowConfig["limits"],
    | "maxSpecReviewIterations"
    | "maxPlanReviewIterations"
    | "maxImplementationReviewIterations"
  >
>;

type ReviewPhase = "spec_review" | "plan_review" | "implementation_review";

export function evaluateNextGates(
  state: WorkflowState,
  config: AgentFlowConfig,
  proposedNextPhase: WorkflowPhase,
): Result<void> {
  for (const [name, gate] of Object.entries(state.gates)) {
    if (gate.active) {
      return err({
        code: "USER_GATE_ACTIVE",
        message: `User gate is active: ${name}`,
        path: "$.gates",
        details: { gate: name, reason: gate.reason },
      });
    }
  }

  if (isReviewPhase(proposedNextPhase)) {
    const count = state.iterationCounters[proposedNextPhase];
    const limit = config.limits[reviewLimitByPhase[proposedNextPhase]];
    if (count >= limit) {
      return err({
        code: "ITERATION_LIMIT_EXCEEDED",
        message: `Iteration limit reached for ${proposedNextPhase}`,
        path: `$.iterationCounters.${proposedNextPhase}`,
        details: { count, limit },
      });
    }
  }

  return ok(undefined);
}

function isReviewPhase(phase: WorkflowPhase): phase is ReviewPhase {
  return (
    phase === "spec_review" ||
    phase === "plan_review" ||
    phase === "implementation_review"
  );
}
