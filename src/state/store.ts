import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { filesystemError } from "../core/errors.js";
import { parseJson } from "../core/json.js";
import { err, ok, type Result } from "../core/result.js";
import { validateState, type WorkflowState } from "./schema.js";

export async function readState(path: string): Promise<Result<WorkflowState>> {
  try {
    const source = await readFile(path, "utf8");
    const parsed = parseJson(source, path);
    if (!parsed.ok) return parsed;
    return validateState(parsed.value);
  } catch (error) {
    return err(filesystemError(errorMessage(error), path));
  }
}

export async function writeState(path: string, state: WorkflowState): Promise<Result<void>> {
  const validation = validateState(state);
  if (!validation.ok) return validation;

  const tempPath = createStateTempPath(path);
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(tempPath, `${JSON.stringify(validation.value, null, 2)}\n`, "utf8");
    await rename(tempPath, path);
    return ok(undefined);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    return err(filesystemError(errorMessage(error), path));
  }
}

export function createStateTempPath(path: string): string {
  return `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Filesystem operation failed";
}
