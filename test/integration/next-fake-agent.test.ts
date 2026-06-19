import * as assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { test } from "node:test";
import { promisify } from "node:util";
import { main } from "../../src/cli/main.js";
import { initCommand } from "../../src/commands/init.js";
import { nextStepCommand } from "../../src/commands/next.js";
import { validateState, type WorkflowState } from "../../src/state/schema.js";

const execFileAsync = promisify(execFile);

async function tempWorkspace(): Promise<string> {
  const path = join(tmpdir(), `agent-flow-next-${Date.now()}-${Math.random()}`);
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
  await mkdir(join(workspace, ".github", "workflows"), { recursive: true });
  await writeFile(join(workspace, ".github", "workflows", "test.yml"), "name: baseline\n", "utf8");

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

async function setImplementationFixture(workspace: string, fixtureName: string): Promise<void> {
  const configPath = join(workspace, ".agent-flow.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    agents: { implementation: { args: string[] } };
  };
  config.agents.implementation.args = [join(process.cwd(), "test", "fixtures", fixtureName)];
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
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

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function runLogLines(workspace: string): Promise<string[]> {
  const source = await readFile(join(workspace, ".agent", "logs", "runs.jsonl"), "utf8");
  return source.trim().length === 0 ? [] : source.trim().split(/\r?\n/);
}

async function waitForPath(path: string, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await exists(path)) {
      return true;
    }
    await setTimeout(10);
  }
  return false;
}

test("next runs one implementation phase and advances after a valid proposal", async () => {
  const workspace = await setupWorkspace("fake-agent.mjs");

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.stderr, []);
  const state = await readWorkflowState(workspace);
  assert.equal(state.phase, "spec_creation");
  assert.equal(state.status, "ready");
  assert.equal(state.currentActor, "implementation");
  assert.equal(state.nextActor, "implementation");
  assert.equal(state.lastActor, "implementation");
  assert.equal(state.lastAction, "Wrote requirement understanding");
  assert.equal(
    await exists(join(workspace, ".agent", "artifacts", "requirement_understanding.md")),
    true,
  );
  assert.equal((await runLogLines(workspace)).length, 1);
});

test("nextStepCommand returns structured metadata while advancing", async () => {
  const workspace = await setupWorkspace("fake-agent.mjs");

  const result = await nextStepCommand({ workspace });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.phase, "requirement_understanding");
  assert.equal(result.value.runId.length > 0, true);
  assert.equal(result.value.proposedNextPhase, "spec_creation");
  assert.equal(result.value.acceptedNextPhase, "spec_creation");
  assert.equal(result.value.message, "Advanced to spec_creation");
  assert.equal((await readWorkflowState(workspace)).phase, "spec_creation");
});

test("next run log includes audit fields after outcome is known", async () => {
  const workspace = await setupWorkspace("fake-agent.mjs");

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 0);
  const lines = await runLogLines(workspace);
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0] ?? "{}") as {
    commandSummary?: string;
    promptPath?: string | null;
    artifactPaths?: string[];
    filesChanged?: string[];
    guardrailResult?: { status?: string };
    proposedNextPhase?: string | null;
    acceptedNextPhase?: string | null;
    outcome?: string;
  };

  assert.equal(typeof entry.commandSummary, "string");
  assert.equal(entry.promptPath, null);
  assert.deepEqual(entry.artifactPaths, [".agent/artifacts/requirement_understanding.md"]);
  assert.deepEqual(entry.filesChanged, []);
  assert.equal(entry.guardrailResult?.status, "skipped");
  assert.equal(entry.proposedNextPhase, "spec_creation");
  assert.equal(entry.acceptedNextPhase, "spec_creation");
  assert.equal(entry.outcome, "success");
});

test("next blocks state advancement when the fake agent exits non-zero", async () => {
  const workspace = await setupWorkspace("fake-agent-nonzero.mjs");

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /non-zero|exit/i);
  const state = await readWorkflowState(workspace);
  assert.equal(state.phase, "requirement_understanding");
  assert.equal((await runLogLines(workspace)).length, 1);
});

test("next blocks state advancement when the fake agent times out", async () => {
  const workspace = await setupWorkspace("fake-agent-timeout.mjs");

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /timed out|timeout/i);
  const state = await readWorkflowState(workspace);
  assert.equal(state.phase, "requirement_understanding");
  assert.equal((await runLogLines(workspace)).length, 1);
});

test("next blocks state advancement when the proposal file is missing", async () => {
  const workspace = await setupWorkspace("fake-agent.mjs");
  const missingProposalAgent = join(workspace, "missing-proposal-agent.mjs");
  await writeFile(
    missingProposalAgent,
    [
      'import { mkdir, writeFile } from "node:fs/promises";',
      'import { join } from "node:path";',
      'await mkdir(".agent", { recursive: true });',
      'await writeFile(join(".agent", "invoked"), "yes\\n", "utf8");',
      "",
    ].join("\n"),
    "utf8",
  );
  const configPath = join(workspace, ".agent-flow.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    agents: { implementation: { args: string[] } };
  };
  config.agents.implementation.args = [missingProposalAgent];
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /proposal/i);
  const state = await readWorkflowState(workspace);
  assert.equal(state.phase, "requirement_understanding");
});

test("next does not reuse a stale proposal from an earlier failed run", async () => {
  const workspace = await setupWorkspace("fake-agent-invalid-manifest.mjs");
  const first = await captureMain(["--workspace", workspace, "next"]);
  assert.equal(first.exitCode, 1);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");

  await rm(join(workspace, ".agent", "artifacts", "allowed_change_manifest.json"), { force: true });
  await setImplementationFixture(workspace, "fake-agent-noop.mjs");

  const second = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(second.exitCode, 1);
  assert.match(second.stderr.join("\n"), /proposal/i);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});

test("next blocks a proposal written with a stale runId", async () => {
  const workspace = await setupWorkspace("fake-agent-wrong-runid.mjs");

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /runId|run id/i);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});

test("next blocks state advancement when the proposal JSON is syntactically invalid", async () => {
  const workspace = await setupWorkspace("fake-agent-invalid-proposal.mjs");

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /json|proposal/i);
  const state = await readWorkflowState(workspace);
  assert.equal(state.phase, "requirement_understanding");
});

test("next blocks state advancement when a proposal claims a missing artifact", async () => {
  const workspace = await setupWorkspace("fake-agent-missing-artifact.mjs");

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /artifact/i);
  const state = await readWorkflowState(workspace);
  assert.equal(state.phase, "requirement_understanding");
});

test("next validates an agent-created allowed-change manifest before advancing state", async () => {
  const workspace = await setupWorkspace("fake-agent-invalid-manifest.mjs");

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /allowed|manifest|filesToModify/i);
  const state = await readWorkflowState(workspace);
  assert.equal(state.phase, "requirement_understanding");
  assert.equal((await runLogLines(workspace)).length, 1);
});

test("next blocks modifying .env after a Git-backed agent run", async (t) => {
  const workspace = await setupGitGuardrailWorkspace("fake-agent-modify-env.mjs");
  if (workspace === undefined) {
    t.skip("git is unavailable");
    return;
  }

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /\.env|protected/i);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
  assert.equal((await runLogLines(workspace)).length, 1);
});

test("next blocks agent edits to .agent-flow.json even when config would remove protectedPaths", async (t) => {
  const workspace = await setupGitGuardrailWorkspace("fake-agent-modify-agent-flow-config.mjs");
  if (workspace === undefined) {
    t.skip("git is unavailable");
    return;
  }

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /\.agent-flow\.json|agent-immutable|protected/i);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});

test("next blocks a dirty Git working tree before invoking the agent", async (t) => {
  const workspace = await setupGitGuardrailWorkspace("fake-agent.mjs");
  if (workspace === undefined) {
    t.skip("git is unavailable");
    return;
  }
  await writeFile(join(workspace, "dirty.txt"), "dirty\n", "utf8");

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /dirty|working tree|clean/i);
  assert.equal(await exists(join(workspace, ".agent", "invoked")), false);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});

test("next reports protected path guardrail before nonzero agent errors", async (t) => {
  const workspace = await setupGitGuardrailWorkspace("fake-agent-modify-env-nonzero.mjs");
  if (workspace === undefined) {
    t.skip("git is unavailable");
    return;
  }

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /\.env|protected/i);
  assert.doesNotMatch(result.stderr.join("\n"), /non-zero|exit/i);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
  assert.equal((await runLogLines(workspace)).length, 1);
});

test("next blocks protected workflow modification unless the manifest explicitly permits it", async (t) => {
  const workspace = await setupGitGuardrailWorkspace("fake-agent-modify-workflow.mjs");
  if (workspace === undefined) {
    t.skip("git is unavailable");
    return;
  }

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /\.github\/workflows|explicitly allowed|manifest/i);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});

test("next allows protected workflow modification when the manifest explicitly permits it", async (t) => {
  const workspace = await setupGitGuardrailWorkspace("fake-agent-modify-workflow-allowed.mjs");
  if (workspace === undefined) {
    t.skip("git is unavailable");
    return;
  }

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 0);
  assert.equal((await readWorkflowState(workspace)).phase, "spec_creation");
});

test("next blocks creating a file outside filesToCreate when a manifest is active", async (t) => {
  const workspace = await setupGitGuardrailWorkspace("fake-agent-create-outside-manifest.mjs");
  if (workspace === undefined) {
    t.skip("git is unavailable");
    return;
  }

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /filesToCreate|manifest|src\/rogue\.ts/i);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});

test("next continues in limited guardrail mode for non-Git workspaces", async () => {
  const workspace = await setupWorkspace("fake-agent.mjs");
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

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout.join("\n"), /limited guardrail/i);
  assert.equal((await readWorkflowState(workspace)).phase, "spec_creation");
});

test("next accepts an existing claimed artifact when the proposal has the current runId", async () => {
  const workspace = await setupWorkspace("fake-agent-invalid-manifest.mjs");
  const first = await captureMain(["--workspace", workspace, "next"]);
  assert.equal(first.exitCode, 1);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");

  await rm(join(workspace, ".agent", "artifacts", "allowed_change_manifest.json"), { force: true });
  await setImplementationFixture(workspace, "fake-agent-proposal-only.mjs");

  const second = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(second.exitCode, 0);
  assert.equal((await readWorkflowState(workspace)).phase, "spec_creation");
});

test("next validates the state artifact override for allowed-change manifest", async () => {
  const workspace = await setupWorkspace("fake-agent.mjs");
  const state = await readWorkflowState(workspace);
  state.artifacts.allowed_change_manifest = ".agent/custom-invalid-manifest.json";
  await writeFile(
    join(workspace, ".agent", "workflow_state.json"),
    JSON.stringify(state, null, 2) + "\n",
    "utf8",
  );
  await writeFile(
    join(workspace, ".agent", "custom-invalid-manifest.json"),
    JSON.stringify({ filesToInspect: [] }, null, 2) + "\n",
    "utf8",
  );

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /manifest|filesToModify/i);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});

test("next keeps the lock held until post-run validation and state update complete", async () => {
  const workspace = await setupWorkspace("fake-agent-lock-race.mjs");

  const result = await captureMain(["--workspace", workspace, "next"]);
  const acquiredPath = join(workspace, ".agent", "lock-race-acquired");
  const stoppedPath = join(workspace, ".agent", "lock-race-stopped");

  await waitForPath(acquiredPath, 500);

  assert.equal(result.exitCode, 0);
  assert.equal(await exists(acquiredPath), false);
  assert.equal(await waitForPath(stoppedPath, 2_500), true);
  assert.equal((await readWorkflowState(workspace)).phase, "spec_creation");
});

test("next does not report failure after state advances when lock release fails", async () => {
  const workspace = await setupWorkspace("fake-agent-corrupt-lock.mjs");

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout.join("\n"), /Advanced to spec_creation/);
  assert.match(result.stdout.join("\n"), /lock release failed/i);
  assert.equal((await readWorkflowState(workspace)).phase, "spec_creation");
});

test("next rejects an active user gate before invoking the agent", async () => {
  const workspace = await setupWorkspace("fake-agent.mjs");
  const state = await readWorkflowState(workspace);
  state.gates.approval = { active: true, reason: "Need approval" };
  await writeFile(
    join(workspace, ".agent", "workflow_state.json"),
    JSON.stringify(state, null, 2) + "\n",
    "utf8",
  );

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /gate/i);
  assert.equal(await exists(join(workspace, ".agent", "invoked")), false);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});

test("next rejects a configured agent command matching blockedCommands before invocation", async () => {
  const workspace = await setupWorkspace("fake-agent.mjs");
  const configPath = join(workspace, ".agent-flow.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    agents: {
      implementation: {
        command: string;
        args: string[];
      };
    };
  };
  config.agents.implementation.command = "git";
  config.agents.implementation.args = ["reset", "--hard"];
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /blocked command|git reset --hard/i);
  assert.equal(await exists(join(workspace, ".agent", "invoked")), false);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});

test("next rejects an existing lock before invoking the agent and does not overwrite it", async () => {
  const workspace = await setupWorkspace("fake-agent.mjs");
  const lockPath = join(workspace, ".agent", "agent-flow.lock");
  const existingLock = JSON.stringify({ pid: 111, command: "other", timestamp: "old" }) + "\n";
  await writeFile(lockPath, existingLock, "utf8");

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /lock/i);
  assert.equal(await exists(join(workspace, ".agent", "invoked")), false);
  assert.equal(await readFile(lockPath, "utf8"), existingLock);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});

test("next rejects an existing lock before reading invalid state", async () => {
  const workspace = await setupWorkspace("fake-agent.mjs");
  const lockPath = join(workspace, ".agent", "agent-flow.lock");
  await writeFile(lockPath, JSON.stringify({ pid: 111, command: "other", timestamp: "old" }) + "\n", "utf8");
  await writeFile(join(workspace, ".agent", "workflow_state.json"), "{ invalid json", "utf8");

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /lock/i);
  assert.doesNotMatch(result.stderr.join("\n"), /json/i);
  assert.equal(await exists(join(workspace, ".agent", "invoked")), false);
});

test("next rejects an existing lock before persisting a configured prompt", async () => {
  const workspace = await setupWorkspace("fake-agent.mjs");
  const configPath = join(workspace, ".agent-flow.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    logging?: { persistPrompts?: string };
  };
  config.logging = { persistPrompts: "configured" };
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  const lockPath = join(workspace, ".agent", "agent-flow.lock");
  await writeFile(lockPath, JSON.stringify({ pid: 111, command: "other", timestamp: "old" }) + "\n", "utf8");

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /lock/i);
  assert.equal(await exists(join(workspace, ".agent", "invoked")), false);
  assert.deepEqual(await readdir(join(workspace, ".agent", "prompts")), []);
});
