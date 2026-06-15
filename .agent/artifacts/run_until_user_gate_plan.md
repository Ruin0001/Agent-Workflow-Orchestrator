# Run-Until-User-Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `agent-flow run-until-user-gate`, a bounded loop over the reviewed `nextCommand()` that stops at user gates, `done`, errors, or an internal step limit without clearing or delegating any user gate.

**Architecture:** Keep the command as a thin Loop Wrapper around `nextCommand()`. Add a focused `evaluateRunStop()` boundary in `src/workflow/run-stop.ts` so this wave stops on any user-owned phase, `done`, or active explicit gate, and the later Gate Policy Engine can extend this decision point without rewriting the command loop.

**Tech Stack:** TypeScript, Node.js built-ins only, existing CLI parser/command patterns, Node test runner.

---

## Review Inputs Incorporated

- D1 (Major): `evaluateRunStop()` must stop cleanly on any active `state.gates[*].active`, carrying the gate name, rather than letting `nextCommand()` return `USER_GATE_ACTIVE`.
- D2 (Minor): Use a named internal step-limit constant with rationale. Plan value: `RUN_UNTIL_USER_GATE_MAX_STEPS = 20`. This comfortably exceeds the current longest inter-user-gate segment, including review back-edges under default iteration limits, while remaining small enough to fail closed quickly if a loop appears.
- D3 (Minor): Preserve the original `nextCommand()` error code. Add run summary to `details.runUntilUserGate`.
- D4 (Minor): Add tests for no state mutation on step-limit exhaustion, review back-edge traversal, and iteration-limit exhaustion.
- D5 (Minor): Document and test iteration-limit exhaustion as a fail-closed error stop requiring user attention.

## File Structure

- Create `src/workflow/run-stop.ts`: pure stop-decision boundary. No I/O and no mutation.
- Create `src/commands/run-until-user-gate.ts`: command loop, state loading, summary formatting, step-limit handling, and error summary attachment.
- Modify `src/cli/args.ts`: add `run-until-user-gate` to `CliCommand` and parser.
- Modify `src/cli/main.ts`: dispatch new command.
- Modify `src/cli/output.ts`: list new command in help.
- Create `test/unit/run-stop.test.ts`: unit tests for stop decisions, including D1 active gate.
- Modify `test/unit/args.test.ts`: parser tests for the new command and delimiter behavior.
- Create `test/fixtures/fake-agent-run-until-sequence.mjs`: phase-aware fake agent for normal and review-back-edge flows.
- Create `test/fixtures/fake-agent-run-until-cycle.mjs`: phase-aware fake agent that cycles without reaching a user phase for step-limit tests.
- Create `test/fixtures/fake-agent-iteration-limit.mjs`: phase-aware fake agent that proposes a review phase when its iteration limit is already exhausted.
- Create `test/integration/run-until-user-gate.test.ts`: command integration tests.
- Update `.agent/handoff.md` in Task 8 only, when handing the completed implementation to Claude for review.

## Task 1: Stop Decision Boundary

**Files:**
- Create: `src/workflow/run-stop.ts`
- Test: `test/unit/run-stop.test.ts`

- [ ] **Step 1: Write failing unit tests for stop decisions**

Create `test/unit/run-stop.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the stop-decision tests and verify they fail**

Run:

```powershell
npm test -- --test-name-pattern "evaluateRunStop"
```

Expected: FAIL because `src/workflow/run-stop.ts` and `evaluateRunStop` do not exist.

- [ ] **Step 3: Implement `evaluateRunStop()`**

Create `src/workflow/run-stop.ts`:

```ts
import type { WorkflowState } from "../state/schema.js";
import type { WorkflowActor } from "./actors.js";
import type { WorkflowPhase } from "./phases.js";

export type RunStopDecision =
  | {
      action: "stop";
      reason: "user_gate" | "done";
      phase: WorkflowPhase;
      actor: WorkflowActor;
      message: string;
      gateName?: string;
      gateReason?: string;
    }
  | {
      action: "continue";
      phase: WorkflowPhase;
      actor: WorkflowActor;
    };

export function evaluateRunStop(state: WorkflowState): RunStopDecision {
  if (state.status === "done" || state.currentActor === "none") {
    return {
      action: "stop",
      reason: "done",
      phase: state.phase,
      actor: state.currentActor,
      message: "Workflow already done",
    };
  }

  const activeGate = Object.entries(state.gates).find(([, gate]) => gate.active);
  if (activeGate !== undefined) {
    const [gateName, gate] = activeGate;
    return {
      action: "stop",
      reason: "user_gate",
      phase: state.phase,
      actor: state.currentActor,
      message: `Stopped at user gate: ${gateName}`,
      gateName,
      gateReason: gate.reason,
    };
  }

  if (state.currentActor === "user") {
    return {
      action: "stop",
      reason: "user_gate",
      phase: state.phase,
      actor: state.currentActor,
      message: `Stopped at user gate: ${state.phase}`,
    };
  }

  return {
    action: "continue",
    phase: state.phase,
    actor: state.currentActor,
  };
}
```

- [ ] **Step 4: Run the stop-decision tests and verify they pass**

Run:

```powershell
npm test -- --test-name-pattern "evaluateRunStop"
```

Expected: PASS for the four `evaluateRunStop` tests.

- [ ] **Step 5: Commit stop decision boundary**

Run:

```powershell
git add src/workflow/run-stop.ts test/unit/run-stop.test.ts
git commit -m "Add run-until stop decision"
```

## Task 2: CLI Parser And Help

**Files:**
- Modify: `src/cli/args.ts`
- Modify: `src/cli/output.ts`
- Test: `test/unit/args.test.ts`

- [ ] **Step 1: Write failing parser/help tests**

Modify `test/unit/args.test.ts`:

```ts
test("parses run-until-user-gate command", () => {
  const result = parseArgs(["run-until-user-gate"]);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.name, "run-until-user-gate");
  }
});
```

Update the delimiter test in the same file:

```ts
test("treats tokens after delimiter as positionals", () => {
  const result = parseArgs(["--", "not-a-command"]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "USAGE_ERROR");
    assert.match(result.error.message, /Unknown command: not-a-command/);
  }
});
```

Create `test/unit/output.test.ts`:

```ts
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { helpText } from "../../src/cli/output.js";

test("help lists run-until-user-gate command", () => {
  assert.match(helpText(), /run-until-user-gate/);
});
```

- [ ] **Step 2: Run parser/help tests and verify they fail**

Run:

```powershell
npm test -- --test-name-pattern "run-until-user-gate command|help lists run-until-user-gate|treats tokens"
```

Expected: FAIL because parser/help do not know the new command.

- [ ] **Step 3: Add CLI command parsing**

Modify `src/cli/args.ts`:

```ts
export type CliCommand =
  | { name: "init"; flags: CliFlags }
  | { name: "status"; flags: CliFlags }
  | { name: "config-validate"; flags: CliFlags }
  | { name: "next"; flags: CliFlags }
  | { name: "run-until-user-gate"; flags: CliFlags }
  | { name: "help"; flags: CliFlags };
```

Add this branch after the `next` branch:

```ts
  if (command === "run-until-user-gate" && positionals.length === 1) {
    return ok({ name: "run-until-user-gate", flags });
  }
```

Modify `src/cli/output.ts` command list:

```ts
    "  next",
    "  run-until-user-gate",
    "  help",
```

- [ ] **Step 4: Run parser/help tests and verify they pass**

Run:

```powershell
npm test -- --test-name-pattern "run-until-user-gate command|help lists run-until-user-gate|treats tokens"
```

Expected: PASS.

- [ ] **Step 5: Commit CLI parser/help**

Run:

```powershell
git add src/cli/args.ts src/cli/output.ts test/unit/args.test.ts test/unit/output.test.ts
git commit -m "Add run-until command parsing"
```

## Task 3: Command Loop

**Files:**
- Create: `src/commands/run-until-user-gate.ts`
- Modify: `src/cli/main.ts`
- Test: `test/integration/run-until-user-gate.test.ts`

- [ ] **Step 1: Write a failing integration test for already-at-user stop**

Create `test/integration/run-until-user-gate.test.ts` with shared helpers:

```ts
import * as assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../../src/cli/main.js";
import { initCommand } from "../../src/commands/init.js";
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

test("run-until-user-gate stops immediately when already at a user phase", async () => {
  const workspace = await setupWorkspace("fake-agent-run-until-sequence.mjs");
  const state = await readWorkflowState(workspace);
  state.phase = "user_spec_review";
  state.status = "waiting_for_user";
  state.currentActor = "user";
  state.nextActor = "user";
  await writeWorkflowState(workspace, state);

  const result = await captureMain(["--workspace", workspace, "run-until-user-gate"]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.stderr, []);
  assert.match(result.stdout.join("\n"), /Stopped at user gate: user_spec_review/);
  assert.match(result.stdout.join("\n"), /Steps run: 0/);
  assert.equal(await exists(join(workspace, ".agent", "invoked")), false);
  assert.equal((await readWorkflowState(workspace)).phase, "user_spec_review");
});
```

- [ ] **Step 2: Run the already-at-user integration test and verify it fails**

Run:

```powershell
npm test -- --test-name-pattern "already at a user phase"
```

Expected: FAIL because `run-until-user-gate` dispatch and command do not exist.

- [ ] **Step 3: Implement the command loop and dispatch**

Create `src/commands/run-until-user-gate.ts`:

```ts
import { isAbsolute, join } from "node:path";
import { DEFAULT_CONFIG_FILE } from "../config/defaults.js";
import { loadConfig } from "../config/load.js";
import { err, ok, type AppError, type Result } from "../core/result.js";
import { nextCommand, type NextOptions } from "./next.js";
import { readState } from "../state/store.js";
import { evaluateRunStop, type RunStopDecision } from "../workflow/run-stop.js";

export type RunUntilUserGateOptions = NextOptions & {
  maxSteps?: number;
};

export const RUN_UNTIL_USER_GATE_MAX_STEPS = 20;

export async function runUntilUserGateCommand(
  options: RunUntilUserGateOptions = {},
): Promise<Result<string>> {
  const workspace = options.workspace ?? process.cwd();
  const configPath = options.configPath ?? DEFAULT_CONFIG_FILE;
  const maxSteps = options.maxSteps ?? RUN_UNTIL_USER_GATE_MAX_STEPS;

  const loadedConfig = await loadConfig({ cwd: workspace, configPath });
  if (!loadedConfig.ok) return loadedConfig;

  const statePath = resolvePath(
    workspace,
    join(loadedConfig.value.workspace.stateDir, "workflow_state.json"),
  );

  const initialState = await readState(statePath);
  if (!initialState.ok) return initialState;

  const initialStop = evaluateRunStop(initialState.value);
  if (initialStop.action === "stop") {
    return ok(formatRunSummary([], initialStop));
  }

  const stepMessages: string[] = [];
  let lastPhase = initialState.value.phase;
  let lastActor = initialState.value.currentActor;

  for (let step = 0; step < maxSteps; step += 1) {
    const result = await nextCommand({ workspace, configPath });
    if (!result.ok) {
      return err(withRunSummary(result.error, stepMessages.length, lastPhase, lastActor));
    }

    stepMessages.push(result.value);

    const state = await readState(statePath);
    if (!state.ok) return state;
    lastPhase = state.value.phase;
    lastActor = state.value.currentActor;

    const decision = evaluateRunStop(state.value);
    if (decision.action === "stop") {
      return ok(formatRunSummary(stepMessages, decision));
    }
  }

  return err({
    code: "RUN_UNTIL_STEP_LIMIT",
    message: `run-until-user-gate stopped after ${maxSteps} steps without reaching a user gate or done.`,
    details: {
      stepsRun: stepMessages.length,
      lastPhase,
      lastActor,
      maxSteps,
    },
  });
}

function formatRunSummary(
  stepMessages: string[],
  decision: Extract<RunStopDecision, { action: "stop" }>,
): string {
  return [...stepMessages, decision.message, `Steps run: ${stepMessages.length}`].join("\n");
}

function withRunSummary(
  error: AppError,
  stepsRun: number,
  lastPhase: string,
  lastActor: string,
): AppError {
  const details = {
    ...(error.details ?? {}),
    runUntilUserGate: {
      stepsRun,
      lastPhase,
      lastActor,
    },
  };
  return {
    ...error,
    message: `${error.message} (run-until-user-gate stopped after ${stepsRun} step${stepsRun === 1 ? "" : "s"} at ${lastPhase})`,
    details,
  };
}

function resolvePath(workspace: string, path: string): string {
  return isAbsolute(path) ? path : join(workspace, path);
}
```

Modify `src/cli/main.ts`:

```ts
import { runUntilUserGateCommand } from "../commands/run-until-user-gate.js";
```

Add a dispatch case:

```ts
    case "run-until-user-gate":
      return runUntilUserGateCommand(commandOptions(command));
```

- [ ] **Step 4: Run the already-at-user integration test and verify it passes**

Run:

```powershell
npm test -- --test-name-pattern "already at a user phase"
```

Expected: PASS.

- [ ] **Step 5: Commit command loop skeleton**

Run:

```powershell
git add src/commands/run-until-user-gate.ts src/cli/main.ts test/integration/run-until-user-gate.test.ts
git commit -m "Add run-until command loop"
```

## Task 4: Normal Multi-Step Stop At User Gate

**Files:**
- Create: `test/fixtures/fake-agent-run-until-sequence.mjs`
- Modify: `test/integration/run-until-user-gate.test.ts`

- [ ] **Step 1: Create a phase-aware fake agent fixture**

Create `test/fixtures/fake-agent-run-until-sequence.mjs`:

```js
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

let prompt = "";
for await (const chunk of process.stdin) {
  prompt += chunk;
}

const runId = /runId "([^"]+)"/.exec(prompt)?.[1] ?? "missing-run-id";
const phase = /^Phase: (.+)$/m.exec(prompt)?.[1] ?? "unknown";

const steps = {
  requirement_understanding: {
    nextPhase: "spec_creation",
    artifactName: "requirement_understanding",
    artifactPath: "requirement_understanding.md",
    content: "# Requirement Understanding\n",
    summary: "Wrote requirement understanding",
  },
  spec_creation: {
    nextPhase: "spec_review",
    artifactName: "spec",
    artifactPath: "spec.md",
    content: "# Spec\n",
    summary: "Wrote spec",
  },
  spec_review: {
    nextPhase: "user_spec_review",
    artifactName: "spec_review",
    artifactPath: "spec_review.md",
    content: "# Spec Review\n\nApproved.\n",
    summary: "Reviewed spec",
  },
  spec_review_response: {
    nextPhase: "spec_review",
    artifactName: "spec_review_response",
    artifactPath: "spec_review_response.md",
    content: "# Spec Review Response\n",
    summary: "Responded to spec review",
  },
};

const step = steps[phase];
if (step === undefined) {
  console.error(`Unsupported phase: ${phase}`);
  process.exit(2);
}

await mkdir(join(".agent", "artifacts"), { recursive: true });
await writeFile(join(".agent", `invoked-${phase}`), "yes\n", "utf8");
await writeFile(join(".agent", "artifacts", step.artifactPath), step.content, "utf8");
await writeFile(
  join(".agent", "next_state_proposal.json"),
  JSON.stringify(
    {
      runId,
      nextPhase: step.nextPhase,
      artifacts: [step.artifactName],
      summary: step.summary,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
```

- [ ] **Step 2: Add failing multi-step stop test**

Append to `test/integration/run-until-user-gate.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the multi-step test and verify it passes**

Run:

```powershell
npm test -- --test-name-pattern "repeats next until the first user-owned phase"
```

Expected: PASS after Task 3 implementation and the new fixture.

- [ ] **Step 4: Commit normal multi-step behavior**

Run:

```powershell
git add test/fixtures/fake-agent-run-until-sequence.mjs test/integration/run-until-user-gate.test.ts
git commit -m "Test run-until user gate stop"
```

## Task 5: Active Gate, Done, And Error Preservation

**Files:**
- Modify: `test/integration/run-until-user-gate.test.ts`
- Modify: `src/commands/run-until-user-gate.ts`

- [ ] **Step 1: Add failing tests for D1 active gate and done**

Append to `test/integration/run-until-user-gate.test.ts`:

```ts
test("run-until-user-gate stops cleanly on an active explicit gate without invoking the agent", async () => {
  const workspace = await setupWorkspace("fake-agent-run-until-sequence.mjs");
  const state = await readWorkflowState(workspace);
  state.gates.approval = { active: true, reason: "Need approval" };
  await writeWorkflowState(workspace, state);

  const result = await captureMain(["--workspace", workspace, "run-until-user-gate"]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.stderr, []);
  assert.match(result.stdout.join("\n"), /Stopped at user gate: approval/);
  assert.match(result.stdout.join("\n"), /Steps run: 0/);
  assert.equal(await exists(join(workspace, ".agent", "invoked-requirement_understanding")), false);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});

test("run-until-user-gate stops immediately when workflow is done", async () => {
  const workspace = await setupWorkspace("fake-agent-run-until-sequence.mjs");
  const state = await readWorkflowState(workspace);
  state.phase = "done";
  state.status = "done";
  state.currentActor = "none";
  state.nextActor = "none";
  await writeWorkflowState(workspace, state);

  const result = await captureMain(["--workspace", workspace, "run-until-user-gate"]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.stderr, []);
  assert.match(result.stdout.join("\n"), /Workflow already done/);
  assert.match(result.stdout.join("\n"), /Steps run: 0/);
  assert.equal(await exists(join(workspace, ".agent", "invoked-done")), false);
});
```

- [ ] **Step 2: Add failing test for D3 original error-code preservation**

Append:

```ts
test("run-until-user-gate preserves the original next error code with run summary details", async () => {
  const workspace = await setupWorkspace("fake-agent-invalid-proposal.mjs");

  const result = await captureMain(["--workspace", workspace, "run-until-user-gate"]);

  assert.equal(result.exitCode, 1);
  const errorText = result.stderr.join("\n");
  assert.match(errorText, /VALIDATION_ERROR|JSON_PARSE_ERROR|proposal|nextPhase/i);
  assert.match(errorText, /run-until-user-gate stopped after 0 steps/i);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});
```

Use `fake-agent-invalid-proposal.mjs` because the original `nextCommand()` path already fails before advancing state. The assertion requires the existing validation/proposal error text and the run summary phrase.

- [ ] **Step 3: Run the active/done/error tests**

Run:

```powershell
npm test -- --test-name-pattern "active explicit gate|workflow is done|preserves the original next error code"
```

Expected: PASS. If it does not pass, change only `withRunSummary()` to match the Task 3 implementation and rerun this same command.

- [ ] **Step 4: Commit active/done/error coverage**

Run:

```powershell
git add test/integration/run-until-user-gate.test.ts src/commands/run-until-user-gate.ts
git commit -m "Cover run-until stop and error cases"
```

## Task 6: Step Limit Fail-Closed Behavior

**Files:**
- Create: `test/fixtures/fake-agent-run-until-cycle.mjs`
- Modify: `test/integration/run-until-user-gate.test.ts`
- Modify: `src/commands/run-until-user-gate.ts`

- [ ] **Step 1: Create a cycling fake agent fixture**

Create `test/fixtures/fake-agent-run-until-cycle.mjs`:

```js
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

let prompt = "";
for await (const chunk of process.stdin) {
  prompt += chunk;
}

const runId = /runId "([^"]+)"/.exec(prompt)?.[1] ?? "missing-run-id";
const phase = /^Phase: (.+)$/m.exec(prompt)?.[1] ?? "unknown";

const steps = {
  requirement_understanding: {
    nextPhase: "spec_creation",
    artifactName: "requirement_understanding",
    artifactPath: "requirement_understanding.md",
  },
  spec_creation: {
    nextPhase: "spec_review",
    artifactName: "spec",
    artifactPath: "spec.md",
  },
  spec_review: {
    nextPhase: "spec_review_response",
    artifactName: "spec_review",
    artifactPath: "spec_review.md",
  },
  spec_review_response: {
    nextPhase: "spec_review",
    artifactName: "spec_review_response",
    artifactPath: "spec_review_response.md",
  },
};

const step = steps[phase];
if (step === undefined) {
  console.error(`Unsupported phase: ${phase}`);
  process.exit(2);
}

await mkdir(join(".agent", "artifacts"), { recursive: true });
await writeFile(join(".agent", `invoked-${phase}-${Date.now()}`), "yes\n", "utf8");
await writeFile(join(".agent", "artifacts", step.artifactPath), `# ${step.artifactName}\n`, "utf8");
await writeFile(
  join(".agent", "next_state_proposal.json"),
  JSON.stringify(
    {
      runId,
      nextPhase: step.nextPhase,
      artifacts: [step.artifactName],
      summary: `Cycled from ${phase}`,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
```

- [ ] **Step 2: Add a direct-command step-limit test**

Append to `test/integration/run-until-user-gate.test.ts`:

```ts
import { runUntilUserGateCommand } from "../../src/commands/run-until-user-gate.js";
```

Add:

```ts
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
```

This asserts the command does not perform an extra mutation after the limit is reached. Two successful steps are expected: `requirement_understanding -> spec_creation -> spec_review`; then the loop stops before a third `nextCommand()` call.

- [ ] **Step 3: Run the step-limit test and verify it passes**

Run:

```powershell
npm test -- --test-name-pattern "step limit fails closed"
```

Expected: PASS.

- [ ] **Step 4: Commit step-limit behavior**

Run:

```powershell
git add src/commands/run-until-user-gate.ts test/fixtures/fake-agent-run-until-cycle.mjs test/integration/run-until-user-gate.test.ts
git commit -m "Add run-until step limit coverage"
```

## Task 7: Review Back-Edge And Iteration-Limit Stops

**Files:**
- Create: `test/fixtures/fake-agent-iteration-limit.mjs`
- Modify: `test/integration/run-until-user-gate.test.ts`

- [ ] **Step 1: Add review back-edge integration test**

Append:

```ts
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
  assert.equal((await readWorkflowState(workspace)).phase, "user_spec_review");
});
```

- [ ] **Step 2: Create iteration-limit fake agent fixture**

Create `test/fixtures/fake-agent-iteration-limit.mjs`:

```js
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

let prompt = "";
for await (const chunk of process.stdin) {
  prompt += chunk;
}

const runId = /runId "([^"]+)"/.exec(prompt)?.[1] ?? "missing-run-id";

await mkdir(join(".agent", "artifacts"), { recursive: true });
await writeFile(join(".agent", "invoked-iteration-limit"), "yes\n", "utf8");
await writeFile(join(".agent", "artifacts", "spec_review_response.md"), "# Response\n", "utf8");
await writeFile(
  join(".agent", "next_state_proposal.json"),
  JSON.stringify(
    {
      runId,
      nextPhase: "spec_review",
      artifacts: ["spec_review_response"],
      summary: "Attempted another spec review",
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
```

- [ ] **Step 3: Add D5 iteration-limit test**

Append:

```ts
test("run-until-user-gate surfaces iteration-limit exhaustion as a fail-closed stop", async () => {
  const workspace = await setupWorkspace("fake-agent-iteration-limit.mjs");
  const state = await readWorkflowState(workspace);
  state.phase = "spec_review_response";
  state.status = "ready";
  state.currentActor = "implementation";
  state.nextActor = "implementation";
  state.iterationCounters.spec_review = state.limits.maxSpecReviewIterations;
  await writeWorkflowState(workspace, state);

  const result = await captureMain(["--workspace", workspace, "run-until-user-gate"]);

  assert.equal(result.exitCode, 1);
  const errorText = result.stderr.join("\n");
  assert.match(errorText, /ITERATION_LIMIT_EXCEEDED/);
  assert.match(errorText, /run-until-user-gate stopped after 0 steps/i);
  const finalState = await readWorkflowState(workspace);
  assert.equal(finalState.phase, "spec_review_response");
  assert.equal(finalState.iterationCounters.spec_review, finalState.limits.maxSpecReviewIterations);
});
```

- [ ] **Step 4: Run review back-edge and iteration-limit tests**

Run:

```powershell
npm test -- --test-name-pattern "review back-edge|iteration-limit exhaustion"
```

Expected: PASS. The iteration-limit test should fail closed with the original `ITERATION_LIMIT_EXCEEDED` code and no state advancement.

- [ ] **Step 5: Commit review-loop coverage**

Run:

```powershell
git add test/fixtures/fake-agent-iteration-limit.mjs test/integration/run-until-user-gate.test.ts
git commit -m "Cover run-until review loop stops"
```

## Task 8: Final Verification And Handoff

**Files:**
- Modify: `.agent/artifacts/test_results.md`
- Create: `.agent/artifacts/run_until_user_gate_implementation_notes.md`
- Modify: `.agent/handoff.md`

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm run build
npm run typecheck
npm test
```

Expected:

- `npm run build`: exit 0.
- `npm run typecheck`: exit 0.
- `npm test`: exit 0, with the two existing symlink tests still allowed to skip on this Windows environment.

- [ ] **Step 2: Record implementation notes**

Create `.agent/artifacts/run_until_user_gate_implementation_notes.md`:

```markdown
# Run-Until-User-Gate Implementation Notes

Date: 2026-06-16

## Summary

Implemented `agent-flow run-until-user-gate` as a thin loop over `nextCommand()`.

## Key Decisions

- No user gate is cleared, skipped, or delegated.
- `evaluateRunStop()` stops on done, user-owned phases, and active explicit gates.
- `RUN_UNTIL_USER_GATE_MAX_STEPS` is a named internal constant set to 20.
- `nextCommand()` errors preserve their original error code and include `details.runUntilUserGate`.
- No public config field was added in this wave.
- No persistent aggregate audit log was added; each step keeps using `nextCommand()` run logs.

## Verification

- `npm run build`: pass
- `npm run typecheck`: pass
- `npm test`: pass with existing symlink platform skips on Windows
```

- [ ] **Step 3: Update test results**

Append to `.agent/artifacts/test_results.md`:

```markdown
## Run-Until-User-Gate Wave Verification

- `npm run build`
  - Result: pass
- `npm run typecheck`
  - Result: pass
- `npm test`
  - Result: pass with existing symlink platform skips on Windows

Coverage added:

- stop-decision unit tests, including active explicit gates
- CLI parser/help coverage for `run-until-user-gate`
- immediate stop at user phase and done
- repeated `nextCommand()` execution until user phase
- active explicit gate stop without agent invocation
- original next error-code preservation with run summary details
- step-limit fail-closed behavior
- review back-edge traversal
- iteration-limit exhaustion fail-closed behavior
```

- [ ] **Step 4: Update handoff for implementation review**

Update `.agent/handoff.md` with:

```markdown
## Current Phase

`run-until-user-gate` implementation complete; ready for implementation review.

## Next Actor

Claude Code review session

## Current Task

Review the `run-until-user-gate` implementation against `.agent/artifacts/run_until_user_gate_design.md`, `.agent/artifacts/run_until_user_gate_design_review.md`, and `.agent/artifacts/run_until_user_gate_plan.md`.

## Review Focus

- No user gate is cleared, skipped, or delegated.
- `runUntilUserGateCommand()` reuses `nextCommand()` rather than duplicating guardrails.
- `evaluateRunStop()` handles active explicit gates.
- Original `nextCommand()` error codes are preserved.
- Step-limit exhaustion is fail-closed and performs no extra mutation after the limit.
- Review back-edges and iteration-limit exhaustion are covered.
```

- [ ] **Step 5: Commit implementation artifacts**

Run:

```powershell
git add .agent/artifacts/test_results.md .agent/artifacts/run_until_user_gate_implementation_notes.md .agent/handoff.md
git commit -m "Document run-until implementation verification"
```

- [ ] **Step 6: Push branch**

Run:

```powershell
git push origin main
```

Expected: push succeeds and `git status -sb` reports `## main...origin/main`.

## Stop Condition

Stop after Task 8 and hand off to Claude for implementation review. Do not begin the Gate Delegation wave. Do not add public delegation config, `review_verdict.json`, or gate auto-pass behavior in this wave.

## Plan Self-Review

- Spec coverage: The plan covers the command, `nextCommand()` reuse, user/done/error/step-limit stops, active explicit gate handling, testing, and future policy boundary.
- Design review coverage: D1-D5 are each mapped to concrete tasks and tests.
- Scope check: No delegation, review verdict artifact, public policy config, or unrelated MVP minor cleanup is included.
- Type consistency: `RunStopDecision`, `RunUntilUserGateOptions`, `RUN_UNTIL_USER_GATE_MAX_STEPS`, and `runUntilUserGateCommand()` are named consistently across tasks.
