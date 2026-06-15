import * as assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../../src/cli/main.js";
import { initCommand } from "../../src/commands/init.js";
import { statusCommand } from "../../src/commands/status.js";
import { validateConfig } from "../../src/config/schema.js";
import { validateState } from "../../src/state/schema.js";

async function tempWorkspace(): Promise<string> {
  const path = join(tmpdir(), `agent-flow-init-status-${Date.now()}-${Math.random()}`);
  await mkdir(path, { recursive: true });
  return path;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
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

test("init creates default config, canonical state, and workflow directories", async () => {
  const workspace = await tempWorkspace();

  const result = await captureMain(["--workspace", workspace, "init"]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.stderr, []);
  assert.match(result.stdout.join("\n"), /initialized/i);

  const paths = [
    ".agent-flow.json",
    ".agent/workflow_state.json",
    ".agent/handoff.md",
    ".agent/logs/agent_log.md",
    ".agent/logs/runs.jsonl",
    ".agent/artifacts",
    ".agent/prompts",
    ".agent/logs",
  ];
  for (const path of paths) {
    assert.equal(await exists(join(workspace, path)), true, path);
  }

  const configJson = JSON.parse(await readFile(join(workspace, ".agent-flow.json"), "utf8")) as unknown;
  const config = validateConfig(configJson);
  assert.equal(config.ok, true);

  const stateJson = JSON.parse(
    await readFile(join(workspace, ".agent/workflow_state.json"), "utf8"),
  ) as unknown;
  const state = validateState(stateJson);
  assert.equal(state.ok, true);
  if (state.ok) {
    assert.equal(state.value.phase, "requirement_understanding");
    assert.equal(state.value.status, "ready");
    assert.equal(state.value.currentActor, "implementation");
    assert.equal(state.value.nextActor, "implementation");
  }
});

test("init preserves an existing config file", async () => {
  const workspace = await tempWorkspace();
  const configPath = join(workspace, ".agent-flow.json");
  const existingConfig = '{\n  "version": 1,\n  "mode": { "default": "advisory" }\n}\n';
  await writeFile(configPath, existingConfig, "utf8");

  const result = await captureMain(["--workspace", workspace, "init"]);

  assert.equal(result.exitCode, 0);
  assert.equal(await readFile(configPath, "utf8"), existingConfig);
});

test("init uses workspace paths from an existing config file without overwriting it", async () => {
  const workspace = await tempWorkspace();
  const configPath = join(workspace, ".agent-flow.json");
  const existingConfig = JSON.stringify(
    {
      version: 1,
      workspace: {
        stateDir: ".custom/state",
        logDir: ".custom/logs",
        artifactDir: ".custom/artifacts",
        promptDir: ".custom/prompts",
      },
    },
    null,
    2,
  ) + "\n";
  await writeFile(configPath, existingConfig, "utf8");

  const result = await initCommand({ workspace });

  assert.equal(result.ok, true);
  assert.equal(await readFile(configPath, "utf8"), existingConfig);

  const expectedPaths = [
    ".custom/state/workflow_state.json",
    ".custom/state/handoff.md",
    ".custom/logs/agent_log.md",
    ".custom/logs/runs.jsonl",
    ".custom/artifacts",
    ".custom/prompts",
  ];
  for (const path of expectedPaths) {
    assert.equal(await exists(join(workspace, path)), true, path);
  }

  const defaultPaths = [
    ".agent/workflow_state.json",
    ".agent/handoff.md",
    ".agent/logs/agent_log.md",
    ".agent/logs/runs.jsonl",
    ".agent/artifacts",
    ".agent/prompts",
  ];
  for (const path of defaultPaths) {
    assert.equal(await exists(join(workspace, path)), false, path);
  }
});

test("status reports initialized workflow summary", async () => {
  const workspace = await tempWorkspace();
  assert.equal((await captureMain(["--workspace", workspace, "init"])).exitCode, 0);

  const result = await captureMain(["--workspace", workspace, "status"]);

  assert.equal(result.exitCode, 0);
  const output = result.stdout.join("\n");
  assert.match(output, /Phase:\s+requirement_understanding/);
  assert.match(output, /Status:\s+ready/);
  assert.match(output, /Current actor:\s+implementation/);
  assert.match(output, /Next actor:\s+implementation/);
  assert.match(output, /Active gates:\s+none/);
  assert.match(output, /Lock:\s+unlocked/);
  assert.match(output, /Next required action:/);
});

test("status reports not initialized when canonical state is missing", async () => {
  const workspace = await tempWorkspace();

  const result = await captureMain(["--workspace", workspace, "status"]);

  assert.equal(result.exitCode, 0);
  const output = result.stdout.join("\n");
  assert.match(output, /not initialized/i);
  assert.match(output, /agent-flow init/i);
});

test("status reports not initialized when config exists but state is missing", async () => {
  const workspace = await tempWorkspace();
  await writeFile(join(workspace, ".agent-flow.json"), '{\n  "version": 1\n}\n', "utf8");

  const result = await statusCommand({ workspace });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.match(result.value, /not initialized/i);
    assert.match(result.value, /agent-flow init/i);
  }
});
