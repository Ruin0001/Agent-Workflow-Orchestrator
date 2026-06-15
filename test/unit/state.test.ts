import * as assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { applyConfigDefaults } from "../../src/config/defaults.js";
import { createInitialState, validateState } from "../../src/state/schema.js";
import { createStateTempPath, readState, writeState } from "../../src/state/store.js";

async function tempWorkspace(): Promise<string> {
  const path = join(tmpdir(), `agent-flow-state-${Date.now()}-${Math.random()}`);
  await mkdir(path, { recursive: true });
  return path;
}

test("createInitialState returns a valid workflow state", () => {
  const config = applyConfigDefaults({ version: 1 });
  const state = createInitialState(config);
  const result = validateState(state);

  assert.equal(result.ok, true);
  assert.equal(state.workflow, "standard");
  assert.equal(state.version, 1);
  assert.equal(state.phase, "requirement_understanding");
  assert.equal(state.status, "ready");
  assert.equal(state.currentActor, "implementation");
  assert.equal(state.nextActor, "implementation");
  assert.equal(state.lock.locked, false);
  assert.deepEqual(state.iterationCounters, {
    spec_review: 0,
    plan_review: 0,
    implementation_review: 0,
  });
});

test("createInitialState clones agent configs without sharing args arrays", () => {
  const config = applyConfigDefaults({
    version: 1,
    agents: {
      implementation: { args: ["exec", "--model", "gpt-5"] },
      review: { args: ["-p", "--strict"] },
    },
  });
  const state = createInitialState(config);

  config.agents.implementation.args.push("--mutated-config");
  state.agents.review.args.push("--mutated-state");

  assert.deepEqual(state.agents.implementation.args, ["exec", "--model", "gpt-5"]);
  assert.deepEqual(config.agents.review.args, ["-p", "--strict"]);
});

test("validateState rejects an unknown phase", () => {
  const config = applyConfigDefaults({ version: 1 });
  const state = createInitialState(config);

  const result = validateState({ ...state, phase: "surprise_phase" });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.path, "$.phase");
    assert.match(result.error.message, /unknown phase/i);
  }
});

test("validateState reports dynamic gate keys with bracket notation", () => {
  const config = applyConfigDefaults({ version: 1 });
  const state = createInitialState(config);

  const result = validateState({
    ...state,
    gates: {
      "user.decision": {
        active: "yes",
        reason: "User must decide.",
      },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.path, '$.gates["user.decision"].active');
    assert.match(result.error.message, /boolean/i);
  }
});

test("readState returns validation error without mutating invalid state file", async () => {
  const dir = await tempWorkspace();
  const statePath = join(dir, "workflow_state.json");
  const invalidState = JSON.stringify({ version: 1, phase: "surprise_phase" }, null, 2);
  await writeFile(statePath, invalidState, "utf8");

  const result = await readState(statePath);

  assert.equal(result.ok, false);
  assert.equal(await readFile(statePath, "utf8"), invalidState);
});

test("writeState temp paths are unique within the same millisecond", async () => {
  const dir = await tempWorkspace();
  const statePath = join(dir, "workflow_state.json");
  const originalNow = Date.now;
  Date.now = () => 1234567890;

  try {
    const tempPaths = Array.from({ length: 8 }, () => createStateTempPath(statePath));

    assert.equal(new Set(tempPaths).size, tempPaths.length);
    for (const tempPath of tempPaths) {
      assert.match(tempPath, /workflow_state\.json\.\d+\.1234567890\..+\.tmp$/);
    }
  } finally {
    Date.now = originalNow;
  }
});

test("writeState persists validated JSON state", async () => {
  const dir = await tempWorkspace();
  const statePath = join(dir, "workflow_state.json");
  const state = createInitialState(applyConfigDefaults({ version: 1 }));

  const result = await writeState(statePath, state);

  assert.equal(result.ok, true);
  const parsed = JSON.parse(await readFile(statePath, "utf8")) as unknown;
  const validation = validateState(parsed);
  assert.equal(validation.ok, true);
});
