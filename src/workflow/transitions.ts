import { validationError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { isWorkflowPhase, type WorkflowPhase } from "./phases.js";

export const ALLOWED_TRANSITIONS: Record<WorkflowPhase, readonly WorkflowPhase[]> = {
  requirement_understanding: ["spec_creation"],
  spec_creation: ["spec_review"],
  spec_review: ["spec_review_response", "user_spec_review"],
  spec_review_response: ["spec_review"],
  user_spec_review: ["plan_creation"],
  plan_creation: ["plan_review"],
  plan_review: ["plan_review_response", "user_plan_approval"],
  plan_review_response: ["plan_review"],
  user_plan_approval: ["task_classification"],
  task_classification: ["implementation"],
  implementation: ["implementation_review"],
  implementation_review: ["implementation_review_response", "testing"],
  implementation_review_response: ["implementation_review"],
  testing: ["user_verification"],
  user_verification: ["final_handoff"],
  final_handoff: ["done"],
  done: [],
};

export function getAllowedNextPhases(phase: WorkflowPhase): readonly WorkflowPhase[] {
  return ALLOWED_TRANSITIONS[phase];
}

export function canTransition(from: WorkflowPhase, to: WorkflowPhase): boolean;
export function canTransition(from: string, to: string): boolean;
export function canTransition(from: string, to: string): boolean {
  if (!isWorkflowPhase(from) || !isWorkflowPhase(to)) {
    return false;
  }

  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function validateTransition(from: string, to: string): Result<void> {
  if (!isWorkflowPhase(from)) {
    return err(validationError("$.transition", `Invalid transition from unknown phase: ${from}`));
  }
  if (!isWorkflowPhase(to)) {
    return err(validationError("$.transition", `Invalid transition to unknown phase: ${to}`));
  }
  if (!canTransition(from, to)) {
    return err(validationError("$.transition", `Invalid transition: ${from} -> ${to}`));
  }

  return ok(undefined);
}
