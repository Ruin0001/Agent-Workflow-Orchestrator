import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { filesystemError, validationError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { redactStringFields } from "./redact.js";

export type AppendRunLogEntryInput = {
  logDir: string;
  entry: Record<string, unknown>;
};

export async function appendRunLogEntry(input: AppendRunLogEntryInput): Promise<Result<void>> {
  const logPath = join(input.logDir, "runs.jsonl");
  const serialized = serializeRunLogEntry(input.entry);
  if (!serialized.ok) return serialized;

  try {
    await mkdir(input.logDir, { recursive: true });
    await appendFile(logPath, `${serialized.value}\n`, "utf8");
    return ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to append run log";
    return err(filesystemError(message, logPath));
  }
}

function serializeRunLogEntry(entry: Record<string, unknown>): Result<string> {
  try {
    return ok(JSON.stringify(entry, redactingJsonReplacer));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown serialization failure";
    return err(validationError("$.entry", `Run log entry must be JSON serializable: ${detail}`));
  }
}

function redactingJsonReplacer(key: string, value: unknown): unknown {
  return redactStringFields(value, key === "" ? undefined : key);
}
