import * as assert from "node:assert/strict";
import { test } from "node:test";
import { resolveArtifactPaths } from "../../src/artifacts/paths.js";
import { validateAllowedChangeManifest } from "../../src/artifacts/manifest.js";
import {
  strictBarPasses,
  validatePlanReviewVerdict,
} from "../../src/artifacts/review-verdict.js";
import { applyConfigDefaults } from "../../src/config/defaults.js";

test("resolveArtifactPaths maps standard artifacts under the configured artifact directory", () => {
  const config = applyConfigDefaults({
    version: 1,
    workspace: { artifactDir: "custom/artifacts" },
    artifacts: { allowedChangeManifest: "custom/manifest.json" },
  });

  const paths = resolveArtifactPaths(config);

  assert.equal(paths.requirement_understanding, "custom/artifacts/requirement_understanding.md");
  assert.equal(paths.spec, "custom/artifacts/spec.md");
  assert.equal(paths.final_handoff, "custom/artifacts/final_handoff.md");
  assert.equal(paths.allowed_change_manifest, "custom/manifest.json");
});

test("resolveArtifactPaths prefers state artifact overrides when available", () => {
  const config = applyConfigDefaults({ version: 1 });

  const paths = resolveArtifactPaths(config, {
    artifacts: {
      spec: "state/spec.md",
      allowed_change_manifest: "state/manifest.json",
    },
  });

  assert.equal(paths.spec, "state/spec.md");
  assert.equal(paths.plan, ".agent/artifacts/plan.md");
  assert.equal(paths.allowed_change_manifest, "state/manifest.json");
});

test("resolveArtifactPaths includes plan_review_verdict artifact", () => {
  const config = applyConfigDefaults({ version: 1 });

  const paths = resolveArtifactPaths(config);

  assert.equal(paths.plan_review_verdict, ".agent/artifacts/plan_review_verdict.json");
});

test("validateAllowedChangeManifest accepts the machine-readable manifest contract", () => {
  const result = validateAllowedChangeManifest({
    filesToInspect: ["src/foo.ts"],
    filesToModify: ["src/foo.ts"],
    filesToCreate: ["src/foo.test.ts"],
    forbiddenPaths: [".env"],
    dependencyChanges: { allowed: false },
    migrationChanges: { allowed: false },
    destructiveActions: { allowed: false },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.filesToCreate, ["src/foo.test.ts"]);
  }
});

test("validateAllowedChangeManifest returns path-aware errors", () => {
  const result = validateAllowedChangeManifest({
    filesToInspect: ["src/foo.ts"],
    filesToModify: ["src/foo.ts"],
    filesToCreate: ["src/foo.test.ts"],
    forbiddenPaths: [".env"],
    dependencyChanges: { allowed: "no" },
    migrationChanges: { allowed: false },
    destructiveActions: { allowed: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.path, "$.dependencyChanges.allowed");
    assert.match(result.error.message, /boolean/i);
  }
});

test("validatePlanReviewVerdict accepts strict approved verdicts", () => {
  const result = validatePlanReviewVerdict({
    runId: "run-1",
    phase: "plan_review",
    status: "Approved",
    blocking: 0,
    major: 0,
    minor: 1,
    iteration: 1,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.runId, "run-1");
    assert.equal(strictBarPasses(result.value), true);
  }
});

test("validatePlanReviewVerdict rejects wrong phase and stale runId shape", () => {
  const wrongPhase = validatePlanReviewVerdict({
    runId: "run-1",
    phase: "implementation_review",
    status: "Approved",
    blocking: 0,
    major: 0,
    minor: 0,
    iteration: 1,
  });

  assert.equal(wrongPhase.ok, false);
  if (!wrongPhase.ok) assert.equal(wrongPhase.error.path, "$.phase");

  const emptyRunId = validatePlanReviewVerdict({
    runId: "",
    phase: "plan_review",
    status: "Approved",
    blocking: 0,
    major: 0,
    minor: 0,
    iteration: 1,
  });

  assert.equal(emptyRunId.ok, false);
  if (!emptyRunId.ok) assert.equal(emptyRunId.error.path, "$.runId");
});

test("strictBarPasses rejects blocking or major findings", () => {
  const verdict = validatePlanReviewVerdict({
    runId: "run-1",
    phase: "plan_review",
    status: "Approved",
    blocking: 0,
    major: 1,
    minor: 0,
    iteration: 1,
  });

  assert.equal(verdict.ok, true);
  if (verdict.ok) {
    assert.equal(strictBarPasses(verdict.value), false);
  }
});
