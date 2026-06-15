import * as assert from "node:assert/strict";
import { test } from "node:test";
import { applyConfigDefaults } from "../../src/config/defaults.js";
import { createInitialState } from "../../src/state/schema.js";
import { evaluateNextGates } from "../../src/workflow/gates.js";
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  validateTransition,
} from "../../src/workflow/transitions.js";

test("validateTransition accepts only approved workflow transitions", () => {
  assert.equal(canTransition("requirement_understanding", "spec_creation"), true);
  assert.equal(canTransition("spec_review", "spec_review_response"), true);
  assert.equal(canTransition("spec_review", "user_spec_review"), true);
  assert.equal(canTransition("final_handoff", "done"), true);

  const result = validateTransition("spec_creation", "plan_creation");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.path, "$.transition");
    assert.match(result.error.message, /invalid transition/i);
  }
});

test("ALLOWED_TRANSITIONS contains the complete workflow transition table", () => {
  assert.deepEqual(ALLOWED_TRANSITIONS, {
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
  });
});

test("canTransition matches every entry in ALLOWED_TRANSITIONS", () => {
  for (const [from, allowed] of Object.entries(ALLOWED_TRANSITIONS)) {
    for (const to of Object.keys(ALLOWED_TRANSITIONS)) {
      assert.equal(
        canTransition(from, to),
        allowed.includes(to as (typeof allowed)[number]),
        `${from} -> ${to}`,
      );
    }
  }
});

test("validateTransition rejects unknown from and to phases", () => {
  const unknownFrom = validateTransition("surprise_phase", "spec_creation");
  const unknownTo = validateTransition("spec_creation", "surprise_phase");

  assert.equal(canTransition("surprise_phase", "spec_creation"), false);
  assert.equal(canTransition("spec_creation", "surprise_phase"), false);
  assert.equal(unknownFrom.ok, false);
  if (!unknownFrom.ok) {
    assert.equal(unknownFrom.error.path, "$.transition");
    assert.match(unknownFrom.error.message, /from unknown phase/i);
  }
  assert.equal(unknownTo.ok, false);
  if (!unknownTo.ok) {
    assert.equal(unknownTo.error.path, "$.transition");
    assert.match(unknownTo.error.message, /to unknown phase/i);
  }
});

test("active user gate blocks next", () => {
  const config = applyConfigDefaults({ version: 1 });
  const state = {
    ...createInitialState(config),
    phase: "user_plan_approval" as const,
    status: "waiting_for_user" as const,
    currentActor: "user" as const,
    nextActor: "user" as const,
    gates: {
      user_plan_approval: {
        active: true,
        reason: "User must approve the plan.",
      },
    },
  };

  const result = evaluateNextGates(state, config, "task_classification");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "USER_GATE_ACTIVE");
    assert.match(result.error.message, /user_plan_approval/);
  }
});

test("review iteration below the limit allows the next review loop", () => {
  const config = applyConfigDefaults({
    version: 1,
    limits: { maxSpecReviewIterations: 2 },
  });
  const state = {
    ...createInitialState(config),
    phase: "spec_review_response" as const,
    iterationCounters: {
      spec_review: 1,
      plan_review: 0,
      implementation_review: 0,
    },
  };

  const result = evaluateNextGates(state, config, "spec_review");

  assert.equal(result.ok, true);
});

test("review iteration limit blocks the next review loop", () => {
  const config = applyConfigDefaults({
    version: 1,
    limits: { maxSpecReviewIterations: 2 },
  });
  const state = {
    ...createInitialState(config),
    phase: "spec_review_response" as const,
    iterationCounters: {
      spec_review: 2,
      plan_review: 0,
      implementation_review: 0,
    },
  };

  const result = evaluateNextGates(state, config, "spec_review");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "ITERATION_LIMIT_EXCEEDED");
    assert.match(result.error.message, /spec_review/);
  }
});
