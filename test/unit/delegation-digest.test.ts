import * as assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { appendDelegationDigest } from "../../src/logging/delegation-digest.js";

test("appendDelegationDigest writes history and latest pointer", async () => {
  const logDir = await mkdtemp(join(tmpdir(), "agent-flow-digest-"));

  const result = await appendDelegationDigest({
    logDir,
    autoPasses: [
      {
        gate: "user_plan_approval",
        phase: "user_plan_approval",
        transition: "user_plan_approval -> task_classification",
        verdictPath: ".agent/artifacts/plan_review_verdict.json",
        runId: "run-1",
        status: "Approved",
        blocking: 0,
        major: 0,
        minor: 0,
        iteration: 1,
      },
    ],
    finalStopReason: "Stopped at user gate: user_verification",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.historyPath.endsWith("delegation_digest.md"), true);
  assert.equal(result.value.latestPath.endsWith("delegation_digest_latest.md"), true);
  assert.match(await readFile(result.value.historyPath, "utf8"), /user_plan_approval/);
  assert.match(await readFile(result.value.latestPath, "utf8"), /Stopped at user gate: user_verification/);
});
