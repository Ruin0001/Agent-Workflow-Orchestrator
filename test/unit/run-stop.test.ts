import * as assert from "node:assert/strict";
import { test } from "node:test";
import { applyConfigDefaults } from "../../src/config/defaults.js";
import { createInitialState, type WorkflowState } from "../../src/state/schema.js";
import { evaluateRunStop } from "../../src/workflow/run-stop.js";

function baseState(): WorkflowState {
  return createInitialState(applyConfigDefaults({ version: 1 }));
}

test("evaluateRunStop continues for implementation and review actors", () => {
  const implementationState = baseState();
  assert.deepEqual(evaluateRunStop(implementationState), {
    action: "continue",
    phase: "requirement_understanding",
    actor: "implementation",
  });

  const reviewState = baseState();
  reviewState.phase = "spec_review";
  reviewState.currentActor = "review";
  reviewState.nextActor = "review";

  assert.deepEqual(evaluateRunStop(reviewState), {
    action: "continue",
    phase: "spec_review",
    actor: "review",
  });
});

test("evaluateRunStop stops on user-owned phases", () => {
  const state = baseState();
  state.phase = "user_spec_review";
  state.status = "waiting_for_user";
  state.currentActor = "user";
  state.nextActor = "user";

  const decision = evaluateRunStop(state);

  assert.equal(decision.action, "stop");
  if (decision.action === "stop") {
    assert.equal(decision.reason, "user_gate");
    assert.equal(decision.phase, "user_spec_review");
    assert.equal(decision.actor, "user");
    assert.equal(decision.gateName, undefined);
    assert.match(decision.message, /Stopped at user gate: user_spec_review/);
  }
});

test("evaluateRunStop stops on active explicit gates for any actor", () => {
  const state = baseState();
  state.gates.approval = {
    active: true,
    reason: "Need approval",
    requestedAt: "2026-06-16T00:00:00.000Z",
  };

  const decision = evaluateRunStop(state);

  assert.equal(decision.action, "stop");
  if (decision.action === "stop") {
    assert.equal(decision.reason, "user_gate");
    assert.equal(decision.gateName, "approval");
    assert.equal(decision.gateReason, "Need approval");
    assert.match(decision.message, /Stopped at user gate: approval/);
  }
});

test("evaluateRunStop stops on done state", () => {
  const state = baseState();
  state.phase = "done";
  state.status = "done";
  state.currentActor = "none";
  state.nextActor = "none";

  const decision = evaluateRunStop(state);

  assert.equal(decision.action, "stop");
  if (decision.action === "stop") {
    assert.equal(decision.reason, "done");
    assert.equal(decision.phase, "done");
    assert.equal(decision.actor, "none");
    assert.equal(decision.message, "Workflow already done");
  }
});
