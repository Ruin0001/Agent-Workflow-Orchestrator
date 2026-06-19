import type { AppError } from "../core/result.js";

export function formatAppError(error: AppError): string {
  const path = error.path === undefined ? "" : ` (${error.path})`;
  return `${error.code}: ${error.message}${path}`;
}

export function formatMessage(message: string): string {
  return message;
}

export function helpText(): string {
  return [
    "Usage: agent-flow <command> [flags]",
    "",
    "Commands:",
    "  init",
    "  status",
    "  config validate",
    "  next",
    "  run-until-user-gate",
    "  help",
    "",
    "Flags:",
    "  --config <path>",
    "  --workspace <path>",
    "  --strict",
    "  --delegated    Use configured gate delegation for run-until-user-gate",
  ].join("\n");
}
