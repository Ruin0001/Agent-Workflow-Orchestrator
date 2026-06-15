import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { filesystemError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";

export type LockfileHandle = {
  path: string;
  token: string;
};

export async function acquireLockfile(path: string, command: string): Promise<Result<LockfileHandle>> {
  const token = randomUUID();
  const content = JSON.stringify(
    {
      pid: process.pid,
      command,
      timestamp: new Date().toISOString(),
      token,
    },
    null,
    2,
  ) + "\n";

  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, { encoding: "utf8", flag: "wx" });
    return ok({ path, token });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "EEXIST") {
      return err({
        code: "LOCK_EXISTS",
        path,
        message: "Agent execution lock already exists.",
      });
    }
    return err(filesystemError(errorMessage(error), path));
  }
}

export async function releaseLockfile(handle: LockfileHandle): Promise<Result<void>> {
  try {
    const source = await readFile(handle.path, "utf8").catch((error: unknown) => {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        return undefined;
      }
      throw error;
    });
    if (source === undefined) {
      return ok(undefined);
    }
    const parsed = JSON.parse(source) as { token?: unknown };
    if (parsed.token !== handle.token) {
      return ok(undefined);
    }
    await rm(handle.path, { force: true });
    return ok(undefined);
  } catch (error) {
    return err(filesystemError(errorMessage(error), handle.path));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Lockfile operation failed";
}
