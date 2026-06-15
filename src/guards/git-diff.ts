import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { AgentFlowConfig } from "../config/schema.js";
import { err, ok, type Result } from "../core/result.js";

const execFileAsync = promisify(execFile);

export type ChangedFileStatus = "created" | "modified" | "deleted";

export type ChangedFile = {
  path: string;
  previousPath?: string;
  status: ChangedFileStatus;
  addedLines: number;
  deletedLines: number;
};

export type GitLimitedMode = {
  available: false;
  limited: true;
  reason: string;
};

export type GitCleanMode = {
  available: true;
  limited: false;
  status: string;
};

export type GitDiffSummary = {
  available: true;
  limited: false;
  changedFiles: ChangedFile[];
  addedLines: number;
  deletedLines: number;
};

export async function checkGitCleanTree(
  workspace: string,
  config: AgentFlowConfig,
): Promise<Result<GitCleanMode | GitLimitedMode>> {
  const status = await gitStatus(workspace);
  if (!status.ok) {
    return ok({ available: false, limited: true, reason: status.error.message });
  }

  if (config.guardrails.requireCleanWorkingTree && status.value.trim() !== "") {
    return err({
      code: "GUARDRAIL_DIRTY_WORKING_TREE",
      message: "Git working tree must be clean before running an agent phase.",
      details: { status: status.value },
    });
  }

  return ok({ available: true, limited: false, status: status.value });
}

export async function collectGitDiffSummary(
  workspace: string,
): Promise<Result<GitDiffSummary | GitLimitedMode>> {
  const status = await gitStatus(workspace);
  if (!status.ok) {
    return ok({ available: false, limited: true, reason: status.error.message });
  }

  const numstat = await gitNumstat(workspace);
  if (!numstat.ok) {
    return ok({ available: false, limited: true, reason: numstat.error.message });
  }
  const untracked = await gitUntrackedFiles(workspace);
  if (!untracked.ok) {
    return ok({ available: false, limited: true, reason: untracked.error.message });
  }

  const statusEntries = await gitStatusEntries(workspace);
  if (!statusEntries.ok) {
    return ok({ available: false, limited: true, reason: statusEntries.error.message });
  }

  const lineCounts = parseNumstat(numstat.value);
  for (const path of untracked.value) {
    const addedLines = await countUntrackedAddedLines(workspace, path);
    if (!addedLines.ok) return addedLines;
    lineCounts.set(path, {
      addedLines: addedLines.value,
      deletedLines: 0,
    });
  }

  const changedFiles = [
    ...parseStatusEntries(statusEntries.value),
    ...untracked.value.map((path) => ({ path, status: "created" as const })),
  ].map((file) => {
    const counts = lineCountsForChangedFile(lineCounts, file);
    return {
      ...file,
      addedLines: counts.addedLines,
      deletedLines: counts.deletedLines,
    };
  });
  const addedLines = changedFiles.reduce((sum, file) => sum + file.addedLines, 0);
  const deletedLines = changedFiles.reduce((sum, file) => sum + file.deletedLines, 0);

  return ok({
    available: true,
    limited: false,
    changedFiles,
    addedLines,
    deletedLines,
  });
}

async function gitStatus(workspace: string): Promise<Result<string>> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: workspace });
    return ok(stdout);
  } catch (error) {
    return err({
      code: "GIT_UNAVAILABLE",
      message: errorMessage(error),
    });
  }
}

async function gitNumstat(workspace: string): Promise<Result<Buffer>> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--numstat", "-z", "HEAD", "--"],
      { cwd: workspace, encoding: "buffer" },
    );
    return ok(stdout);
  } catch (error) {
    return err({
      code: "GIT_UNAVAILABLE",
      message: errorMessage(error),
    });
  }
}

async function gitStatusEntries(workspace: string): Promise<Result<Buffer>> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["status", "--porcelain=v1", "-z"],
      { cwd: workspace, encoding: "buffer" },
    );
    return ok(stdout);
  } catch (error) {
    return err({
      code: "GIT_UNAVAILABLE",
      message: errorMessage(error),
    });
  }
}

async function gitUntrackedFiles(workspace: string): Promise<Result<string[]>> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      { cwd: workspace, encoding: "buffer" },
    );
    return ok(
      stdout
        .toString("utf8")
        .split("\0")
        .filter((path) => path !== ""),
    );
  } catch (error) {
    return err({
      code: "GIT_UNAVAILABLE",
      message: errorMessage(error),
    });
  }
}

function parseStatusEntries(source: Buffer): Array<Omit<ChangedFile, "addedLines" | "deletedLines">> {
  const output: Array<Omit<ChangedFile, "addedLines" | "deletedLines">> = [];
  const entries = source.toString("utf8").split("\0").filter((entry) => entry !== "");
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) continue;
    const status = entry.slice(0, 2);
    if (status === "??") {
      continue;
    }
    const path = entry.slice(3);
    if (path.trim() === "") {
      continue;
    }
    if (status.includes("R") || status.includes("C")) {
      const previousPath = entries[index + 1];
      index += 1;
      output.push({
        path,
        ...(previousPath === undefined ? {} : { previousPath }),
        status: statusForPorcelain(status),
      });
    } else {
      output.push({
        path,
        status: statusForPorcelain(status),
      });
    }
  }
  return output;
}

async function countUntrackedAddedLines(workspace: string, path: string): Promise<Result<number>> {
  const absolutePath = resolve(workspace, path);
  let stats: Awaited<ReturnType<typeof lstat>>;
  try {
    stats = await lstat(absolutePath);
  } catch (error) {
    return err({
      code: "GUARDRAIL_UNTRACKED_FILE_UNREADABLE",
      path,
      message: errorMessage(error),
    });
  }

  if (stats.isSymbolicLink()) {
    return err({
      code: "GUARDRAIL_UNTRACKED_FILE_UNSUPPORTED",
      path,
      message: `Untracked path must be a regular file, not a symlink: ${path}`,
    });
  }
  if (!stats.isFile()) {
    return err({
      code: "GUARDRAIL_UNTRACKED_FILE_UNSUPPORTED",
      path,
      message: `Untracked path must be a regular file: ${path}`,
    });
  }

  return streamLineCount(absolutePath, path);
}

function statusForPorcelain(status: string): ChangedFileStatus {
  if (status === "??" || status.includes("A")) {
    return "created";
  }
  if (status.includes("D")) {
    return "deleted";
  }
  return "modified";
}

function parseNumstat(source: Buffer): Map<string, { addedLines: number; deletedLines: number }> {
  const counts = new Map<string, { addedLines: number; deletedLines: number }>();
  const tokens = source.toString("utf8").split("\0").filter((token) => token !== "");
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) {
      continue;
    }
    const [added, deleted, rawPath] = token.split("\t");
    if (added === undefined || deleted === undefined) {
      continue;
    }
    let path = rawPath;
    if (path === undefined || path === "") {
      index += 2;
      path = tokens[index];
    }
    if (path === undefined) {
      continue;
    }
    counts.set(unquoteGitPath(path), {
      addedLines: added === "-" ? 0 : Number.parseInt(added, 10),
      deletedLines: deleted === "-" ? 0 : Number.parseInt(deleted, 10),
    });
  }
  return counts;
}

function lineCountsForChangedFile(
  lineCounts: Map<string, { addedLines: number; deletedLines: number }>,
  file: Omit<ChangedFile, "addedLines" | "deletedLines">,
): { addedLines: number; deletedLines: number } {
  const current = lineCounts.get(file.path);
  const previous = file.previousPath === undefined ? undefined : lineCounts.get(file.previousPath);
  return {
    addedLines: (current?.addedLines ?? 0) + (previous?.addedLines ?? 0),
    deletedLines: (current?.deletedLines ?? 0) + (previous?.deletedLines ?? 0),
  };
}

async function streamLineCount(absolutePath: string, displayPath: string): Promise<Result<number>> {
  const maxBytes = 10 * 1024 * 1024;
  let bytesRead = 0;
  let lines = 0;
  let lastByte: number | undefined;

  try {
    for await (const chunk of createReadStream(absolutePath)) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesRead += buffer.length;
      if (bytesRead > maxBytes) {
        return err({
          code: "GUARDRAIL_UNTRACKED_FILE_TOO_LARGE",
          path: displayPath,
          message: `Untracked text file exceeds safe line-count limit: ${displayPath}`,
        });
      }
      if (buffer.includes(0)) {
        return ok(0);
      }
      for (const byte of buffer) {
        if (byte === 10) lines += 1;
        lastByte = byte;
      }
    }
  } catch (error) {
    return err({
      code: "GUARDRAIL_UNTRACKED_FILE_UNREADABLE",
      path: displayPath,
      message: errorMessage(error),
    });
  }

  if (bytesRead === 0) {
    return ok(0);
  }
  return ok(lastByte === 10 ? lines : lines + 1);
}

function unquoteGitPath(path: string): string {
  if (path.startsWith('"') && path.endsWith('"')) {
    try {
      return JSON.parse(path) as string;
    } catch {
      return path.slice(1, -1);
    }
  }
  return path;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Git command failed";
}
