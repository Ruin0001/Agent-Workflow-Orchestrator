import type { WorkflowPhase } from "./phases.js";

export type WorkflowActor = "implementation" | "review" | "user" | "none";

export const ACTOR_BY_PHASE: Record<WorkflowPhase, WorkflowActor> = {
  requirement_understanding: "implementation",
  spec_creation: "implementation",
  spec_review: "review",
  spec_review_response: "implementation",
  user_spec_review: "user",
  plan_creation: "implementation",
  plan_review: "review",
  plan_review_response: "implementation",
  user_plan_approval: "user",
  task_classification: "implementation",
  implementation: "implementation",
  implementation_review: "review",
  implementation_review_response: "implementation",
  testing: "implementation",
  user_verification: "user",
  final_handoff: "implementation",
  done: "none",
};

export function getActorForPhase(phase: WorkflowPhase): WorkflowActor;
export function getActorForPhase(phase: string): WorkflowActor | undefined;
export function getActorForPhase(phase: string): WorkflowActor | undefined {
  return ACTOR_BY_PHASE[phase as WorkflowPhase];
}
