import type { AgentConfig, AgentFlowConfig } from "../config/schema.js";
import { validationError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { getActorForPhase, type WorkflowActor } from "../workflow/actors.js";
import { isWorkflowPhase, type WorkflowPhase } from "../workflow/phases.js";

export type WorkflowStatus = "ready" | "in_progress" | "waiting_for_user" | "blocked" | "done";

export type WorkflowGate = {
  active: boolean;
  reason: string;
  requestedAt?: string;
};

export type WorkflowState = {
  workflow: "standard";
  version: 1;
  phase: WorkflowPhase;
  status: WorkflowStatus;
  currentActor: WorkflowActor;
  nextActor: WorkflowActor;
  lock: {
    locked: boolean;
    lockedBy: string | null;
    lockReason: string | null;
    lockAcquiredAt: string | null;
  };
  agents: {
    implementation: AgentConfig;
    review: AgentConfig;
  };
  currentTask: {
    id: string | null;
    title: string | null;
    description: string | null;
  };
  artifacts: Record<string, string>;
  gates: Record<string, WorkflowGate>;
  limits: AgentFlowConfig["limits"];
  iterationCounters: {
    spec_review: number;
    plan_review: number;
    implementation_review: number;
  };
  lastActor: WorkflowActor | null;
  lastAction: string | null;
  updatedAt: string;
};

type JsonObject = Record<string, unknown>;

export function createInitialState(config: AgentFlowConfig): WorkflowState {
  const initialPhase = "requirement_understanding";
  const actor = getActorForPhase(initialPhase);
  const artifactDir = config.workspace.artifactDir;

  return {
    workflow: "standard",
    version: 1,
    phase: initialPhase,
    status: "ready",
    currentActor: actor,
    nextActor: actor,
    lock: {
      locked: false,
      lockedBy: null,
      lockReason: null,
      lockAcquiredAt: null,
    },
    agents: {
      implementation: cloneAgentConfig(config.agents.implementation),
      review: cloneAgentConfig(config.agents.review),
    },
    currentTask: {
      id: null,
      title: null,
      description: null,
    },
    artifacts: {
      requirement_understanding: `${artifactDir}/requirement_understanding.md`,
      spec: `${artifactDir}/spec.md`,
      spec_review: `${artifactDir}/spec_review.md`,
      spec_review_response: `${artifactDir}/spec_review_response.md`,
      plan: `${artifactDir}/plan.md`,
      plan_review: `${artifactDir}/plan_review.md`,
      plan_review_response: `${artifactDir}/plan_review_response.md`,
      task_classification: `${artifactDir}/task_classification.md`,
      implementation_notes: `${artifactDir}/implementation_notes.md`,
      implementation_review: `${artifactDir}/implementation_review.md`,
      implementation_review_response: `${artifactDir}/implementation_review_response.md`,
      test_results: `${artifactDir}/test_results.md`,
      final_handoff: `${artifactDir}/final_handoff.md`,
      allowed_change_manifest: config.artifacts.allowedChangeManifest,
    },
    gates: {},
    limits: { ...config.limits },
    iterationCounters: {
      spec_review: 0,
      plan_review: 0,
      implementation_review: 0,
    },
    lastActor: null,
    lastAction: null,
    updatedAt: new Date().toISOString(),
  };
}

export function validateState(input: unknown): Result<WorkflowState> {
  const root = readObject(input, "$");
  if (!root.ok) return root;

  if (root.value.workflow !== "standard") {
    return err(validationError("$.workflow", "Workflow must be standard"));
  }
  if (root.value.version !== 1) {
    return err(validationError("$.version", "State version must be version 1"));
  }
  if (!isWorkflowPhase(root.value.phase)) {
    return err(validationError("$.phase", "Unknown phase"));
  }
  if (!isStatus(root.value.status)) {
    return err(validationError("$.status", "Unknown workflow status"));
  }
  if (!isActor(root.value.currentActor)) {
    return err(validationError("$.currentActor", "Unknown actor"));
  }
  if (!isActor(root.value.nextActor)) {
    return err(validationError("$.nextActor", "Unknown actor"));
  }

  const lock = readLock(root.value.lock);
  if (!lock.ok) return lock;
  const agents = readAgents(root.value.agents);
  if (!agents.ok) return agents;
  const currentTask = readCurrentTask(root.value.currentTask);
  if (!currentTask.ok) return currentTask;
  const artifacts = readStringRecord(root.value.artifacts, "$.artifacts");
  if (!artifacts.ok) return artifacts;
  const gates = readGates(root.value.gates);
  if (!gates.ok) return gates;
  const limits = readLimits(root.value.limits);
  if (!limits.ok) return limits;
  const iterationCounters = readIterationCounters(root.value.iterationCounters);
  if (!iterationCounters.ok) return iterationCounters;
  const lastActor = readNullableActor(root.value.lastActor, "$.lastActor");
  if (!lastActor.ok) return lastActor;
  const lastAction = readNullableString(root.value.lastAction, "$.lastAction");
  if (!lastAction.ok) return lastAction;
  const updatedAt = readString(root.value.updatedAt, "$.updatedAt");
  if (!updatedAt.ok) return updatedAt;

  return ok({
    workflow: "standard",
    version: 1,
    phase: root.value.phase,
    status: root.value.status,
    currentActor: root.value.currentActor,
    nextActor: root.value.nextActor,
    lock: lock.value,
    agents: agents.value,
    currentTask: currentTask.value,
    artifacts: artifacts.value,
    gates: gates.value,
    limits: limits.value,
    iterationCounters: iterationCounters.value,
    lastActor: lastActor.value,
    lastAction: lastAction.value,
    updatedAt: updatedAt.value,
  });
}

function readLock(input: unknown): Result<WorkflowState["lock"]> {
  const object = readObject(input, "$.lock");
  if (!object.ok) return object;
  if (typeof object.value.locked !== "boolean") {
    return err(validationError("$.lock.locked", "Value must be a boolean"));
  }
  const lockedBy = readNullableString(object.value.lockedBy, "$.lock.lockedBy");
  if (!lockedBy.ok) return lockedBy;
  const lockReason = readNullableString(object.value.lockReason, "$.lock.lockReason");
  if (!lockReason.ok) return lockReason;
  const lockAcquiredAt = readNullableString(object.value.lockAcquiredAt, "$.lock.lockAcquiredAt");
  if (!lockAcquiredAt.ok) return lockAcquiredAt;

  return ok({
    locked: object.value.locked,
    lockedBy: lockedBy.value,
    lockReason: lockReason.value,
    lockAcquiredAt: lockAcquiredAt.value,
  });
}

function readAgents(input: unknown): Result<WorkflowState["agents"]> {
  const object = readObject(input, "$.agents");
  if (!object.ok) return object;
  const implementation = readAgent(object.value.implementation, "$.agents.implementation", "implementation");
  if (!implementation.ok) return implementation;
  const review = readAgent(object.value.review, "$.agents.review", "review");
  if (!review.ok) return review;

  return ok({ implementation: implementation.value, review: review.value });
}

function readAgent(input: unknown, path: string, role: AgentConfig["role"]): Result<AgentConfig> {
  const object = readObject(input, path);
  if (!object.ok) return object;
  if (object.value.role !== role) {
    return err(validationError(`${path}.role`, `Agent role must be ${role}`));
  }
  const name = readString(object.value.name, `${path}.name`);
  if (!name.ok) return name;
  const command = readString(object.value.command, `${path}.command`);
  if (!command.ok) return command;
  const args = readStringArray(object.value.args, `${path}.args`);
  if (!args.ok) return args;
  if (object.value.inputMode !== "stdin") {
    return err(validationError(`${path}.inputMode`, "Input mode must be stdin"));
  }
  if (object.value.outputMode !== "stdout") {
    return err(validationError(`${path}.outputMode`, "Output mode must be stdout"));
  }
  const timeoutSeconds = readPositiveInteger(object.value.timeoutSeconds, `${path}.timeoutSeconds`);
  if (!timeoutSeconds.ok) return timeoutSeconds;

  return ok({
    role,
    name: name.value,
    command: command.value,
    args: args.value,
    inputMode: "stdin",
    outputMode: "stdout",
    timeoutSeconds: timeoutSeconds.value,
  });
}

function readCurrentTask(input: unknown): Result<WorkflowState["currentTask"]> {
  const object = readObject(input, "$.currentTask");
  if (!object.ok) return object;
  const id = readNullableString(object.value.id, "$.currentTask.id");
  if (!id.ok) return id;
  const title = readNullableString(object.value.title, "$.currentTask.title");
  if (!title.ok) return title;
  const description = readNullableString(object.value.description, "$.currentTask.description");
  if (!description.ok) return description;

  return ok({ id: id.value, title: title.value, description: description.value });
}

function readGates(input: unknown): Result<WorkflowState["gates"]> {
  const object = readObject(input, "$.gates");
  if (!object.ok) return object;
  const gates: WorkflowState["gates"] = {};

  for (const [key, value] of Object.entries(object.value)) {
    const gatePath = formatJsonPathProperty("$.gates", key);
    const gate = readObject(value, gatePath);
    if (!gate.ok) return gate;
    if (typeof gate.value.active !== "boolean") {
      return err(validationError(`${gatePath}.active`, "Value must be a boolean"));
    }
    const reason = readString(gate.value.reason, `${gatePath}.reason`);
    if (!reason.ok) return reason;
    const requestedAtValue = gate.value.requestedAt;
    if (requestedAtValue !== undefined && typeof requestedAtValue !== "string") {
      return err(validationError(`${gatePath}.requestedAt`, "Value must be a string"));
    }
    gates[key] =
      requestedAtValue === undefined
        ? { active: gate.value.active, reason: reason.value }
        : { active: gate.value.active, reason: reason.value, requestedAt: requestedAtValue };
  }

  return ok(gates);
}

function readLimits(input: unknown): Result<AgentFlowConfig["limits"]> {
  const object = readObject(input, "$.limits");
  if (!object.ok) return object;
  const maxChangedFiles = readPositiveInteger(object.value.maxChangedFiles, "$.limits.maxChangedFiles");
  if (!maxChangedFiles.ok) return maxChangedFiles;
  const maxAddedLines = readPositiveInteger(object.value.maxAddedLines, "$.limits.maxAddedLines");
  if (!maxAddedLines.ok) return maxAddedLines;
  const maxDeletedLines = readPositiveInteger(object.value.maxDeletedLines, "$.limits.maxDeletedLines");
  if (!maxDeletedLines.ok) return maxDeletedLines;
  const commandTimeoutSeconds = readPositiveInteger(
    object.value.commandTimeoutSeconds,
    "$.limits.commandTimeoutSeconds",
  );
  if (!commandTimeoutSeconds.ok) return commandTimeoutSeconds;
  const maxSpecReviewIterations = readPositiveInteger(
    object.value.maxSpecReviewIterations,
    "$.limits.maxSpecReviewIterations",
  );
  if (!maxSpecReviewIterations.ok) return maxSpecReviewIterations;
  const maxPlanReviewIterations = readPositiveInteger(
    object.value.maxPlanReviewIterations,
    "$.limits.maxPlanReviewIterations",
  );
  if (!maxPlanReviewIterations.ok) return maxPlanReviewIterations;
  const maxImplementationReviewIterations = readPositiveInteger(
    object.value.maxImplementationReviewIterations,
    "$.limits.maxImplementationReviewIterations",
  );
  if (!maxImplementationReviewIterations.ok) return maxImplementationReviewIterations;

  return ok({
    maxChangedFiles: maxChangedFiles.value,
    maxAddedLines: maxAddedLines.value,
    maxDeletedLines: maxDeletedLines.value,
    commandTimeoutSeconds: commandTimeoutSeconds.value,
    maxSpecReviewIterations: maxSpecReviewIterations.value,
    maxPlanReviewIterations: maxPlanReviewIterations.value,
    maxImplementationReviewIterations: maxImplementationReviewIterations.value,
  });
}

function readIterationCounters(input: unknown): Result<WorkflowState["iterationCounters"]> {
  const object = readObject(input, "$.iterationCounters");
  if (!object.ok) return object;
  const specReview = readNonNegativeInteger(
    object.value.spec_review,
    "$.iterationCounters.spec_review",
  );
  if (!specReview.ok) return specReview;
  const planReview = readNonNegativeInteger(
    object.value.plan_review,
    "$.iterationCounters.plan_review",
  );
  if (!planReview.ok) return planReview;
  const implementationReview = readNonNegativeInteger(
    object.value.implementation_review,
    "$.iterationCounters.implementation_review",
  );
  if (!implementationReview.ok) return implementationReview;

  return ok({
    spec_review: specReview.value,
    plan_review: planReview.value,
    implementation_review: implementationReview.value,
  });
}

function readStringRecord(input: unknown, path: string): Result<Record<string, string>> {
  const object = readObject(input, path);
  if (!object.ok) return object;
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(object.value)) {
    const stringValue = readString(value, formatJsonPathProperty(path, key));
    if (!stringValue.ok) return stringValue;
    output[key] = stringValue.value;
  }
  return ok(output);
}

function cloneAgentConfig(agent: AgentConfig): AgentConfig {
  return {
    ...agent,
    args: [...agent.args],
  };
}

function formatJsonPathProperty(parent: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

function readObject(input: unknown, path: string): Result<JsonObject> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return err(validationError(path, "Value must be an object"));
  }
  return ok(input as JsonObject);
}

function readString(input: unknown, path: string): Result<string> {
  if (typeof input !== "string") {
    return err(validationError(path, "Value must be a string"));
  }
  return ok(input);
}

function readNullableString(input: unknown, path: string): Result<string | null> {
  if (input === null || typeof input === "string") {
    return ok(input);
  }
  return err(validationError(path, "Value must be a string or null"));
}

function readStringArray(input: unknown, path: string): Result<string[]> {
  if (!Array.isArray(input)) {
    return err(validationError(path, "Value must be an array"));
  }
  const output: string[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const value = readString(input[index], `${path}[${index}]`);
    if (!value.ok) return value;
    output.push(value.value);
  }
  return ok(output);
}

function readPositiveInteger(input: unknown, path: string): Result<number> {
  if (!Number.isInteger(input) || typeof input !== "number" || input <= 0) {
    return err(validationError(path, "Value must be a positive integer"));
  }
  return ok(input);
}

function readNonNegativeInteger(input: unknown, path: string): Result<number> {
  if (!Number.isInteger(input) || typeof input !== "number" || input < 0) {
    return err(validationError(path, "Value must be a non-negative integer"));
  }
  return ok(input);
}

function readNullableActor(input: unknown, path: string): Result<WorkflowActor | null> {
  if (input === null) return ok(null);
  if (isActor(input)) return ok(input);
  return err(validationError(path, "Value must be an actor or null"));
}

function isStatus(input: unknown): input is WorkflowStatus {
  return (
    input === "ready" ||
    input === "in_progress" ||
    input === "waiting_for_user" ||
    input === "blocked" ||
    input === "done"
  );
}

function isActor(input: unknown): input is WorkflowActor {
  return (
    input === "implementation" ||
    input === "review" ||
    input === "user" ||
    input === "none"
  );
}
