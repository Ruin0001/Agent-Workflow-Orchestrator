import * as assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { acquireLockfile, releaseLockfile } from "../../src/locks/lockfile.js";

async function tempWorkspace(): Promise<string> {
  const path = join(tmpdir(), `agent-flow-lockfile-${Date.now()}-${Math.random()}`);
  await mkdir(path, { recursive: true });
  return path;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

test("releaseLockfile leaves a lock alone when ownership changed", async () => {
  const workspace = await tempWorkspace();
  const lockPath = join(workspace, ".agent", "agent-flow.lock");
  const acquired = await acquireLockfile(lockPath, "first");
  assert.equal(acquired.ok, true);
  if (acquired.ok) {
    const original = JSON.parse(await readFile(lockPath, "utf8")) as { token?: string };
    assert.equal(typeof original.token, "string");

    const replacement = {
      pid: 999,
      command: "replacement",
      timestamp: "replacement",
      token: "replacement-token",
    };
    await writeFile(lockPath, JSON.stringify(replacement, null, 2) + "\n", "utf8");

    const released = await releaseLockfile(acquired.value);

    assert.equal(released.ok, true);
    assert.equal(await exists(lockPath), true);
    assert.deepEqual(JSON.parse(await readFile(lockPath, "utf8")) as unknown, replacement);
    return;
  }
  throw new Error("Expected lock acquisition to succeed");
});
