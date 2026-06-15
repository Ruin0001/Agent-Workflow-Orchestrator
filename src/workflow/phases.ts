export const PHASES = [
  "requirement_understanding",
  "spec_creation",
  "spec_review",
  "spec_review_response",
  "user_spec_review",
  "plan_creation",
  "plan_review",
  "plan_review_response",
  "user_plan_approval",
  "task_classification",
  "implementation",
  "implementation_review",
  "implementation_review_response",
  "testing",
  "user_verification",
  "final_handoff",
  "done",
] as const;

export type WorkflowPhase = (typeof PHASES)[number];

const phaseSet = new Set<string>(PHASES);

export function isWorkflowPhase(input: unknown): input is WorkflowPhase {
  return typeof input === "string" && phaseSet.has(input);
}
