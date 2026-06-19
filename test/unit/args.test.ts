import * as assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "../../src/cli/args.js";

test("parses init command", () => {
  const result = parseArgs(["init"]);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.name, "init");
    assert.deepEqual(result.value.flags, {});
  }
});

test("parses status command", () => {
  const result = parseArgs(["status"]);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.name, "status");
  }
});

test("parses config validate command as config-validate", () => {
  const result = parseArgs(["config", "validate"]);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.name, "config-validate");
  }
});

test("parses next command", () => {
  const result = parseArgs(["next"]);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.name, "next");
  }
});

test("parses run-until-user-gate command", () => {
  const result = parseArgs(["run-until-user-gate"]);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.name, "run-until-user-gate");
  }
});

test("parses delegated flag for run-until-user-gate", () => {
  const result = parseArgs(["--delegated", "run-until-user-gate"]);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.name, "run-until-user-gate");
    assert.equal(result.value.flags.delegated, true);
  }
});

test("parses config and workspace path flags", () => {
  const result = parseArgs([
    "status",
    "--config",
    ".agent-flow.json",
    "--workspace",
    "packages/app",
  ]);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.flags, {
      config: ".agent-flow.json",
      workspace: "packages/app",
    });
  }
});

test("parses boolean flags", () => {
  const result = parseArgs(["config", "validate", "--strict"]);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.name, "config-validate");
    assert.deepEqual(result.value.flags, { strict: true });
  }
});

test("returns usage error for unknown flags", () => {
  const result = parseArgs(["status", "--verbose"]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "USAGE_ERROR");
    assert.match(result.error.message, /Unknown flag: --verbose/);
  }
});

test("treats tokens after delimiter as positionals", () => {
  const result = parseArgs(["--", "not-a-command"]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "USAGE_ERROR");
    assert.match(result.error.message, /Unknown command: not-a-command/);
  }
});

test("treats flag-shaped tokens after delimiter as positionals", () => {
  const result = parseArgs(["--", "--verbose"]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "USAGE_ERROR");
    assert.match(result.error.message, /Unknown command: --verbose/);
    assert.doesNotMatch(result.error.message, /Unknown flag/);
  }
});

test("treats delegated after delimiter as positional", () => {
  const result = parseArgs(["--", "--delegated", "run-until-user-gate"]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error.message, /Unknown command: --delegated run-until-user-gate/);
  }
});

test("returns usage error for unknown commands", () => {
  const result = parseArgs(["not-a-command"]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "USAGE_ERROR");
    assert.match(result.error.message, /Unknown command/);
  }
});
