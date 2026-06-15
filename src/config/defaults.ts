import type {
  AgentConfig,
  AgentFlowConfig,
  PartialAgentFlowConfig,
} from "./schema.js";

export const DEFAULT_CONFIG_FILE = ".agent-flow.json";

export const DEFAULT_LIMITS: AgentFlowConfig["limits"] = {
  maxChangedFiles: 20,
  maxAddedLines: 1000,
  maxDeletedLines: 500,
  commandTimeoutSeconds: 300,
  maxSpecReviewIterations: 3,
  maxPlanReviewIterations: 3,
  maxImplementationReviewIterations: 3,
};

const arrayOrDefault = <T>(value: T[] | undefined, defaultValue: T[]): T[] => [
  ...(value ?? defaultValue),
];

const defaultAgent = (
  role: AgentConfig["role"],
  name: string,
  command: string,
  args: string[],
  timeoutSeconds: number,
): AgentConfig => ({
  role,
  name,
  command,
  args,
  inputMode: "stdin",
  outputMode: "stdout",
  timeoutSeconds,
});

export function applyConfigDefaults(input: PartialAgentFlowConfig): AgentFlowConfig {
  const limits = {
    maxChangedFiles: input.limits?.maxChangedFiles ?? DEFAULT_LIMITS.maxChangedFiles,
    maxAddedLines: input.limits?.maxAddedLines ?? DEFAULT_LIMITS.maxAddedLines,
    maxDeletedLines: input.limits?.maxDeletedLines ?? DEFAULT_LIMITS.maxDeletedLines,
    commandTimeoutSeconds:
      input.limits?.commandTimeoutSeconds ?? DEFAULT_LIMITS.commandTimeoutSeconds,
    maxSpecReviewIterations:
      input.limits?.maxSpecReviewIterations ?? DEFAULT_LIMITS.maxSpecReviewIterations,
    maxPlanReviewIterations:
      input.limits?.maxPlanReviewIterations ?? DEFAULT_LIMITS.maxPlanReviewIterations,
    maxImplementationReviewIterations:
      input.limits?.maxImplementationReviewIterations ??
      DEFAULT_LIMITS.maxImplementationReviewIterations,
  };
  const implementation = defaultAgent(
    "implementation",
    "Codex",
    "codex",
    ["exec"],
    limits.commandTimeoutSeconds,
  );
  const review = defaultAgent(
    "review",
    "Claude Code",
    "claude",
    ["-p"],
    limits.commandTimeoutSeconds,
  );

  return {
    version: input.version,
    workspace: {
      root: input.workspace?.root ?? ".",
      stateDir: input.workspace?.stateDir ?? ".agent",
      artifactDir: input.workspace?.artifactDir ?? ".agent/artifacts",
      promptDir: input.workspace?.promptDir ?? ".agent/prompts",
      logDir: input.workspace?.logDir ?? ".agent/logs",
    },
    mode: {
      default: input.mode?.default ?? "assisted",
    },
    agents: {
      implementation: {
        role: input.agents?.implementation?.role ?? implementation.role,
        name: input.agents?.implementation?.name ?? implementation.name,
        command: input.agents?.implementation?.command ?? implementation.command,
        args: arrayOrDefault(input.agents?.implementation?.args, implementation.args),
        inputMode: input.agents?.implementation?.inputMode ?? implementation.inputMode,
        outputMode: input.agents?.implementation?.outputMode ?? implementation.outputMode,
        timeoutSeconds:
          input.agents?.implementation?.timeoutSeconds ?? implementation.timeoutSeconds,
      },
      review: {
        role: input.agents?.review?.role ?? review.role,
        name: input.agents?.review?.name ?? review.name,
        command: input.agents?.review?.command ?? review.command,
        args: arrayOrDefault(input.agents?.review?.args, review.args),
        inputMode: input.agents?.review?.inputMode ?? review.inputMode,
        outputMode: input.agents?.review?.outputMode ?? review.outputMode,
        timeoutSeconds: input.agents?.review?.timeoutSeconds ?? review.timeoutSeconds,
      },
    },
    guardrails: {
      requireGitForFullGuardrails: input.guardrails?.requireGitForFullGuardrails ?? true,
      requireCleanWorkingTree: input.guardrails?.requireCleanWorkingTree ?? true,
      protectedPaths: arrayOrDefault(input.guardrails?.protectedPaths, [
        ".env",
        ".env.*",
        ".git/**",
        "node_modules/**",
        "dist/**",
        "build/**",
        "coverage/**",
      ]),
      protectedUnlessExplicitlyAllowed: arrayOrDefault(
        input.guardrails?.protectedUnlessExplicitlyAllowed,
        [
          "package.json",
          "pnpm-lock.yaml",
          "package-lock.json",
          "yarn.lock",
          "Dockerfile",
          "docker-compose.yml",
          ".github/workflows/**",
        ],
      ),
      blockedCommands: arrayOrDefault(input.guardrails?.blockedCommands, [
        "rm -rf",
        "git reset --hard",
        "git clean -fd",
        "docker system prune",
      ]),
    },
    limits,
    commands: {
      typecheck: input.commands?.typecheck ?? null,
      lint: input.commands?.lint ?? null,
      test: input.commands?.test ?? null,
      build: input.commands?.build ?? null,
    },
    projectContext: {
      sourceOfTruth: arrayOrDefault(input.projectContext?.sourceOfTruth, []),
      files: arrayOrDefault(input.projectContext?.files, []),
      extraInstructions: arrayOrDefault(input.projectContext?.extraInstructions, []),
    },
    artifacts: {
      allowedChangeManifest:
        input.artifacts?.allowedChangeManifest ??
        ".agent/artifacts/allowed_change_manifest.json",
    },
    logging: {
      transcriptCapture: input.logging?.transcriptCapture ?? "off",
      persistPrompts: input.logging?.persistPrompts ?? "off",
    },
  };
}
