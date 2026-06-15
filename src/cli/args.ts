import { usageError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";

export type CliFlags = Record<string, string | boolean>;

export type CliCommand =
  | { name: "init"; flags: CliFlags }
  | { name: "status"; flags: CliFlags }
  | { name: "config-validate"; flags: CliFlags }
  | { name: "next"; flags: CliFlags }
  | { name: "run-until-user-gate"; flags: CliFlags }
  | { name: "help"; flags: CliFlags };

const stringFlags = new Set(["config", "workspace"]);
const booleanFlags = new Set(["strict"]);

export function parseArgs(argv: string[]): Result<CliCommand> {
  const positionals: string[] = [];
  const flags: CliFlags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === undefined) {
      continue;
    }

    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const flagName = token.slice(2);
    if (flagName.length === 0) {
      return err(usageError("Flag name cannot be empty."));
    }

    if (stringFlags.has(flagName)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return err(usageError(`Missing value for --${flagName}.`));
      }

      flags[flagName] = value;
      index += 1;
      continue;
    }

    if (booleanFlags.has(flagName)) {
      flags[flagName] = true;
      continue;
    }

    return err(usageError(`Unknown flag: --${flagName}.`));
  }

  return parseCommand(positionals, flags);
}

function parseCommand(positionals: string[], flags: CliFlags): Result<CliCommand> {
  const command = positionals[0] ?? "help";

  if (command === "init" && positionals.length === 1) {
    return ok({ name: "init", flags });
  }

  if (command === "status" && positionals.length === 1) {
    return ok({ name: "status", flags });
  }

  if (command === "config" && positionals[1] === "validate" && positionals.length === 2) {
    return ok({ name: "config-validate", flags });
  }

  if (command === "next" && positionals.length === 1) {
    return ok({ name: "next", flags });
  }

  if (command === "run-until-user-gate" && positionals.length === 1) {
    return ok({ name: "run-until-user-gate", flags });
  }

  if (command === "help" && positionals.length <= 1) {
    return ok({ name: "help", flags });
  }

  return err(usageError(`Unknown command: ${positionals.join(" ")}`));
}
