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
