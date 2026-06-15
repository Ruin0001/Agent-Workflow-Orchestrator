import type { ArtifactPaths } from "../artifacts/paths.js";
import { STANDARD_ARTIFACT_NAMES } from "../artifacts/paths.js";
import type { AgentFlowConfig, AgentRole } from "../config/schema.js";
import type { WorkflowState } from "../state/schema.js";
import { PROMPT_TEMPLATES } from "./templates.js";

export type RenderPromptInput = {
  state: WorkflowState;
  config: AgentFlowConfig;
  artifactPaths: ArtifactPaths;
  role: AgentRole;
  stopCondition: string;
  guardrails: string[];
};

export function renderPrompt(input: RenderPromptInput): string {
  const task = input.state.currentTask;
  const lines = [
    "# Agent Workflow Step",
    "",
    `Phase: ${input.state.phase}`,
    `Role: ${input.role}`,
    `Actor: ${input.state.currentActor}`,
    `Template: ${PROMPT_TEMPLATES[input.state.phase]}`,
    "",
    "## Current Task",
    `ID: ${task.id ?? "none"}`,
    `Title: ${task.title ?? "none"}`,
    `Description: ${task.description ?? "none"}`,
    "",
    "## Project Context",
    ...formatList("Source of truth", input.config.projectContext.sourceOfTruth),
    ...formatList("Files", input.config.projectContext.files),
    ...formatList("Extra instructions", input.config.projectContext.extraInstructions),
    "",
    "## Artifacts",
    ...STANDARD_ARTIFACT_NAMES.map((name) => `${name}: ${input.artifactPaths[name]}`),
    "",
    "## Guardrails",
    ...formatBullets(input.guardrails),
    "",
    "## Stop Condition",
    input.stopCondition,
  ];

  return `${lines.join("\n")}\n`;
}

function formatList(label: string, values: string[]): string[] {
  if (values.length === 0) {
    return [`${label}: none`];
  }
  return [`${label}:`, ...formatBullets(values)];
}

function formatBullets(values: string[]): string[] {
  if (values.length === 0) {
    return ["- none"];
  }
  return values.map((value) => `- ${value}`);
}
