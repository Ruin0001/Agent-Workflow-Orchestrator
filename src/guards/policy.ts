import type { AllowedChangeManifest } from "../artifacts/manifest.js";
import type { AgentFlowConfig } from "../config/schema.js";
import { err, ok, type Result } from "../core/result.js";
import type { ChangedFile } from "./git-diff.js";
import {
  assertPathInsideWorkspace,
  findMatchingPathPattern,
  matchesPathPattern,
} from "./path-patterns.js";

export type EnforceChangePolicyOptions = {
  workspace: string;
  config: AgentFlowConfig;
  changedFiles: ChangedFile[];
  manifest?: AllowedChangeManifest | undefined;
  ignoredPatterns?: string[] | undefined;
};

const dependencyFilePatterns = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
];

export async function enforceChangePolicy(
  options: EnforceChangePolicyOptions,
): Promise<Result<void>> {
  const ignoredPatterns = options.ignoredPatterns ?? [];
  const changedFiles = options.changedFiles.filter(
    (file) => !isFullyIgnored(file, ignoredPatterns),
  );

  const limitResult = enforceLimits(options.config, changedFiles);
  if (!limitResult.ok) return limitResult;

  for (const file of changedFiles) {
    const insideWorkspace = await assertPathInsideWorkspace(options.workspace, file.path);
    if (!insideWorkspace.ok) return insideWorkspace;

    const pathsToProtect = file.previousPath === undefined ? [file.path] : [file.path, file.previousPath];
    const protectedMatch = findFirstMatchingPathPattern(
      pathsToProtect,
      options.config.guardrails.protectedPaths,
    );
    if (protectedMatch !== undefined) {
      return err({
        code: "GUARDRAIL_PROTECTED_PATH",
        path: protectedMatch.path,
        message: `Protected path changed: ${protectedMatch.path} matches ${protectedMatch.pattern}`,
      });
    }

    const forbiddenPattern =
      options.manifest === undefined
        ? undefined
        : findFirstMatchingPathPattern(pathsToProtect, options.manifest.forbiddenPaths)?.pattern;
    if (forbiddenPattern !== undefined) {
      return err({
        code: "GUARDRAIL_FORBIDDEN_PATH",
        path: file.path,
        message: `Manifest forbiddenPaths blocked changed path: ${file.path}`,
      });
    }

    const protectedUnlessMatch = findFirstMatchingPathPattern(
      pathsToProtect,
      options.config.guardrails.protectedUnlessExplicitlyAllowed,
    );
    const dependencyPattern = dependencyFilePatternForPath(file.path);
    const dependencyAllowed = isDependencyChangeAllowed(file, options.manifest);
    if (
      protectedUnlessMatch !== undefined &&
      !isPathExplicitlyAllowedByManifest(
        protectedUnlessMatch.path,
        "modified",
        options.manifest,
      ) &&
      !(dependencyPattern !== undefined && dependencyAllowed)
    ) {
      return err({
        code: "GUARDRAIL_EXPLICIT_PERMISSION_REQUIRED",
        path: protectedUnlessMatch.path,
        message:
          `Protected path requires explicit manifest permission: ${protectedUnlessMatch.path} matches ${protectedUnlessMatch.pattern}`,
      });
    }

    if (
      dependencyPattern !== undefined &&
      !dependencyAllowed
    ) {
      return err({
        code: "GUARDRAIL_DEPENDENCY_CHANGE_BLOCKED",
        path: file.path,
        message:
          `Dependency file change requires dependencyChanges.allowed or explicit manifest permission: ${file.path}`,
      });
    }

    if (
      options.manifest !== undefined &&
      !isManifestScopeAllowed(file, options.manifest) &&
      !(dependencyPattern !== undefined && dependencyAllowed)
    ) {
      const missingPath = missingManifestScopePath(file, options.manifest);
      const allowedField =
        file.status === "created" && missingPath === file.path ? "filesToCreate" : "filesToModify";
      return err({
        code: "GUARDRAIL_MANIFEST_SCOPE_VIOLATION",
        path: missingPath,
        message: `Changed path is not listed in manifest ${allowedField}: ${missingPath}`,
      });
    }
  }

  return ok(undefined);
}

function enforceLimits(config: AgentFlowConfig, changedFiles: ChangedFile[]): Result<void> {
  const addedLines = changedFiles.reduce((sum, file) => sum + file.addedLines, 0);
  const deletedLines = changedFiles.reduce((sum, file) => sum + file.deletedLines, 0);

  if (changedFiles.length > config.limits.maxChangedFiles) {
    return err({
      code: "GUARDRAIL_LIMIT_EXCEEDED",
      message:
        `Changed file count ${changedFiles.length} exceeds configured limit ${config.limits.maxChangedFiles}.`,
    });
  }
  if (addedLines > config.limits.maxAddedLines) {
    return err({
      code: "GUARDRAIL_LIMIT_EXCEEDED",
      message: `Added line count ${addedLines} exceeds configured limit ${config.limits.maxAddedLines}.`,
    });
  }
  if (deletedLines > config.limits.maxDeletedLines) {
    return err({
      code: "GUARDRAIL_LIMIT_EXCEEDED",
      message:
        `Deleted line count ${deletedLines} exceeds configured limit ${config.limits.maxDeletedLines}.`,
    });
  }

  return ok(undefined);
}

function isDependencyChangeAllowed(
  file: ChangedFile,
  manifest: AllowedChangeManifest | undefined,
): boolean {
  if (manifest === undefined) {
    return false;
  }
  return manifest.dependencyChanges.allowed || isExplicitlyAllowedByManifest(file, manifest);
}

function isExplicitlyAllowedByManifest(
  file: ChangedFile,
  manifest: AllowedChangeManifest | undefined,
): boolean {
  return isPathExplicitlyAllowedByManifest(file.path, file.status, manifest);
}

function isManifestScopeAllowed(file: ChangedFile, manifest: AllowedChangeManifest): boolean {
  if (!isExplicitlyAllowedByManifest(file, manifest)) {
    return false;
  }
  return (
    file.previousPath === undefined ||
    isPathExplicitlyAllowedByManifest(file.previousPath, "modified", manifest)
  );
}

function missingManifestScopePath(file: ChangedFile, manifest: AllowedChangeManifest): string {
  if (!isExplicitlyAllowedByManifest(file, manifest)) {
    return file.path;
  }
  if (
    file.previousPath !== undefined &&
    !isPathExplicitlyAllowedByManifest(file.previousPath, "modified", manifest)
  ) {
    return file.previousPath;
  }
  return file.path;
}

function isPathExplicitlyAllowedByManifest(
  path: string,
  status: ChangedFile["status"],
  manifest: AllowedChangeManifest | undefined,
): boolean {
  if (manifest === undefined) {
    return false;
  }
  const allowedPaths = status === "created" ? manifest.filesToCreate : manifest.filesToModify;
  return allowedPaths.some((allowedPath) =>
    matchesPathPattern(path, allowedPath, { caseSensitive: true }),
  );
}

function isFullyIgnored(file: ChangedFile, ignoredPatterns: string[]): boolean {
  if (ignoredPatterns.length === 0) {
    return false;
  }
  if (findMatchingPathPattern(file.path, ignoredPatterns) === undefined) {
    return false;
  }
  return (
    file.previousPath === undefined ||
    findMatchingPathPattern(file.previousPath, ignoredPatterns) !== undefined
  );
}

function findFirstMatchingPathPattern(
  paths: string[],
  patterns: string[],
  options: { caseSensitive?: boolean } = {},
): { path: string; pattern: string } | undefined {
  for (const path of paths) {
    const pattern = findMatchingPathPattern(path, patterns, options);
    if (pattern !== undefined) {
      return { path, pattern };
    }
  }
  return undefined;
}

function dependencyFilePatternForPath(path: string): string | undefined {
  const normalized = path.replace(/\\/g, "/");
  const basename = normalized.split("/").at(-1);
  return dependencyFilePatterns.find((pattern) => pattern === basename);
}
