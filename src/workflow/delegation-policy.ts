import type { PlanReviewVerdict } from "../artifacts/review-verdict.js";
import { strictBarPasses } from "../artifacts/review-verdict.js";
import type { AgentFlowConfig } from "../config/schema.js";

export const DELEGABLE_GATES_V1 = ["user_plan_approval"] as const;
export const KEPT_USER_GATES = ["user_spec_review"] as const;
export const HARD_FLOOR_GATES = [
  "destructive_action",
  "always_protected_path",
  "credential_access",
  "production_data_access",
  "external_service_access",
  "approved_plan_deviation",
] as const;

export type DelegationDecision = { ok: true } | { ok: false; reason: string };

export function canDelegateUserPlanApproval(input: {
  config: AgentFlowConfig;
  delegatedFlag: boolean;
  verdict: PlanReviewVerdict;
  expectedRunId: string | null;
}): DelegationDecision {
  if (!input.delegatedFlag) {
    return { ok: false, reason: "Delegated flag is not set" };
  }
  if (!input.config.delegation.enabled) {
    return { ok: false, reason: "Delegation is disabled" };
  }
  if (!input.config.delegation.delegatedGates.includes("user_plan_approval")) {
    return { ok: false, reason: "user_plan_approval is not delegated" };
  }
  if (input.expectedRunId === null || input.verdict.runId !== input.expectedRunId) {
    return { ok: false, reason: "Plan review verdict runId does not match this delegated run" };
  }
  if (!strictBarPasses(input.verdict)) {
    return { ok: false, reason: "Plan review verdict does not satisfy approved_no_blocking_no_major" };
  }
  return { ok: true };
}
