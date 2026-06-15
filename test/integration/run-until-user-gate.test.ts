import * as assert from "node:assert/strict";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../../src/cli/main.js";
import { initCommand } from "../../src/commands/init.js";
import { runUntilUserGateCommand } from "../../src/commands/run-until-user-gate.js";
import { validateState, type WorkflowState } from "../../src/state/schema.js";

async function tempWorkspace(): Promise<string> {
  const path = join(tmpdir(), `agent-flow-run-until-${Date.now()}-${Math.random()}`);
  await mkdir(path, { recursive: true });
  return path;
}

async function captureMain(argv: string[]): Promise<{
  exitCode: number;
  stdout: string[];
  stderr: string[];
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    stdout.push(args.join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.join(" "));
  };

  try {
    const exitCode = await main(argv);
    return { exitCode, stdout, stderr };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

async function setupWorkspace(fixtureName: string): Promise<string> {
  const workspace = await tempWorkspace();
  const fixturePath = join(process.cwd(), "test", "fixtures", fixtureName);
  await writeFile(
    join(workspace, ".agent-flow.json"),
    JSON.stringify(
      {
        version: 1,
        agents: {
          implementation: {
            role: "implementation",
            name: "Fake Implementation",
            command: process.execPath,
            args: [fixturePath],
            inputMode: "stdin",
            outputMode: "stdout",
            timeoutSeconds: 1,
          },
          review: {
            role: "review",
            name: "Fake Review",
            command: process.execPath,
            args: [fixturePath],
            inputMode: "stdin",
            outputMode: "stdout",
            timeoutSeconds: 1,
          },
        },
        guardrails: {
          requireGitForFullGuardrails: false,
          requireCleanWorkingTree: false,
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const initialized = await initCommand({ workspace });
  assert.equal(initialized.ok, true);
  return workspace;
}

async function readWorkflowState(workspace: string): Promise<WorkflowState> {
  const source = await readFile(join(workspace, ".agent", "workflow_state.json"), "utf8");
  const parsed = validateState(JSON.parse(source) as unknown);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    return parsed.value;
  }
  throw new Error("Invalid workflow state");
}

async function writeWorkflowState(workspace: string, state: WorkflowState): Promise<void> {
  await writeFile(
    join(workspace, ".agent", "workflow_state.json"),
    JSON.stringify(state, null, 2) + "\n",
    "utf8",
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function invocationMarkers(workspace: string): Promise<string[]> {
  const entries = await readdir(join(workspace, ".agent"));
  return entries.filter((entry) => entry.startsWith("invoked"));
}

test("run-until-user-gate stops immediately when already at a user phase", async () => {
  const workspace = await setupWorkspace("fake-agent-run-until-sequence.mjs");
  const state = await readWorkflowState(workspace);
  state.phase = "user_spec_review";
  state.status = "waiting_for_user";
  state.currentActor = "user";
  state.nextActor = "user";
  await writeWorkflowState(workspace, state);
  const before = await readWorkflowState(workspace);

  const result = await captureMain(["--workspace", workspace, "run-until-user-gate"]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.stderr, []);
  assert.match(result.stdout.join("\n"), /Stopped at user gate: user_spec_review/);
  assert.match(result.stdout.join("\n"), /Steps run: 0/);
  assert.deepEqual(await invocationMarkers(workspace), []);
  assert.deepEqual(await readWorkflowState(workspace), before);
});

test("run-until-user-gate stops cleanly on an active explicit gate without invoking the agent", async () => {
  const workspace = await setupWorkspace("fake-agent-run-until-sequence.mjs");
  const state = await readWorkflowState(workspace);
  state.gates.approval = { active: true, reason: "Need approval" };
  await writeWorkflowState(workspace, state);
  const before = await readWorkflowState(workspace);

  const result = await captureMain(["--workspace", workspace, "run-until-user-gate"]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.stderr, []);
  assert.match(result.stdout.join("\n"), /Stopped at user gate: approval/);
  assert.match(result.stdout.join("\n"), /Steps run: 0/);
  assert.deepEqual(await invocationMarkers(workspace), []);
  assert.deepEqual(await readWorkflowState(workspace), before);
});

test("run-until-user-gate stops immediately when workflow is done", async () => {
  const workspace = await setupWorkspace("fake-agent-run-until-sequence.mjs");
  const state = await readWorkflowState(workspace);
  state.phase = "done";
  state.status = "done";
  state.currentActor = "none";
  state.nextActor = "none";
  await writeWorkflowState(workspace, state);
  const before = await readWorkflowState(workspace);

  const result = await captureMain(["--workspace", workspace, "run-until-user-gate"]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.stderr, []);
  assert.match(result.stdout.join("\n"), /Workflow already done/);
  assert.match(result.stdout.join("\n"), /Steps run: 0/);
  assert.deepEqual(await invocationMarkers(workspace), []);
  assert.deepEqual(await readWorkflowState(workspace), before);
});

test("run-until-user-gate preserves next errors with run summary details", async () => {
  const workspace = await setupWorkspace("fake-agent-invalid-proposal.mjs");

  const result = await runUntilUserGateCommand({ workspace });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.notEqual(result.error.code, "RUN_UNTIL_STEP_LIMIT");
    assert.match(result.error.message, /run-until-user-gate stopped after 0 steps/i);
    assert.deepEqual(result.error.details?.runUntilUserGate, {
      stepsRun: 0,
      lastPhase: "requirement_understanding",
      lastActor: "implementation",
    });
  }
});

test("run-until-user-gate step limit fails closed after one successful step without extra mutation", async () => {
  const workspace = await setupWorkspace("fake-agent-run-until-sequence.mjs");

  const result = await runUntilUserGateCommand({ workspace, maxSteps: 1 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "RUN_UNTIL_STEP_LIMIT");
    assert.equal(result.error.details?.stepsRun, 1);
    assert.equal(result.error.details?.lastPhase, "spec_creation");
    assert.equal(result.error.details?.lastActor, "implementation");
    assert.equal(result.error.details?.maxSteps, 1);
  }
  const state = await readWorkflowState(workspace);
  assert.equal(state.phase, "spec_creation");
  assert.equal(state.currentActor, "implementation");
  assert.equal(await exists(join(workspace, ".agent", "invoked-requirement_understanding")), true);
  assert.equal(await exists(join(workspace, ".agent", "invoked-spec_creation")), false);
});

test("run-until-user-gate step limit fails closed without mutating state after exhaustion", async () => {
  const workspace = await setupWorkspace("fake-agent-run-until-cycle.mjs");

  const result = await runUntilUserGateCommand({ workspace, maxSteps: 2 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "RUN_UNTIL_STEP_LIMIT");
    assert.equal(result.error.details?.stepsRun, 2);
    assert.equal(result.error.details?.maxSteps, 2);
  }
  const state = await readWorkflowState(workspace);
  assert.equal(state.phase, "spec_review");
  assert.equal(state.currentActor, "review");
});

test("run-until-user-gate rejects invalid maxSteps without invoking the agent", async () => {
  const workspace = await setupWorkspace("fake-agent.mjs");

  const result = await runUntilUserGateCommand({ workspace, maxSteps: -1 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.equal(result.error.path, "$.maxSteps");
    assert.match(result.error.message, /non-negative integer/);
  }
  assert.equal(await exists(join(workspace, ".agent", "invoked")), false);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});

test("run-until-user-gate repeats next until the first user-owned phase", async () => {
  const workspace = await setupWorkspace("fake-agent-run-until-sequence.mjs");

  const result = await captureMain(["--workspace", workspace, "run-until-user-gate"]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.stderr, []);
  const output = result.stdout.join("\n");
  assert.match(output, /Advanced to spec_creation/);
  assert.match(output, /Advanced to spec_review/);
  assert.match(output, /Advanced to user_spec_review/);
  assert.match(output, /Stopped at user gate: user_spec_review/);
  assert.match(output, /Steps run: 3/);

  const state = await readWorkflowState(workspace);
  assert.equal(state.phase, "user_spec_review");
  assert.equal(state.currentActor, "user");
  assert.equal(await exists(join(workspace, ".agent", "invoked-requirement_understanding")), true);
  assert.equal(await exists(join(workspace, ".agent", "invoked-spec_creation")), true);
  assert.equal(await exists(join(workspace, ".agent", "invoked-spec_review")), true);
});
