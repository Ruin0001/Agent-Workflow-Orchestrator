import * as assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { appendFile, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { applyConfigDefaults } from "../../src/config/defaults.js";
import { collectGitDiffSummary } from "../../src/guards/git-diff.js";
import { enforceChangePolicy } from "../../src/guards/policy.js";

const execFileAsync = promisify(execFile);

async function tempGitWorkspace(): Promise<string | undefined> {
  const workspace = join(tmpdir(), `agent-flow-git-diff-${Date.now()}-${Math.random()}`);
  await mkdir(workspace, { recursive: true });
  await writeFile(join(workspace, "README.md"), "# baseline\n", "utf8");

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

test("untracked text files count added lines so added-line limits can block", async (t) => {
  const workspace = await tempGitWorkspace();
  if (workspace === undefined) {
    t.skip("git is unavailable");
    return;
  }
  await writeFile(join(workspace, "large.txt"), "one\ntwo\nthree\n", "utf8");

  const diff = await collectGitDiffSummary(workspace);

  assert.equal(diff.ok, true);
  if (!diff.ok || diff.value.limited) return;
  const file = diff.value.changedFiles.find((changedFile) => changedFile.path === "large.txt");
  assert.equal(file?.addedLines, 3);

  const config = applyConfigDefaults({
    version: 1,
    guardrails: { protectedUnlessExplicitlyAllowed: [] },
    limits: { maxAddedLines: 2 },
  });
  const policy = await enforceChangePolicy({
    workspace,
    config,
    changedFiles: diff.value.changedFiles,
  });

  assert.equal(policy.ok, false);
  if (!policy.ok) {
    assert.match(policy.error.message, /added line count/i);
  }
});

test("renaming a protected source path to an unprotected destination is blocked", async (t) => {
  const workspace = await tempGitWorkspace();
  if (workspace === undefined) {
    t.skip("git is unavailable");
    return;
  }
  await writeFile(join(workspace, ".env"), "SECRET=baseline\n", "utf8");
  await execFileAsync("git", ["add", ".env"], { cwd: workspace });
  await execFileAsync("git", ["commit", "-m", "add env"], { cwd: workspace });
  await execFileAsync("git", ["mv", ".env", "safe.txt"], { cwd: workspace });

  const diff = await collectGitDiffSummary(workspace);

  assert.equal(diff.ok, true);
  if (!diff.ok || diff.value.limited) return;
  const renamed = diff.value.changedFiles.find((file) => file.path === "safe.txt");
  assert.equal(renamed?.previousPath, ".env");

  const policy = await enforceChangePolicy({
    workspace,
    config: applyConfigDefaults({ version: 1 }),
    changedFiles: diff.value.changedFiles,
  });

  assert.equal(policy.ok, false);
  if (!policy.ok) {
    assert.match(policy.error.message, /\.env|protected/i);
  }
});

test("renamed files with edits count added lines toward limits", async (t) => {
  const workspace = await tempGitWorkspace();
  if (workspace === undefined) {
    t.skip("git is unavailable");
    return;
  }
  await writeFile(join(workspace, "old.txt"), "baseline\n", "utf8");
  await execFileAsync("git", ["add", "old.txt"], { cwd: workspace });
  await execFileAsync("git", ["commit", "-m", "add old"], { cwd: workspace });
  await execFileAsync("git", ["mv", "old.txt", "new.txt"], { cwd: workspace });
  await appendFile(join(workspace, "new.txt"), "one\ntwo\nthree\n", "utf8");

  const diff = await collectGitDiffSummary(workspace);

  assert.equal(diff.ok, true);
  if (!diff.ok || diff.value.limited) return;
  const renamed = diff.value.changedFiles.find((file) => file.path === "new.txt");
  assert.equal(renamed?.previousPath, "old.txt");
  assert.equal((renamed?.addedLines ?? 0) >= 3, true);

  const policy = await enforceChangePolicy({
    workspace,
    config: applyConfigDefaults({
      version: 1,
      guardrails: { protectedUnlessExplicitlyAllowed: [] },
      limits: { maxAddedLines: 2 },
    }),
    changedFiles: diff.value.changedFiles,
  });

  assert.equal(policy.ok, false);
  if (!policy.ok) {
    assert.match(policy.error.message, /added line count/i);
  }
});

test("mixed staged rename and unstaged edit counts deleted lines toward limits", async (t) => {
  const workspace = await tempGitWorkspace();
  if (workspace === undefined) {
    t.skip("git is unavailable");
    return;
  }
  await writeFile(join(workspace, "old.txt"), "one\ntwo\nthree\nfour\n", "utf8");
  await execFileAsync("git", ["add", "old.txt"], { cwd: workspace });
  await execFileAsync("git", ["commit", "-m", "add old"], { cwd: workspace });
  await execFileAsync("git", ["mv", "old.txt", "new.txt"], { cwd: workspace });
  await writeFile(join(workspace, "new.txt"), "one\n", "utf8");

  const diff = await collectGitDiffSummary(workspace);

  assert.equal(diff.ok, true);
  if (!diff.ok || diff.value.limited) return;
  const renamed = diff.value.changedFiles.find((file) => file.path === "new.txt");
  assert.equal(renamed?.previousPath, "old.txt");
  assert.equal((renamed?.deletedLines ?? 0) >= 3, true);

  const policy = await enforceChangePolicy({
    workspace,
    config: applyConfigDefaults({
      version: 1,
      guardrails: { protectedUnlessExplicitlyAllowed: [] },
      limits: { maxDeletedLines: 2 },
    }),
    changedFiles: diff.value.changedFiles,
  });

  assert.equal(policy.ok, false);
  if (!policy.ok) {
    assert.match(policy.error.message, /deleted line count/i);
  }
});

test("untracked symlinks fail closed instead of counting as zero lines", async (t) => {
  const workspace = await tempGitWorkspace();
  if (workspace === undefined) {
    t.skip("git is unavailable");
    return;
  }

  try {
    await symlink(join(workspace, "README.md"), join(workspace, "linked.txt"));
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

  const diff = await collectGitDiffSummary(workspace);

  assert.equal(diff.ok, false);
  if (!diff.ok) {
    assert.match(diff.error.message, /symlink|regular file/i);
  }
});
