import { validationError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { applyConfigDefaults } from "./defaults.js";

export type AgentFlowConfig = {
  version: 1;
  workspace: {
    root: string;
    stateDir: string;
    artifactDir: string;
    promptDir: string;
    logDir: string;
  };
  mode: {
    default: AutomationMode;
  };
  agents: {
    implementation: AgentConfig;
    review: AgentConfig;
  };
  guardrails: {
    requireGitForFullGuardrails: boolean;
    requireCleanWorkingTree: boolean;
    protectedPaths: string[];
    protectedUnlessExplicitlyAllowed: string[];
    blockedCommands: string[];
  };
  limits: {
    maxChangedFiles: number;
    maxAddedLines: number;
    maxDeletedLines: number;
    commandTimeoutSeconds: number;
    maxSpecReviewIterations: number;
    maxPlanReviewIterations: number;
    maxImplementationReviewIterations: number;
  };
  commands: {
    typecheck: string | null;
    lint: string | null;
    test: string | null;
    build: string | null;
  };
  projectContext: {
    sourceOfTruth: string[];
    files: string[];
    extraInstructions: string[];
  };
  artifacts: {
    allowedChangeManifest: string;
  };
  logging: {
    transcriptCapture: "off";
    persistPrompts: "off" | "configured";
  };
};

export type AutomationMode = "advisory" | "assisted";

export type AgentRole = "implementation" | "review";

export type AgentConfig = {
  role: AgentRole;
  name: string;
  command: string;
  args: string[];
  inputMode: "stdin";
  outputMode: "stdout";
  timeoutSeconds: number;
};

type OptionalSection<T> = {
  [Key in keyof T]?: T[Key] | undefined;
};

export type PartialAgentFlowConfig = {
  version: 1;
  workspace?: OptionalSection<AgentFlowConfig["workspace"]>;
  mode?: OptionalSection<AgentFlowConfig["mode"]>;
  agents?: {
    implementation?: OptionalSection<AgentConfig>;
    review?: OptionalSection<AgentConfig>;
  };
  guardrails?: OptionalSection<AgentFlowConfig["guardrails"]>;
  limits?: OptionalSection<AgentFlowConfig["limits"]>;
  commands?: OptionalSection<AgentFlowConfig["commands"]>;
  projectContext?: OptionalSection<AgentFlowConfig["projectContext"]>;
  artifacts?: OptionalSection<AgentFlowConfig["artifacts"]>;
  logging?: OptionalSection<AgentFlowConfig["logging"]>;
};

type JsonObject = Record<string, unknown>;

export function validateConfig(input: unknown): Result<AgentFlowConfig> {
  const partialResult = readPartialConfigSafely(input);
  if (!partialResult.ok) {
    return partialResult;
  }

  const config = applyConfigDefaults(partialResult.value);
  const validation = validateCompleteConfig(config);
  if (!validation.ok) {
    return validation;
  }

  return ok(config);
}

function readPartialConfigSafely(input: unknown): Result<PartialAgentFlowConfig> {
  try {
    return readPartialConfig(input);
  } catch (error) {
    if (error instanceof TypeError) {
      const match = /^(?<path>\$\S*) (?<message>.*)$/.exec(error.message);
      if (match?.groups?.path !== undefined && match.groups.message !== undefined) {
        return err(validationError(match.groups.path, match.groups.message));
      }
    }
    throw error;
  }
}

function readPartialConfig(input: unknown): Result<PartialAgentFlowConfig> {
  if (!isObject(input)) {
    return err(validationError("$", "Config root must be an object"));
  }

  if (input.version !== 1) {
    return err(validationError("$.version", "Config version must be version 1"));
  }

  if ("configFormat" in input && input.configFormat !== "json") {
    return err(validationError("$.configFormat", "Unsupported configFormat; v1 supports json only"));
  }

  const config: PartialAgentFlowConfig = { version: 1 };

  if ("workspace" in input) {
    const result = readObject(input.workspace, "$.workspace");
    if (!result.ok) return result;
    config.workspace = {
      root: readOptionalString(result.value, "root", "$.workspace.root"),
      stateDir: readOptionalString(result.value, "stateDir", "$.workspace.stateDir"),
      artifactDir: readOptionalString(result.value, "artifactDir", "$.workspace.artifactDir"),
      promptDir: readOptionalString(result.value, "promptDir", "$.workspace.promptDir"),
      logDir: readOptionalString(result.value, "logDir", "$.workspace.logDir"),
    };
  }

  if ("mode" in input) {
    const result = readObject(input.mode, "$.mode");
    if (!result.ok) return result;
    const mode = result.value.default;
    if (mode !== undefined && mode !== "advisory" && mode !== "assisted") {
      return err(validationError("$.mode.default", "Mode default must be advisory or assisted"));
    }
    config.mode = { default: mode as AgentFlowConfig["mode"]["default"] | undefined };
  }

  if ("agents" in input) {
    const result = readObject(input.agents, "$.agents");
    if (!result.ok) return result;
    const implementation = readOptionalAgent(result.value, "implementation");
    if (!implementation.ok) return implementation;
    const review = readOptionalAgent(result.value, "review");
    if (!review.ok) return review;
    config.agents = {
      implementation: implementation.value,
      review: review.value,
    };
  }

  if ("guardrails" in input) {
    const result = readObject(input.guardrails, "$.guardrails");
    if (!result.ok) return result;
    const protectedPaths = readOptionalStringArray(
      result.value,
      "protectedPaths",
      "$.guardrails.protectedPaths",
    );
    if (!protectedPaths.ok) return protectedPaths;
    const protectedUnlessExplicitlyAllowed = readOptionalStringArray(
      result.value,
      "protectedUnlessExplicitlyAllowed",
      "$.guardrails.protectedUnlessExplicitlyAllowed",
    );
    if (!protectedUnlessExplicitlyAllowed.ok) return protectedUnlessExplicitlyAllowed;
    const blockedCommands = readOptionalStringArray(
      result.value,
      "blockedCommands",
      "$.guardrails.blockedCommands",
    );
    if (!blockedCommands.ok) return blockedCommands;
    config.guardrails = {
      requireGitForFullGuardrails: readOptionalBoolean(
        result.value,
        "requireGitForFullGuardrails",
        "$.guardrails.requireGitForFullGuardrails",
      ),
      requireCleanWorkingTree: readOptionalBoolean(
        result.value,
        "requireCleanWorkingTree",
        "$.guardrails.requireCleanWorkingTree",
      ),
      protectedPaths: protectedPaths.value,
      protectedUnlessExplicitlyAllowed: protectedUnlessExplicitlyAllowed.value,
      blockedCommands: blockedCommands.value,
    };
  }

  if ("limits" in input) {
    const result = readObject(input.limits, "$.limits");
    if (!result.ok) return result;
    config.limits = {
      maxChangedFiles: readOptionalNumber(result.value, "maxChangedFiles", "$.limits.maxChangedFiles"),
      maxAddedLines: readOptionalNumber(result.value, "maxAddedLines", "$.limits.maxAddedLines"),
      maxDeletedLines: readOptionalNumber(result.value, "maxDeletedLines", "$.limits.maxDeletedLines"),
      commandTimeoutSeconds: readOptionalNumber(
        result.value,
        "commandTimeoutSeconds",
        "$.limits.commandTimeoutSeconds",
      ),
      maxSpecReviewIterations: readOptionalNumber(
        result.value,
        "maxSpecReviewIterations",
        "$.limits.maxSpecReviewIterations",
      ),
      maxPlanReviewIterations: readOptionalNumber(
        result.value,
        "maxPlanReviewIterations",
        "$.limits.maxPlanReviewIterations",
      ),
      maxImplementationReviewIterations: readOptionalNumber(
        result.value,
        "maxImplementationReviewIterations",
        "$.limits.maxImplementationReviewIterations",
      ),
    };
  }

  if ("commands" in input) {
    const result = readObject(input.commands, "$.commands");
    if (!result.ok) return result;
    config.commands = {
      typecheck: readOptionalNullableString(result.value, "typecheck", "$.commands.typecheck"),
      lint: readOptionalNullableString(result.value, "lint", "$.commands.lint"),
      test: readOptionalNullableString(result.value, "test", "$.commands.test"),
      build: readOptionalNullableString(result.value, "build", "$.commands.build"),
    };
  }

  if ("projectContext" in input) {
    const result = readObject(input.projectContext, "$.projectContext");
    if (!result.ok) return result;
    const sourceOfTruth = readOptionalStringArray(
      result.value,
      "sourceOfTruth",
      "$.projectContext.sourceOfTruth",
    );
    if (!sourceOfTruth.ok) return sourceOfTruth;
    const files = readOptionalStringArray(
      result.value,
      "files",
      "$.projectContext.files",
    );
    if (!files.ok) return files;
    const extraInstructions = readOptionalStringArray(
      result.value,
      "extraInstructions",
      "$.projectContext.extraInstructions",
    );
    if (!extraInstructions.ok) return extraInstructions;
    config.projectContext = {
      sourceOfTruth: sourceOfTruth.value,
      files: files.value,
      extraInstructions: extraInstructions.value,
    };
  }

  if ("artifacts" in input) {
    const result = readObject(input.artifacts, "$.artifacts");
    if (!result.ok) return result;
    config.artifacts = {
      allowedChangeManifest: readOptionalString(
        result.value,
        "allowedChangeManifest",
        "$.artifacts.allowedChangeManifest",
      ),
    };
  }

  if ("logging" in input) {
    const result = readObject(input.logging, "$.logging");
    if (!result.ok) return result;
    const transcriptCapture = result.value.transcriptCapture;
    if (
      transcriptCapture !== undefined &&
      transcriptCapture !== "off"
    ) {
      return err(
        validationError(
          "$.logging.transcriptCapture",
          "Logging transcriptCapture must be off",
        ),
      );
    }
    const persistPrompts = result.value.persistPrompts;
    if (
      persistPrompts !== undefined &&
      persistPrompts !== "off" &&
      persistPrompts !== "configured"
    ) {
      return err(
        validationError("$.logging.persistPrompts", "Logging persistPrompts must be off or configured"),
      );
    }
    config.logging = {
      transcriptCapture:
        transcriptCapture as AgentFlowConfig["logging"]["transcriptCapture"] | undefined,
      persistPrompts: persistPrompts as AgentFlowConfig["logging"]["persistPrompts"] | undefined,
    };
  }

  return ok(config);
}

function validateCompleteConfig(config: AgentFlowConfig): Result<AgentFlowConfig> {
  const limitEntries = Object.entries(config.limits);
  for (const [key, value] of limitEntries) {
    const result = validatePositiveInteger(value, `$.limits.${key}`);
    if (!result.ok) return result;
  }

  const agents: Array<["implementation" | "review", AgentConfig]> = [
    ["implementation", config.agents.implementation],
    ["review", config.agents.review],
  ];
  for (const [key, agent] of agents) {
    const prefix = `$.agents.${key}`;
    if (agent.role !== key) {
      return err(validationError(`${prefix}.role`, `Agent role must be ${key}`));
    }
    if (agent.name.trim() === "") {
      return err(validationError(`${prefix}.name`, "Agent name must not be empty"));
    }
    if (agent.command.trim() === "") {
      return err(validationError(`${prefix}.command`, "Agent command must not be empty"));
    }
    if (!Array.isArray(agent.args)) {
      return err(validationError(`${prefix}.args`, "Agent args must be an array"));
    }
    const timeout = validatePositiveInteger(agent.timeoutSeconds, `${prefix}.timeoutSeconds`);
    if (!timeout.ok) return timeout;
  }

  const arrays: Array<[unknown, string]> = [
    [config.guardrails.protectedPaths, "$.guardrails.protectedPaths"],
    [
      config.guardrails.protectedUnlessExplicitlyAllowed,
      "$.guardrails.protectedUnlessExplicitlyAllowed",
    ],
    [config.guardrails.blockedCommands, "$.guardrails.blockedCommands"],
    [config.projectContext.sourceOfTruth, "$.projectContext.sourceOfTruth"],
    [config.projectContext.files, "$.projectContext.files"],
    [config.projectContext.extraInstructions, "$.projectContext.extraInstructions"],
  ];
  for (const [value, path] of arrays) {
    if (!Array.isArray(value)) {
      return err(validationError(path, "Value must be an array"));
    }
  }

  return ok(config);
}

function readOptionalAgent(
  input: JsonObject,
  key: "implementation" | "review",
): Result<OptionalSection<AgentConfig>> {
  if (!(key in input)) {
    return ok({});
  }
  const path = `$.agents.${key}`;
  const result = readObject(input[key], path);
  if (!result.ok) return result;
  const args = readOptionalStringArray(result.value, "args", `${path}.args`);
  if (!args.ok) return args;
  const role = result.value.role;
  if (role !== undefined && role !== key) {
    return err(validationError(`${path}.role`, `Agent role must be ${key}`));
  }
  const command = readOptionalString(result.value, "command", `${path}.command`);
  const name = readOptionalString(result.value, "name", `${path}.name`);
  const timeoutSeconds = readOptionalNumber(result.value, "timeoutSeconds", `${path}.timeoutSeconds`);

  return ok({
    role: role as AgentRole | undefined,
    name,
    command,
    args: args.value,
    inputMode: readOptionalFixed(result.value, "inputMode", "stdin", `${path}.inputMode`),
    outputMode: readOptionalFixed(result.value, "outputMode", "stdout", `${path}.outputMode`),
    timeoutSeconds,
  });
}

function readObject(input: unknown, path: string): Result<JsonObject> {
  if (!isObject(input)) {
    return err(validationError(path, "Value must be an object"));
  }
  return ok(input);
}

function readOptionalString(input: JsonObject, key: string, path: string): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

function readOptionalNullableString(
  input: JsonObject,
  key: string,
  path: string,
): string | null | undefined {
  const value = input[key];
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string or null`);
  }
  return value;
}

function readOptionalNumber(input: JsonObject, key: string, path: string): number | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number") {
    throw new TypeError(`${path} must be a number`);
  }
  return value;
}

function readOptionalBoolean(input: JsonObject, key: string, path: string): boolean | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new TypeError(`${path} must be a boolean`);
  }
  return value;
}

function readOptionalStringArray(
  input: JsonObject,
  key: string,
  path: string,
): Result<string[] | undefined> {
  const value = input[key];
  if (value === undefined) {
    return ok(undefined);
  }
  if (!Array.isArray(value)) {
    return err(validationError(path, "Value must be an array"));
  }
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string") {
      return err(validationError(`${path}[${index}]`, "Array entries must be strings"));
    }
  }
  return ok(value);
}

function readOptionalFixed<T extends string>(
  input: JsonObject,
  key: string,
  expected: T,
  path: string,
): T | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (value !== expected) {
    throw new TypeError(`${path} must be ${expected}`);
  }
  return expected;
}

function validatePositiveInteger(value: number, path: string): Result<void> {
  if (!Number.isInteger(value) || value <= 0) {
    return err(validationError(path, "Value must be a positive integer"));
  }
  return ok(undefined);
}

function isObject(input: unknown): input is JsonObject {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
