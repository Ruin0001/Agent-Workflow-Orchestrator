import * as assert from "node:assert/strict";
import { test } from "node:test";
import { runAgent } from "../../src/agents/runner.js";

test("runAgent returns a result when stdin closes before a large input is written", async () => {
  const result = await runAgent({
    role: "implementation",
    command: process.execPath,
    args: ["-e", "process.exit(0)"],
    cwd: process.cwd(),
    input: "x".repeat(16 * 1024 * 1024),
    timeoutMs: 5_000,
  });

  assert.equal(result.timedOut, false);
  assert.equal(result.exitCode, 0);
  assert.equal(typeof result.stdout, "string");
  assert.equal(typeof result.stderr, "string");
});
