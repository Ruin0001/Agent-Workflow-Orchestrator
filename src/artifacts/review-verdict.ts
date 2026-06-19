import { validationError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";

export type PlanReviewVerdictStatus = "Approved" | "Needs revision" | "Rejected";

export type PlanReviewVerdict = {
  runId: string;
  phase: "plan_review";
  status: PlanReviewVerdictStatus;
  blocking: number;
  major: number;
  minor: number;
  iteration: number;
};

type JsonObject = Record<string, unknown>;

export function validatePlanReviewVerdict(input: unknown): Result<PlanReviewVerdict> {
  const root = readObject(input, "$");
  if (!root.ok) return root;

  const runId = readNonEmptyString(root.value.runId, "$.runId");
  if (!runId.ok) return runId;
  if (root.value.phase !== "plan_review") {
    return err(validationError("$.phase", "Plan review verdict phase must be plan_review"));
  }
  const status = readStatus(root.value.status, "$.status");
  if (!status.ok) return status;
  const blocking = readNonNegativeInteger(root.value.blocking, "$.blocking");
  if (!blocking.ok) return blocking;
  const major = readNonNegativeInteger(root.value.major, "$.major");
  if (!major.ok) return major;
  const minor = readNonNegativeInteger(root.value.minor, "$.minor");
  if (!minor.ok) return minor;
  const iteration = readPositiveInteger(root.value.iteration, "$.iteration");
  if (!iteration.ok) return iteration;

  return ok({
    runId: runId.value,
    phase: "plan_review",
    status: status.value,
    blocking: blocking.value,
    major: major.value,
    minor: minor.value,
    iteration: iteration.value,
  });
}

export function strictBarPasses(verdict: PlanReviewVerdict): boolean {
  return verdict.status === "Approved" && verdict.blocking === 0 && verdict.major === 0;
}

function readObject(input: unknown, path: string): Result<JsonObject> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return err(validationError(path, "Value must be an object"));
  }
  return ok(input as JsonObject);
}

function readNonEmptyString(input: unknown, path: string): Result<string> {
  if (typeof input !== "string" || input.trim() === "") {
    return err(validationError(path, "Value must be a non-empty string"));
  }
  return ok(input);
}

function readStatus(input: unknown, path: string): Result<PlanReviewVerdictStatus> {
  if (input === "Approved" || input === "Needs revision" || input === "Rejected") {
    return ok(input);
  }
  return err(validationError(path, "Status must be Approved, Needs revision, or Rejected"));
}

function readNonNegativeInteger(input: unknown, path: string): Result<number> {
  if (!Number.isInteger(input) || typeof input !== "number" || input < 0) {
    return err(validationError(path, "Value must be a non-negative integer"));
  }
  return ok(input);
}

function readPositiveInteger(input: unknown, path: string): Result<number> {
  if (!Number.isInteger(input) || typeof input !== "number" || input <= 0) {
    return err(validationError(path, "Value must be a positive integer"));
  }
  return ok(input);
}
