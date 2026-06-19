import * as assert from "node:assert/strict";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { validateAllowedChangeManifest } from "../../src/artifacts/manifest.js";
import { applyConfigDefaults } from "../../src/config/defaults.js";
import {
  assertPathInsideWorkspace,
  findMatchingPathPattern,
  matchesPathPattern,
  normalizePathForMatching,
  resolveExistingPathForGuard,
} from "../../src/guards/path-patterns.js";
import { enforceChangePolicy } from "../../src/guards/policy.js";

async function tempDir(name: string): Promise<string> {
  const path = join(tmpdir(), `agent-flow-${name}-${Date.now()}-${Math.random()}`);
  await mkdir(path, { recursive: true });
  return path;
}

test("normalizes Windows-style protected paths for case-insensitive matching", () => {
  assert.equal(normalizePathForMatching(".GIT\\config"), ".git/config");
  assert.equal(matchesPathPattern(".GIT\\config", ".git/**"), true);
});

test(".env.local matches the .env.* protected pattern", () => {
  assert.equal(matchesPathPattern(".env.local", ".env.*"), true);
});

test("node_modules package files are protected by subtree patterns", () => {
  assert.equal(findMatchingPathPattern("node_modules/pkg/index.js", ["node_modules/**"]), "node_modules/**");
});

test("globstar patterns match leading and middle directory spans", () => {
  assert.equal(matchesPathPattern("src/deep/secrets.txt", "**/secrets.txt"), true);
  assert.equal(matchesPathPattern("a/x/y/b", "a/**/b"), true);
  assert.equal(matchesPathPattern("a/b", "a/**/b"), true);
  assert.equal(matchesPathPattern("a/x/y/c", "a/**/b"), false);
});

test("protected-unless-authorized files require explicit manifest permission", async () => {
  const config = applyConfigDefaults({ version: 1 });
  const changedFile = {
    path: ".github/workflows/test.yml",
    status: "modified" as const,
    addedLines: 1,
    deletedLines: 0,
  };

  const blocked = await enforceChangePolicy({
    workspace: process.cwd(),
    config,
    changedFiles: [changedFile],
    manifest: undefined,
  });

  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.match(blocked.error.message, /explicitly allowed|manifest/i);
  }

  const manifest = validateAllowedChangeManifest({
    filesToInspect: [],
    filesToModify: [".github/workflows/test.yml"],
    filesToCreate: [],
    forbiddenPaths: [],
    dependencyChanges: { allowed: false },
    migrationChanges: { allowed: false },
    destructiveActions: { allowed: false },
  });
  assert.equal(manifest.ok, true);
  if (!manifest.ok) return;

  const allowed = await enforceChangePolicy({
    workspace: process.cwd(),
    config,
    changedFiles: [changedFile],
    manifest: manifest.value,
  });

  assert.equal(allowed.ok, true);
});

test("dependencyChanges.allowed permits default dependency files without explicit path permission", async () => {
  const config = applyConfigDefaults({ version: 1 });
  const manifest = validateAllowedChangeManifest({
    filesToInspect: [],
    filesToModify: [],
    filesToCreate: [],
    forbiddenPaths: [],
    dependencyChanges: { allowed: true },
    migrationChanges: { allowed: false },
    destructiveActions: { allowed: false },
  });
  assert.equal(manifest.ok, true);
  if (!manifest.ok) return;

  const result = await enforceChangePolicy({
    workspace: process.cwd(),
    config,
    changedFiles: [
      {
        path: "package.json",
        status: "modified",
        addedLines: 1,
        deletedLines: 0,
      },
    ],
    manifest: manifest.value,
  });

  assert.equal(result.ok, true);
});

test("nested dependency manifest files require dependency permission or explicit manifest permission", async () => {
  const config = applyConfigDefaults({
    version: 1,
    guardrails: { protectedUnlessExplicitlyAllowed: [] },
  });

  const blocked = await enforceChangePolicy({
    workspace: process.cwd(),
    config,
    changedFiles: [
      {
        path: "packages/app/package.json",
        status: "modified",
        addedLines: 1,
        deletedLines: 0,
      },
    ],
  });

  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.match(blocked.error.message, /dependency/i);
  }

  const manifest = validateAllowedChangeManifest({
    filesToInspect: [],
    filesToModify: [],
    filesToCreate: [],
    forbiddenPaths: [],
    dependencyChanges: { allowed: true },
    migrationChanges: { allowed: false },
    destructiveActions: { allowed: false },
  });
  assert.equal(manifest.ok, true);
  if (!manifest.ok) return;

  const allowed = await enforceChangePolicy({
    workspace: process.cwd(),
    config,
    changedFiles: [
      {
        path: "packages/app/package.json",
        status: "modified",
        addedLines: 1,
        deletedLines: 0,
      },
    ],
    manifest: manifest.value,
  });

  assert.equal(allowed.ok, true);
});

test("manifest path allowlists are case-sensitive", async () => {
  const config = applyConfigDefaults({
    version: 1,
    guardrails: { protectedUnlessExplicitlyAllowed: [] },
  });
  const manifest = validateAllowedChangeManifest({
    filesToInspect: [],
    filesToModify: [],
    filesToCreate: ["src/foo.ts"],
    forbiddenPaths: [],
    dependencyChanges: { allowed: false },
    migrationChanges: { allowed: false },
    destructiveActions: { allowed: false },
  });
  assert.equal(manifest.ok, true);
  if (!manifest.ok) return;

  const result = await enforceChangePolicy({
    workspace: process.cwd(),
    config,
    changedFiles: [
      {
        path: "src/FOO.ts",
        status: "created",
        addedLines: 1,
        deletedLines: 0,
      },
    ],
    manifest: manifest.value,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error.message, /filesToCreate|manifest/i);
  }
});

test("manifest forbiddenPaths are matched case-insensitively for Windows-style safety", async () => {
  const config = applyConfigDefaults({ version: 1 });
  const manifest = validateAllowedChangeManifest({
    filesToInspect: [],
    filesToModify: ["src/allowed.ts"],
    filesToCreate: [],
    forbiddenPaths: ["src/secrets.txt"],
    dependencyChanges: { allowed: false },
    migrationChanges: { allowed: false },
    destructiveActions: { allowed: false },
  });
  assert.equal(manifest.ok, true);
  if (!manifest.ok) return;

  const result = await enforceChangePolicy({
    workspace: process.cwd(),
    config,
    changedFiles: [
      {
        path: "SRC/SECRETS.TXT",
        status: "modified",
        addedLines: 1,
        deletedLines: 0,
      },
    ],
    manifest: manifest.value,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "GUARDRAIL_FORBIDDEN_PATH");
  }
});

test("ignored destination paths do not hide protected rename sources", async () => {
  const result = await enforceChangePolicy({
    workspace: process.cwd(),
    config: applyConfigDefaults({ version: 1 }),
    changedFiles: [
      {
        path: ".agent/stolen",
        previousPath: ".env",
        status: "modified",
        addedLines: 0,
        deletedLines: 0,
      },
    ],
    ignoredPatterns: [".agent/**"],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error.message, /\.env|protected/i);
  }
});

test("agent flow config is blocked even when protectedPaths is overridden", async () => {
  const blocked = await enforceChangePolicy({
    workspace: process.cwd(),
    config: applyConfigDefaults({
      version: 1,
      guardrails: { protectedPaths: [] },
    }),
    changedFiles: [
      {
        path: ".agent-flow.json",
        status: "modified",
        addedLines: 1,
        deletedLines: 1,
      },
    ],
  });

  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.error.code, "GUARDRAIL_AGENT_IMMUTABLE_PATH");
    assert.match(blocked.error.message, /\.agent-flow\.json|agent-immutable/i);
  }
});

test("renaming agent flow config is blocked by the hard-coded guardrail", async () => {
  const blocked = await enforceChangePolicy({
    workspace: process.cwd(),
    config: applyConfigDefaults({
      version: 1,
      guardrails: { protectedPaths: [] },
    }),
    changedFiles: [
      {
        path: "agent-flow-renamed.json",
        previousPath: ".agent-flow.json",
        status: "modified",
        addedLines: 0,
        deletedLines: 0,
      },
    ],
  });

  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.error.code, "GUARDRAIL_AGENT_IMMUTABLE_PATH");
  }
});

test("protected-unless rename sources require permission for the protected source path", async () => {
  const manifest = validateAllowedChangeManifest({
    filesToInspect: [],
    filesToModify: ["src/safe.yml"],
    filesToCreate: [],
    forbiddenPaths: [],
    dependencyChanges: { allowed: false },
    migrationChanges: { allowed: false },
    destructiveActions: { allowed: false },
  });
  assert.equal(manifest.ok, true);
  if (!manifest.ok) return;

  const result = await enforceChangePolicy({
    workspace: process.cwd(),
    config: applyConfigDefaults({ version: 1 }),
    changedFiles: [
      {
        path: "src/safe.yml",
        previousPath: ".github/workflows/test.yml",
        status: "modified",
        addedLines: 0,
        deletedLines: 0,
      },
    ],
    manifest: manifest.value,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error.message, /\.github\/workflows|explicit/i);
  }
});

test("manifest scope requires unprotected rename source paths to be explicitly allowed", async () => {
  const manifest = validateAllowedChangeManifest({
    filesToInspect: [],
    filesToModify: ["src/allowed.ts"],
    filesToCreate: [],
    forbiddenPaths: [],
    dependencyChanges: { allowed: false },
    migrationChanges: { allowed: false },
    destructiveActions: { allowed: false },
  });
  assert.equal(manifest.ok, true);
  if (!manifest.ok) return;

  const result = await enforceChangePolicy({
    workspace: process.cwd(),
    config: applyConfigDefaults({
      version: 1,
      guardrails: { protectedUnlessExplicitlyAllowed: [] },
    }),
    changedFiles: [
      {
        path: "src/allowed.ts",
        previousPath: "src/secret.ts",
        status: "modified",
        addedLines: 0,
        deletedLines: 0,
      },
    ],
    manifest: manifest.value,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error.message, /src\/secret\.ts|filesToModify|manifest/i);
  }
});

test("path guard resolver treats unexpected lstat errors as blocking errors", async () => {
  const result = await resolveExistingPathForGuard("blocked", {
    lstat: async () => {
      const error = new Error("permission denied") as NodeJS.ErrnoException;
      error.code = "EACCES";
      throw error;
    },
    realpath: async () => "/unreachable",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error.message, /permission denied/i);
  }
});

test("symlink escape is detected when the platform supports symlink creation", async (t) => {
  const workspace = await tempDir("symlink-workspace");
  const outside = await tempDir("symlink-outside");
  await writeFile(join(outside, "secret.txt"), "secret\n", "utf8");

  try {
    await symlink(outside, join(workspace, "linked"), "dir");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (
      nodeError.code === "EPERM" ||
      nodeError.code === "EACCES" ||
      nodeError.code === "ENOTSUP"
    ) {
      t.skip("platform does not allow symlink creation in this test environment");
      return;
    }
    throw error;
  }

  const result = await assertPathInsideWorkspace(workspace, "linked/secret.txt");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error.message, /outside workspace|symlink/i);
  }

  await rm(workspace, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});
