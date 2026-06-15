import { spawn } from "node:child_process";
import type { AgentRunRequest, AgentRunResult } from "./adapter.js";

const STREAM_CAPTURE_LIMIT_BYTES = 1024 * 1024;

export async function runAgent(request: AgentRunRequest): Promise<AgentRunResult> {
  const startedAt = Date.now();

  return await new Promise<AgentRunResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const child = spawn(request.command, request.args, {
      cwd: request.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 250).unref();
    }, request.timeoutMs);
    timeout.unref();

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = appendCapped(stdout, chunk);
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = appendCapped(stderr, chunk);
    });

    child.on("error", (error) => {
      stderr = appendCapped(stderr, error.message);
    });

    child.on("close", (code) => {
      settled = true;
      clearTimeout(timeout);
      resolve({
        exitCode: code,
        timedOut,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
      });
    });

    child.stdin.on("error", (error) => {
      stderr = appendCapped(stderr, error.message);
    });
    child.stdin.end(request.input, (error?: Error | null) => {
      if (error !== undefined && error !== null) {
        stderr = appendCapped(stderr, error.message);
      }
    });
  });
}

function appendCapped(current: string, chunk: string): string {
  if (current.length >= STREAM_CAPTURE_LIMIT_BYTES) {
    return current;
  }
  const available = STREAM_CAPTURE_LIMIT_BYTES - current.length;
  return current + chunk.slice(0, available);
}
