import * as assert from "node:assert/strict";
import { test } from "node:test";
import { getActorForPhase } from "../../src/workflow/actors.js";
import { PHASES } from "../../src/workflow/phases.js";

test("phase actor ownership follows the approved workflow map", () => {
  const implementationPhases = [
    "requirement_understanding",
    "spec_creation",
    "spec_review_response",
    "plan_creation",
    "plan_review_response",
    "task_classification",
    "implementation",
    "implementation_review_response",
    "testing",
    "final_handoff",
  ];
  const reviewPhases = ["spec_review", "plan_review", "implementation_review"];
  const userPhases = ["user_spec_review", "user_plan_approval", "user_verification"];

  for (const phase of implementationPhases) {
    assert.equal(getActorForPhase(phase), "implementation", phase);
  }
  for (const phase of reviewPhases) {
    assert.equal(getActorForPhase(phase), "review", phase);
  }
  for (const phase of userPhases) {
    assert.equal(getActorForPhase(phase), "user", phase);
  }
  assert.equal(getActorForPhase("done"), "none");
});

test("PHASES exports the canonical phase list in order", () => {
  assert.deepEqual(PHASES, [
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
  ]);
});
