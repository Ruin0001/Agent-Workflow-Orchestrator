import * as assert from "node:assert/strict";
import { test } from "node:test";

test("importing main has no stdout or stderr side effects and exposes main", async () => {
  const stdout: unknown[][] = [];
  const stderr: unknown[][] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    stdout.push(args);
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args);
  };

  try {
    const module = await import(`../../src/cli/main.js?side-effect-test=${Date.now()}`);

    assert.equal(typeof module.main, "function");
    assert.deepEqual(stdout, []);
    assert.deepEqual(stderr, []);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});
