import * as assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../../src/cli/main.js";

async function tempWorkspace(): Promise<string> {
  const path = join(tmpdir(), `agent-flow-config-validate-${Date.now()}-${Math.random()}`);
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

test("config validate prints success for a valid defaulted config", async () => {
  const workspace = await tempWorkspace();
  await writeFile(join(workspace, ".agent-flow.json"), JSON.stringify({ version: 1 }), "utf8");

  const result = await captureMain(["--workspace", workspace, "config", "validate"]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.stderr, []);
  assert.deepEqual(result.stdout, ["Config valid"]);
});

test("config validate prints path-aware errors for invalid config", async () => {
  const workspace = await tempWorkspace();
  await writeFile(
    join(workspace, ".agent-flow.json"),
    JSON.stringify({ version: 1, limits: { commandTimeoutSeconds: 0 } }),
    "utf8",
  );

  const result = await captureMain(["--workspace", workspace, "config", "validate"]);

  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.stdout, []);
  const output = result.stderr.join("\n");
  assert.match(output, /VALIDATION_ERROR/);
  assert.match(output, /\$\.limits\.commandTimeoutSeconds/);
  assert.match(output, /positive integer/i);
});

test("config validate accepts strict flag without extra command checks", async () => {
  const workspace = await tempWorkspace();
  await writeFile(join(workspace, ".agent-flow.json"), JSON.stringify({ version: 1 }), "utf8");

  const result = await captureMain(["--workspace", workspace, "--strict", "config", "validate"]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.stdout, ["Config valid"]);
});
