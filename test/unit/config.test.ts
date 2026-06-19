import * as assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { applyConfigDefaults } from "../../src/config/defaults.js";
import { loadConfig } from "../../src/config/load.js";
import {
  validateConfig,
  type AgentConfig,
  type AgentRole,
  type AutomationMode,
} from "../../src/config/schema.js";

const advisoryMode: AutomationMode = "advisory";
const implementationRole: AgentRole = "implementation";
const sampleAgentConfig: AgentConfig = {
  role: implementationRole,
  name: "Codex",
  command: "codex",
  args: ["exec"],
  inputMode: "stdin",
  outputMode: "stdout",
  timeoutSeconds: 300,
};
assert.equal(advisoryMode, "advisory");
assert.equal(sampleAgentConfig.role, "implementation");
// @ts-expect-error full-auto is not part of the v1 AutomationMode contract.
const unsupportedMode: AutomationMode = "full-auto";
void unsupportedMode;

async function tempWorkspace(): Promise<string> {
  const path = join(tmpdir(), `agent-flow-config-${Date.now()}-${Math.random()}`);
  await mkdir(path, { recursive: true });
  return path;
}

test("applyConfigDefaults returns a complete valid v1 config", () => {
  const config = applyConfigDefaults({ version: 1 });
  const result = validateConfig(config);

  assert.equal(result.ok, true);
  assert.equal(config.workspace.root, ".");
  assert.equal(config.workspace.stateDir, ".agent");
  assert.equal(config.workspace.artifactDir, ".agent/artifacts");
  assert.equal(config.workspace.promptDir, ".agent/prompts");
  assert.equal(config.workspace.logDir, ".agent/logs");
  assert.equal(config.mode.default, "assisted");
  assert.deepEqual(config.agents.implementation, {
    role: "implementation",
    name: "Codex",
    command: "codex",
    args: ["exec"],
    inputMode: "stdin",
    outputMode: "stdout",
    timeoutSeconds: config.limits.commandTimeoutSeconds,
  });
  assert.deepEqual(config.agents.review, {
    role: "review",
    name: "Claude Code",
    command: "claude",
    args: ["-p"],
    inputMode: "stdin",
    outputMode: "stdout",
    timeoutSeconds: config.limits.commandTimeoutSeconds,
  });
  assert.equal(config.guardrails.requireGitForFullGuardrails, true);
  assert.equal(config.guardrails.requireCleanWorkingTree, true);
  assert.deepEqual(config.guardrails.protectedPaths, [
    ".agent-flow.json",
    ".env",
    ".env.*",
    ".git/**",
    "node_modules/**",
    "dist/**",
    "build/**",
    "coverage/**",
  ]);
  assert.deepEqual(config.guardrails.protectedUnlessExplicitlyAllowed, [
    "package.json",
    "pnpm-lock.yaml",
    "package-lock.json",
    "yarn.lock",
    "Dockerfile",
    "docker-compose.yml",
    ".github/workflows/**",
  ]);
  assert.deepEqual(config.guardrails.blockedCommands, [
    "rm -rf",
    "git reset --hard",
    "git clean -fd",
    "docker system prune",
  ]);
  assert.deepEqual(config.commands, {
    typecheck: null,
    lint: null,
    test: null,
    build: null,
  });
  assert.deepEqual(config.projectContext, {
    sourceOfTruth: [],
    files: [],
    extraInstructions: [],
  });
  assert.equal(
    config.artifacts.allowedChangeManifest,
    ".agent/artifacts/allowed_change_manifest.json",
  );
  assert.deepEqual(config.logging, {
    transcriptCapture: "off",
    persistPrompts: "off",
  });
  assert.deepEqual(config.delegation, {
    enabled: false,
    delegatedGates: ["user_plan_approval"],
    autoPassBar: "approved_no_blocking_no_major",
    digestOnStop: true,
  });
});

test("validateConfig accepts advisory mode and rejects full-auto mode", () => {
  const advisoryResult = validateConfig({ version: 1, mode: { default: "advisory" } });
  assert.equal(advisoryResult.ok, true);
  if (advisoryResult.ok) {
    assert.equal(advisoryResult.value.mode.default, "advisory");
  }

  const fullAutoResult = validateConfig({ version: 1, mode: { default: "full-auto" } });
  assert.equal(fullAutoResult.ok, false);
  if (!fullAutoResult.ok) {
    assert.equal(fullAutoResult.error.path, "$.mode.default");
    assert.match(fullAutoResult.error.message, /advisory/i);
  }
});

test("validateConfig validates guardrails blockedCommands as a string array", () => {
  const validResult = validateConfig({
    version: 1,
    guardrails: { blockedCommands: ["git reset --hard"] },
  });
  assert.equal(validResult.ok, true);
  if (validResult.ok) {
    assert.deepEqual(validResult.value.guardrails.blockedCommands, ["git reset --hard"]);
  }

  const invalidResult = validateConfig({
    version: 1,
    guardrails: { blockedCommands: ["rm -rf", 42] },
  });
  assert.equal(invalidResult.ok, false);
  if (!invalidResult.ok) {
    assert.equal(invalidResult.error.path, "$.guardrails.blockedCommands[1]");
    assert.match(invalidResult.error.message, /strings/i);
  }
});

test("delegation config defaults to disabled v1 policy", () => {
  const config = applyConfigDefaults({ version: 1 });

  assert.deepEqual(config.delegation, {
    enabled: false,
    delegatedGates: ["user_plan_approval"],
    autoPassBar: "approved_no_blocking_no_major",
    digestOnStop: true,
  });
});

test("validateConfig accepts the v1 delegation config", () => {
  const result = validateConfig({
    version: 1,
    delegation: {
      enabled: true,
      delegatedGates: ["user_plan_approval"],
      autoPassBar: "approved_no_blocking_no_major",
      digestOnStop: true,
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.delegation.enabled, true);
  }
});

test("validateConfig rejects non-v1 delegation gates", () => {
  for (const gate of ["review_iteration", "user_verification", "user_spec_review"]) {
    const result = validateConfig({
      version: 1,
      delegation: { enabled: true, delegatedGates: [gate] },
    });

    assert.equal(result.ok, false, gate);
    if (!result.ok) {
      assert.match(result.error.message, /delegatedGates|user_plan_approval/i);
    }
  }
});

test("validateConfig rejects unsupported delegation auto pass bars", () => {
  const result = validateConfig({
    version: 1,
    delegation: { autoPassBar: "approved_with_minor_comments" },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.path, "$.delegation.autoPassBar");
  }
});

test("validateConfig accepts projectContext files and extraInstructions fields", () => {
  const result = validateConfig({
    version: 1,
    projectContext: {
      sourceOfTruth: ["SPEC.md"],
      files: ["src/index.ts"],
      extraInstructions: ["Keep changes focused."],
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.projectContext, {
      sourceOfTruth: ["SPEC.md"],
      files: ["src/index.ts"],
      extraInstructions: ["Keep changes focused."],
    });
  }
});

test("validateConfig returns stable snapshots of config arrays", () => {
  const implementationArgs = ["exec"];
  const reviewArgs = ["-p"];
  const protectedPaths = [".env"];
  const protectedUnlessExplicitlyAllowed = ["package.json"];
  const blockedCommands = ["rm -rf"];
  const sourceOfTruth = ["SPEC.md"];
  const files = ["src/index.ts"];
  const extraInstructions = ["Keep changes focused."];

  const result = validateConfig({
    version: 1,
    agents: {
      implementation: { args: implementationArgs },
      review: { args: reviewArgs },
    },
    guardrails: {
      protectedPaths,
      protectedUnlessExplicitlyAllowed,
      blockedCommands,
    },
    projectContext: {
      sourceOfTruth,
      files,
      extraInstructions,
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  implementationArgs.push("--unsafe");
  reviewArgs.push("--verbose");
  protectedPaths.push(".ssh/**");
  protectedUnlessExplicitlyAllowed.push("Dockerfile");
  blockedCommands.push("git reset --hard");
  sourceOfTruth.push("NOTES.md");
  files.push("src/other.ts");
  extraInstructions.push("Changed after validation.");

  assert.deepEqual(result.value.agents.implementation.args, ["exec"]);
  assert.deepEqual(result.value.agents.review.args, ["-p"]);
  assert.deepEqual(result.value.guardrails.protectedPaths, [".env"]);
  assert.deepEqual(result.value.guardrails.protectedUnlessExplicitlyAllowed, ["package.json"]);
  assert.deepEqual(result.value.guardrails.blockedCommands, ["rm -rf"]);
  assert.deepEqual(result.value.projectContext.sourceOfTruth, ["SPEC.md"]);
  assert.deepEqual(result.value.projectContext.files, ["src/index.ts"]);
  assert.deepEqual(result.value.projectContext.extraInstructions, ["Keep changes focused."]);
});

test("validateConfig restricts logging to off transcript capture and configured prompt persistence", () => {
  const configuredResult = validateConfig({
    version: 1,
    logging: { transcriptCapture: "off", persistPrompts: "configured" },
  });
  assert.equal(configuredResult.ok, true);
  if (configuredResult.ok) {
    assert.deepEqual(configuredResult.value.logging, {
      transcriptCapture: "off",
      persistPrompts: "configured",
    });
  }

  const transcriptOnResult = validateConfig({
    version: 1,
    logging: { transcriptCapture: "on" },
  });
  assert.equal(transcriptOnResult.ok, false);
  if (!transcriptOnResult.ok) {
    assert.equal(transcriptOnResult.error.path, "$.logging.transcriptCapture");
    assert.match(transcriptOnResult.error.message, /off/i);
  }

  const persistOnResult = validateConfig({
    version: 1,
    logging: { persistPrompts: "on" },
  });
  assert.equal(persistOnResult.ok, false);
  if (!persistOnResult.ok) {
    assert.equal(persistOnResult.error.path, "$.logging.persistPrompts");
    assert.match(persistOnResult.error.message, /configured/i);
  }
});

test("validateConfig rejects yaml configFormat marker", () => {
  const result = validateConfig({ version: 1, configFormat: "yaml" });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.path, "$.configFormat");
    assert.match(result.error.message, /unsupported|unknown|json/i);
  }
});

test("loadConfig defaults to .agent-flow.json and rejects yaml marker config", async () => {
  const dir = await tempWorkspace();
  await writeFile(join(dir, ".agent-flow.json"), JSON.stringify({ version: 1 }), "utf8");
  await writeFile(join(dir, ".agent-flow.yaml"), "version: 1\n", "utf8");

  const defaultResult = await loadConfig({ cwd: dir });
  assert.equal(defaultResult.ok, true);
  if (defaultResult.ok) {
    assert.equal(defaultResult.value.workspace.stateDir, ".agent");
  }

  const yamlResult = await loadConfig({ cwd: dir, configPath: ".agent-flow.yaml" });
  assert.equal(yamlResult.ok, false);
  if (!yamlResult.ok) {
    assert.equal(yamlResult.error.code, "UNSUPPORTED_CONFIG_FORMAT");
    assert.equal(yamlResult.error.path, join(dir, ".agent-flow.yaml"));
    assert.match(yamlResult.error.message, /JSON/i);
  }
});

test("loadConfig returns invalid JSON errors", async () => {
  const dir = await tempWorkspace();
  const configPath = join(dir, ".agent-flow.json");
  await writeFile(configPath, "{ invalid json", "utf8");

  const result = await loadConfig({ cwd: dir });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_JSON");
    assert.equal(result.error.path, configPath);
  }
});

test("loadConfig rejects non-object root", async () => {
  const dir = await tempWorkspace();
  const configPath = join(dir, ".agent-flow.json");
  await writeFile(configPath, "[]", "utf8");

  const result = await loadConfig({ cwd: dir });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.equal(result.error.path, "$");
    assert.match(result.error.message, /object/i);
  }
});

test("loadConfig returns missing file errors without creating files", async () => {
  const dir = await tempWorkspace();
  const configPath = join(dir, ".agent-flow.json");

  const result = await loadConfig({ cwd: dir });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "CONFIG_NOT_FOUND");
    assert.equal(result.error.path, configPath);
  }
});

test("validateConfig rejects wrong version with path-aware error", () => {
  const result = validateConfig({ version: 2 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.equal(result.error.path, "$.version");
    assert.match(result.error.message, /version 1/i);
  }
});

test("validateConfig rejects representative invalid fields with path-aware errors", () => {
  const cases: Array<{ name: string; input: unknown; path: string; message: RegExp }> = [
    {
      name: "wrong mode enum",
      input: { version: 1, mode: { default: "auto" } },
      path: "$.mode.default",
      message: /assisted/i,
    },
    {
      name: "empty agent command",
      input: { version: 1, agents: { implementation: { command: "" } } },
      path: "$.agents.implementation.command",
      message: /empty/i,
    },
    {
      name: "zero timeout limit",
      input: { version: 1, limits: { commandTimeoutSeconds: 0 } },
      path: "$.limits.commandTimeoutSeconds",
      message: /positive/i,
    },
    {
      name: "non-array project context",
      input: { version: 1, projectContext: { sourceOfTruth: "SPEC.md" } },
      path: "$.projectContext.sourceOfTruth",
      message: /array/i,
    },
    {
      name: "wrong logging enum",
      input: { version: 1, logging: { transcriptCapture: "always" } },
      path: "$.logging.transcriptCapture",
      message: /off/i,
    },
  ];

  for (const item of cases) {
    const result = validateConfig(item.input);

    assert.equal(result.ok, false, item.name);
    if (!result.ok) {
      assert.equal(result.error.path, item.path, item.name);
      assert.match(result.error.message, item.message, item.name);
    }
  }
});
