import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { filesystemError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";

export type ResolvedGuardPath = {
  absolutePath: string;
  realPath: string;
};

export type PathPatternOptions = {
  caseSensitive?: boolean;
};

export type GuardPathFs = {
  lstat: (path: string) => Promise<unknown>;
  realpath: (path: string) => Promise<string>;
};

export type GuardPathExistence = {
  exists: boolean;
  realPath?: string;
};

export function normalizePathForMatching(path: string): string {
  let normalized = path.replace(/\\/g, "/");
  normalized = normalized.replace(/\/+/g, "/");
  normalized = normalized.replace(/^\.\//, "");
  normalized = normalized.replace(/^([A-Z]):/, (_, drive: string) => `${drive.toLowerCase()}:`);
  return normalized.toLowerCase();
}

export function matchesPathPattern(
  candidatePath: string,
  pattern: string,
  options: PathPatternOptions = {},
): boolean {
  const candidate = normalizePathForMatchingMode(candidatePath, options);
  const normalizedPattern = normalizePathForMatchingMode(pattern, options);
  return matchSegments(candidate.split("/"), normalizedPattern.split("/"), options);
}

export function findMatchingPathPattern(
  candidatePath: string,
  patterns: string[],
  options: PathPatternOptions = {},
): string | undefined {
  return patterns.find((pattern) => matchesPathPattern(candidatePath, pattern, options));
}

export async function assertPathInsideWorkspace(
  workspace: string,
  candidatePath: string,
): Promise<Result<ResolvedGuardPath>> {
  const workspaceReal = await realpathOrError(workspace);
  if (!workspaceReal.ok) return workspaceReal;

  const absolutePath = isAbsolute(candidatePath)
    ? resolve(candidatePath)
    : resolve(workspace, candidatePath);
  const candidateReal = await resolveRealPathForCandidate(absolutePath, defaultGuardPathFs);
  if (!candidateReal.ok) return candidateReal;

  const workspaceRealPath = normalizeAbsolutePath(workspaceReal.value);
  const candidateRealPath = normalizeAbsolutePath(candidateReal.value);
  const relativePath = relative(workspaceRealPath, candidateRealPath);
  if (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  ) {
    return ok({ absolutePath, realPath: candidateReal.value });
  }

  return err({
    code: "GUARDRAIL_PATH_ESCAPE",
    path: candidatePath,
    message: `Path resolves outside workspace, possibly through a symlink: ${candidatePath}`,
  });
}

export async function resolveExistingPathForGuard(
  path: string,
  fs: GuardPathFs = defaultGuardPathFs,
): Promise<Result<GuardPathExistence>> {
  try {
    await fs.lstat(path);
  } catch (error) {
    if (isMissingPathError(error)) {
      return ok({ exists: false });
    }
    return err(filesystemError(errorMessage(error), path));
  }

  try {
    return ok({ exists: true, realPath: await fs.realpath(path) });
  } catch (error) {
    return err(filesystemError(errorMessage(error), path));
  }
}

async function resolveRealPathForCandidate(
  absolutePath: string,
  fs: GuardPathFs,
): Promise<Result<string>> {
  const existing = await resolveExistingPathForGuard(absolutePath, fs);
  if (!existing.ok) return existing;
  if (existing.value.exists) {
    if (existing.value.realPath === undefined) {
      return err(filesystemError(`Unable to resolve real path for ${absolutePath}`, absolutePath));
    }
    return ok(existing.value.realPath);
  }

  const nearest = await nearestExistingParent(absolutePath, fs);
  if (!nearest.ok) return nearest;

  return ok(resolve(nearest.value.realPath, nearest.value.remainder));
}

async function nearestExistingParent(
  absolutePath: string,
  fs: GuardPathFs,
): Promise<Result<{ parent: string; realPath: string; remainder: string }>> {
  let current = absolutePath;
  const missingSegments: string[] = [];

  for (;;) {
    const existing = await resolveExistingPathForGuard(current, fs);
    if (!existing.ok) return existing;
    if (existing.value.exists) {
      if (existing.value.realPath === undefined) {
        return err(filesystemError(`Unable to resolve real path for ${current}`, current));
      }
      return ok({
        parent: current,
        realPath: existing.value.realPath,
        remainder: missingSegments.join(sep),
      });
    }

    const parent = dirname(current);
    if (parent === current) {
      return err(filesystemError(`No existing parent found for ${absolutePath}`, absolutePath));
    }
    missingSegments.unshift(current.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
    current = parent;
  }
}

async function realpathOrError(path: string): Promise<Result<string>> {
  try {
    return ok(await realpath(path));
  } catch (error) {
    return err(filesystemError(errorMessage(error), path));
  }
}

function normalizePathForMatchingMode(path: string, options: PathPatternOptions): string {
  let normalized = path.replace(/\\/g, "/");
  normalized = normalized.replace(/\/+/g, "/");
  normalized = normalized.replace(/^\.\//, "");
  normalized = normalized.replace(/^([A-Z]):/, (_, drive: string) => `${drive.toLowerCase()}:`);
  return options.caseSensitive === true ? normalized : normalized.toLowerCase();
}

function matchSegments(
  candidateSegments: string[],
  patternSegments: string[],
  options: PathPatternOptions,
): boolean {
  if (patternSegments.length === 0) {
    return candidateSegments.length === 0;
  }

  const [patternHead, ...patternTail] = patternSegments;
  if (patternHead === "**") {
    if (matchSegments(candidateSegments, patternTail, options)) {
      return true;
    }
    return candidateSegments.length > 0 && matchSegments(candidateSegments.slice(1), patternSegments, options);
  }

  const [candidateHead, ...candidateTail] = candidateSegments;
  if (candidateHead === undefined || patternHead === undefined) {
    return false;
  }

  if (!matchesSegment(candidateHead, patternHead, options)) {
    return false;
  }
  return matchSegments(candidateTail, patternTail, options);
}

function matchesSegment(candidate: string, pattern: string, options: PathPatternOptions): boolean {
  if (!pattern.includes("*")) {
    return candidate === pattern;
  }
  const regex = new RegExp(
    `^${escapeRegex(pattern).replace(/\*/g, "[^/]*")}$`,
    options.caseSensitive === true ? "" : "i",
  );
  return regex.test(candidate);
}

function normalizeAbsolutePath(path: string): string {
  return resolve(path);
}

function escapeRegex(input: string): string {
  return input.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function isMissingPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Filesystem operation failed";
}

const defaultGuardPathFs: GuardPathFs = {
  lstat,
  realpath,
};
