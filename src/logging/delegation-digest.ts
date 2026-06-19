import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { filesystemError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import type { PlanReviewVerdictStatus } from "../artifacts/review-verdict.js";

export type DelegationAutoPassDigestEntry = {
  gate: "user_plan_approval";
  phase: "user_plan_approval";
  transition: "user_plan_approval -> task_classification";
  verdictPath: string;
  runId: string;
  status: PlanReviewVerdictStatus;
  blocking: number;
  major: number;
  minor: number;
  iteration: number;
};

export type AppendDelegationDigestInput = {
  logDir: string;
  autoPasses: DelegationAutoPassDigestEntry[];
  finalStopReason: string;
};

export type AppendDelegationDigestResult = {
  historyPath: string;
  latestPath: string;
};

export async function appendDelegationDigest(
  input: AppendDelegationDigestInput,
): Promise<Result<AppendDelegationDigestResult>> {
  const historyPath = join(input.logDir, "delegation_digest.md");
  const latestPath = join(input.logDir, "delegation_digest_latest.md");
  const rendered = renderDelegationDigest(input);

  try {
    await mkdir(input.logDir, { recursive: true });
    await appendFile(historyPath, `${rendered}\n`, "utf8");
    await writeFile(latestPath, rendered, "utf8");
    return ok({ historyPath, latestPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to write delegation digest";
    return err(filesystemError(message, historyPath));
  }
}

function renderDelegationDigest(input: AppendDelegationDigestInput): string {
  return [
    "## Delegation Digest",
    "",
    `Timestamp: ${new Date().toISOString()}`,
    `Final stop: ${input.finalStopReason}`,
    "",
    "### Auto-passes",
    ...input.autoPasses.map(renderAutoPass),
    "",
  ].join("\n");
}

function renderAutoPass(entry: DelegationAutoPassDigestEntry): string {
  return [
    `- Gate: ${entry.gate}`,
    `  Phase: ${entry.phase}`,
    `  Transition: ${entry.transition}`,
    `  Verdict: ${entry.verdictPath}`,
    `  Run: ${entry.runId}`,
    `  Review: ${entry.status} (Blocking ${entry.blocking}, Major ${entry.major}, Minor ${entry.minor}, Iteration ${entry.iteration})`,
  ].join("\n");
}
