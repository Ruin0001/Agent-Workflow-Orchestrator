import { execFile } from "node:child_process";
import * as assert from "node:assert/strict";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { main } from "../../src/cli/main.js";
import { clearDelegatedUserPlanApproval } from "../../src/commands/delegated-gate-clear.js";
import { initCommand } from "../../src/commands/init.js";
import { runUntilUserGateCommand } from "../../src/commands/run-until-user-gate.js";
import { validateState, type WorkflowState } from "../../src/state/schema.js";

const execFileAsync = promisify(execFile);

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

async function setupGitGuardrailWorkspace(fixtureName: string): Promise<string | undefined> {
  const workspace = await setupWorkspace(fixtureName);
  const configPath = join(workspace, ".agent-flow.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    guardrails: {
      requireGitForFullGuardrails: boolean;
      requireCleanWorkingTree: boolean;
    };
  };
  config.guardrails.requireGitForFullGuardrails = true;
  config.guardrails.requireCleanWorkingTree = true;
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");

  try {
    await execFileAsync("git", ["init"], { cwd: workspace });
    await execFileAsync("git", ["config", "user.email", "agent-flow@example.test"], { cwd: workspace });
    await execFileAsync("git", ["config", "user.name", "Agent Flow Test"], { cwd: workspace });
    await execFileAsync("git", ["add", "."], { cwd: workspace });
    await execFileAsync("git", ["commit", "-m", "baseline"], { cwd: workspace });
  } catch {
    return undefined;
  }

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
  const markers = await invocationMarkers(workspace);
  assert.equal(markers.length, 2);
  assert.equal(markers.some((marker) => marker.startsWith("invoked-requirement_understanding-")), true);
  assert.equal(markers.some((marker) => marker.startsWith("invoked-spec_creation-")), true);
  assert.equal(markers.some((marker) => marker.startsWith("invoked-spec_review-")), false);
  const invocationOrder = (await readFile(join(workspace, ".agent", "cycle-invocations.log"), "utf8"))
    .trim()
    .split(/\r?\n/);
  assert.deepEqual(invocationOrder, ["requirement_understanding", "spec_creation"]);
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

test("run-until-user-gate handles a review back-edge before reaching a user gate", async () => {
  const workspace = await setupWorkspace("fake-agent-run-until-sequence.mjs");
  const state = await readWorkflowState(workspace);
  state.phase = "spec_review_response";
  state.status = "ready";
  state.currentActor = "implementation";
  state.nextActor = "implementation";
  await writeWorkflowState(workspace, state);

  const result = await captureMain(["--workspace", workspace, "run-until-user-gate"]);

  assert.equal(result.exitCode, 0);
  const output = result.stdout.join("\n");
  assert.match(output, /Advanced to spec_review/);
  assert.match(output, /Advanced to user_spec_review/);
  assert.match(output, /Stopped at user gate: user_spec_review/);
  assert.match(output, /Steps run: 2/);
  const finalState = await readWorkflowState(workspace);
  assert.equal(finalState.phase, "user_spec_review");
  assert.equal(finalState.currentActor, "user");
  const markers = (await invocationMarkers(workspace)).sort();
  assert.deepEqual(markers, ["invoked-spec_review", "invoked-spec_review_response"]);
  assert.equal(await exists(join(workspace, ".agent", "invoked-requirement_understanding")), false);
  assert.equal(await exists(join(workspace, ".agent", "invoked-spec_creation")), false);
});

test("run-until-user-gate surfaces iteration-limit exhaustion as a fail-closed stop", async () => {
  const workspace = await setupWorkspace("fake-agent-iteration-limit.mjs");
  const state = await readWorkflowState(workspace);
  state.phase = "spec_review_response";
  state.status = "ready";
  state.currentActor = "implementation";
  state.nextActor = "implementation";
  state.iterationCounters.spec_review = state.limits.maxSpecReviewIterations;
  await writeWorkflowState(workspace, state);
  const before = await readWorkflowState(workspace);

  const result = await captureMain(["--workspace", workspace, "run-until-user-gate"]);

  assert.equal(result.exitCode, 1);
  const errorText = result.stderr.join("\n");
  assert.match(errorText, /ITERATION_LIMIT_EXCEEDED/);
  assert.match(errorText, /run-until-user-gate stopped after 0 steps/i);
  const finalState = await readWorkflowState(workspace);
  assert.deepEqual(finalState, before);
});

test("clearDelegatedUserPlanApproval advances user_plan_approval with audit and digest", async () => {
  const workspace = await setupWorkspace("fake-agent-run-until-sequence.mjs");
  const state = await readWorkflowState(workspace);
  state.phase = "user_plan_approval";
  state.status = "waiting_for_user";
  state.currentActor = "user";
  state.nextActor = "user";
  await writeWorkflowState(workspace, state);

  const result = await clearDelegatedUserPlanApproval({
    workspace,
    configPath: ".agent-flow.json",
    verdictPath: ".agent/artifacts/plan_review_verdict.json",
    verdict: {
      runId: "run-1",
      phase: "plan_review",
      status: "Approved",
      blocking: 0,
      major: 0,
      minor: 0,
      iteration: 1,
    },
  });

  assert.equal(result.ok, true);
  assert.equal((await readWorkflowState(workspace)).phase, "task_classification");
  const runLog = await readFile(join(workspace, ".agent", "logs", "runs.jsonl"), "utf8");
  assert.match(runLog, /delegated_auto_pass/);
  assert.equal(await exists(join(workspace, ".agent", "logs", "delegation_digest.md")), true);
});

test("run-until-user-gate --delegated auto-clears user_plan_approval only with same-run verdict", async () => {
  const workspace = await setupWorkspace("fake-agent-gate-delegation-plan.mjs");
  const configPath = join(workspace, ".agent-flow.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  config.delegation = { enabled: true, delegatedGates: ["user_plan_approval"] };
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  const state = await readWorkflowState(workspace);
  state.phase = "plan_creation";
  state.status = "ready";
  state.currentActor = "implementation";
  state.nextActor = "implementation";
  await writeWorkflowState(workspace, state);

  const result = await captureMain(["--workspace", workspace, "--delegated", "run-until-user-gate"]);

  assert.equal(result.exitCode, 0);
  const output = result.stdout.join("\n");
  assert.match(output, /Delegated auto-clear: user_plan_approval -> task_classification/);
  assert.match(output, /Stopped at user gate: user_verification/);
  const finalState = await readWorkflowState(workspace);
  assert.equal(finalState.phase, "user_verification");
  assert.equal(await exists(join(workspace, ".agent", "logs", "delegation_digest.md")), true);
});

test("run-until-user-gate --delegated refuses when config delegation is disabled", async () => {
  const workspace = await setupWorkspace("fake-agent-gate-delegation-plan.mjs");

  const result = await captureMain(["--workspace", workspace, "--delegated", "run-until-user-gate"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /delegation is disabled/i);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});

test("run-until-user-gate --delegated stops cleanly at user_plan_approval for stale verdict", async () => {
  const workspace = await setupWorkspace("fake-agent-gate-delegation-stale-verdict.mjs");
  const configPath = join(workspace, ".agent-flow.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  config.delegation = { enabled: true, delegatedGates: ["user_plan_approval"] };
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  const state = await readWorkflowState(workspace);
  state.phase = "plan_creation";
  state.status = "ready";
  state.currentActor = "implementation";
  state.nextActor = "implementation";
  await writeWorkflowState(workspace, state);

  const result = await captureMain(["--workspace", workspace, "--delegated", "run-until-user-gate"]);

  assert.equal(result.exitCode, 0);
  const output = result.stdout.join("\n");
  assert.match(output, /Stopped at user gate: user_plan_approval/);
  assert.doesNotMatch(output, /Delegated auto-clear/);
  assert.equal((await readWorkflowState(workspace)).phase, "user_plan_approval");
  assert.equal(await exists(join(workspace, ".agent", "logs", "delegation_digest.md")), false);
});

test("run-until-user-gate --delegated stops cleanly for valid below-bar verdicts", async () => {
  const workspace = await setupWorkspace("fake-agent-gate-delegation-below-bar-verdict.mjs");
  const configPath = join(workspace, ".agent-flow.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  config.delegation = { enabled: true, delegatedGates: ["user_plan_approval"] };
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  const state = await readWorkflowState(workspace);
  state.phase = "plan_creation";
  state.status = "ready";
  state.currentActor = "implementation";
  state.nextActor = "implementation";
  await writeWorkflowState(workspace, state);

  const result = await captureMain(["--workspace", workspace, "--delegated", "run-until-user-gate"]);

  assert.equal(result.exitCode, 0);
  const output = result.stdout.join("\n");
  assert.match(output, /Stopped at user gate: user_plan_approval/);
  assert.match(output, /approved_no_blocking_no_major/);
  assert.doesNotMatch(output, /Delegated auto-clear/);
  assert.equal((await readWorkflowState(workspace)).phase, "user_plan_approval");
  assert.equal(await exists(join(workspace, ".agent", "logs", "delegation_digest.md")), false);
});

test("run-until-user-gate --delegated started at user_plan_approval stops without prior-run verdict replay", async () => {
  const workspace = await setupWorkspace("fake-agent-gate-delegation-plan.mjs");
  const configPath = join(workspace, ".agent-flow.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  config.delegation = { enabled: true, delegatedGates: ["user_plan_approval"] };
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  await writeFile(
    join(workspace, ".agent", "artifacts", "plan_review_verdict.json"),
    JSON.stringify(
      {
        runId: "prior-run",
        phase: "plan_review",
        status: "Approved",
        blocking: 0,
        major: 0,
        minor: 0,
        iteration: 1,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  const state = await readWorkflowState(workspace);
  state.phase = "user_plan_approval";
  state.status = "waiting_for_user";
  state.currentActor = "user";
  state.nextActor = "user";
  await writeWorkflowState(workspace, state);

  const result = await captureMain(["--workspace", workspace, "--delegated", "run-until-user-gate"]);

  assert.equal(result.exitCode, 0);
  const output = result.stdout.join("\n");
  assert.match(output, /Stopped at user gate: user_plan_approval/);
  assert.doesNotMatch(output, /Delegated auto-clear/);
  assert.equal(await exists(join(workspace, ".agent", "artifacts", "plan_review_verdict.json")), false);
});

test("run-until-user-gate --delegated blocks agent edits to .agent-flow.json", async (t) => {
  const workspace = await setupGitGuardrailWorkspace("fake-agent-modify-agent-flow-config.mjs");
  if (workspace === undefined) {
    t.skip("git is unavailable");
    return;
  }
  const configPath = join(workspace, ".agent-flow.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  config.delegation = { enabled: true, delegatedGates: ["user_plan_approval"] };
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  await execFileAsync("git", ["add", ".agent-flow.json"], { cwd: workspace });
  await execFileAsync("git", ["commit", "-m", "enable delegation"], { cwd: workspace });

  const result = await captureMain(["--workspace", workspace, "--delegated", "run-until-user-gate"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /\.agent-flow\.json|agent-immutable|protected/i);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});
