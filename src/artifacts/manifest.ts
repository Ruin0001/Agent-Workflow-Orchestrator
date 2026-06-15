import { validationError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";

export type AllowedChangeManifest = {
  filesToInspect: string[];
  filesToModify: string[];
  filesToCreate: string[];
  forbiddenPaths: string[];
  dependencyChanges: { allowed: boolean };
  migrationChanges: { allowed: boolean };
  destructiveActions: { allowed: boolean };
};

type JsonObject = Record<string, unknown>;

export function validateAllowedChangeManifest(input: unknown): Result<AllowedChangeManifest> {
  const root = readObject(input, "$");
  if (!root.ok) return root;

  const filesToInspect = readStringArray(root.value.filesToInspect, "$.filesToInspect");
  if (!filesToInspect.ok) return filesToInspect;
  const filesToModify = readStringArray(root.value.filesToModify, "$.filesToModify");
  if (!filesToModify.ok) return filesToModify;
  const filesToCreate = readStringArray(root.value.filesToCreate, "$.filesToCreate");
  if (!filesToCreate.ok) return filesToCreate;
  const forbiddenPaths = readStringArray(root.value.forbiddenPaths, "$.forbiddenPaths");
  if (!forbiddenPaths.ok) return forbiddenPaths;

  const dependencyChanges = readAllowedFlag(root.value.dependencyChanges, "$.dependencyChanges");
  if (!dependencyChanges.ok) return dependencyChanges;
  const migrationChanges = readAllowedFlag(root.value.migrationChanges, "$.migrationChanges");
  if (!migrationChanges.ok) return migrationChanges;
  const destructiveActions = readAllowedFlag(root.value.destructiveActions, "$.destructiveActions");
  if (!destructiveActions.ok) return destructiveActions;

  return ok({
    filesToInspect: filesToInspect.value,
    filesToModify: filesToModify.value,
    filesToCreate: filesToCreate.value,
    forbiddenPaths: forbiddenPaths.value,
    dependencyChanges: dependencyChanges.value,
    migrationChanges: migrationChanges.value,
    destructiveActions: destructiveActions.value,
  });
}

function readAllowedFlag(input: unknown, path: string): Result<{ allowed: boolean }> {
  const object = readObject(input, path);
  if (!object.ok) return object;
  if (typeof object.value.allowed !== "boolean") {
    return err(validationError(`${path}.allowed`, "Value must be a boolean"));
  }
  return ok({ allowed: object.value.allowed });
}

function readObject(input: unknown, path: string): Result<JsonObject> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return err(validationError(path, "Value must be an object"));
  }
  return ok(input as JsonObject);
}

function readStringArray(input: unknown, path: string): Result<string[]> {
  if (!Array.isArray(input)) {
    return err(validationError(path, "Value must be an array"));
  }

  const output: string[] = [];
  for (let index = 0; index < input.length; index += 1) {
    if (typeof input[index] !== "string") {
      return err(validationError(`${path}[${index}]`, "Array entries must be strings"));
    }
    output.push(input[index]);
  }

  return ok(output);
}
