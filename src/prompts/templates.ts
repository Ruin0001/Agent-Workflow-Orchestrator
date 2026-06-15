import type { WorkflowPhase } from "../workflow/phases.js";

export const PROMPT_TEMPLATES: Record<WorkflowPhase, string> = {
  requirement_understanding:
    "Understand the task, identify constraints, and write the requirement understanding artifact.",
  spec_creation:
    "Create a concise implementation spec from the approved requirements.",
  spec_review:
    "Review the spec for correctness, scope control, safety, and missing decisions.",
  spec_review_response:
    "Address the spec review findings and update the relevant artifacts.",
  user_spec_review:
    "Stop for user spec review. Do not continue without approval.",
  plan_creation:
    "Create an implementation plan and allowed change manifest.",
  plan_review:
    "Review the plan for feasibility, risk, manifest coverage, and verification.",
  plan_review_response:
    "Address the plan review findings and update the relevant artifacts.",
  user_plan_approval:
    "Stop for user plan approval. Do not continue without approval.",
  task_classification:
    "Classify task risk and complexity before implementation.",
  implementation:
    "Implement only the approved plan, update implementation notes, and preserve guardrails.",
  implementation_review:
    "Review implementation for plan compliance, defects, tests, and safety.",
  implementation_review_response:
    "Address implementation review findings without expanding scope.",
  testing:
    "Run configured verification and record test results.",
  user_verification:
    "Stop for user verification. Do not continue without approval.",
  final_handoff:
    "Summarize completed work, verification evidence, risks, and next action.",
  done:
    "Workflow is complete. No agent action is required.",
};
