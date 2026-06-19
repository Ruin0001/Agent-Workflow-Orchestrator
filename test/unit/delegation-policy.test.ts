import * as assert from "node:assert/strict";
import { test } from "node:test";
import { validatePlanReviewVerdict } from "../../src/artifacts/review-verdict.js";
import { applyConfigDefaults } from "../../src/config/defaults.js";
import {
  canDelegateUserPlanApproval,
  DELEGABLE_GATES_V1,
  HARD_FLOOR_GATES,
  KEPT_USER_GATES,
} from "../../src/workflow/delegation-policy.js";

test("delegation policy constants keep v1 scope narrow", () => {
  assert.deepEqual(DELEGABLE_GATES_V1, ["user_plan_approval"]);
  assert.deepEqual(KEPT_USER_GATES, ["user_spec_review"]);
  assert.equal(HARD_FLOOR_GATES.includes("destructive_action"), true);
});

test("canDelegateUserPlanApproval requires config, flag, strict verdict, and matching runId", () => {
  const config = applyConfigDefaults({
    version: 1,
    delegation: { enabled: true, delegatedGates: ["user_plan_approval"] },
  });
  const verdict = validatePlanReviewVerdict({
    runId: "step-1",
    phase: "plan_review",
    status: "Approved",
    blocking: 0,
    major: 0,
    minor: 0,
    iteration: 1,
  });
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;

  const decision = canDelegateUserPlanApproval({
    config,
    delegatedFlag: true,
    verdict: verdict.value,
    expectedRunId: "step-1",
  });

  assert.deepEqual(decision, { ok: true });
});

test("canDelegateUserPlanApproval rejects disabled config and stale verdicts", () => {
  const config = applyConfigDefaults({ version: 1 });
  const verdict = validatePlanReviewVerdict({
    runId: "old",
    phase: "plan_review",
    status: "Approved",
    blocking: 0,
    major: 0,
    minor: 0,
    iteration: 1,
  });
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;

  assert.equal(
    canDelegateUserPlanApproval({
      config,
      delegatedFlag: true,
      verdict: verdict.value,
      expectedRunId: "old",
    }).ok,
    false,
  );

  const enabled = applyConfigDefaults({
    version: 1,
    delegation: { enabled: true, delegatedGates: ["user_plan_approval"] },
  });
  assert.equal(
    canDelegateUserPlanApproval({
      config: enabled,
      delegatedFlag: true,
      verdict: verdict.value,
      expectedRunId: "new",
    }).ok,
    false,
  );
});

test("canDelegateUserPlanApproval rejects missing delegated flag and below-bar verdicts", () => {
  const config = applyConfigDefaults({
    version: 1,
    delegation: { enabled: true, delegatedGates: ["user_plan_approval"] },
  });
  const verdict = validatePlanReviewVerdict({
    runId: "step-1",
    phase: "plan_review",
    status: "Approved",
    blocking: 0,
    major: 1,
    minor: 0,
    iteration: 1,
  });
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;

  assert.equal(
    canDelegateUserPlanApproval({
      config,
      delegatedFlag: false,
      verdict: verdict.value,
      expectedRunId: "step-1",
    }).ok,
    false,
  );
  assert.equal(
    canDelegateUserPlanApproval({
      config,
      delegatedFlag: true,
      verdict: verdict.value,
      expectedRunId: "step-1",
    }).ok,
    false,
  );
});
