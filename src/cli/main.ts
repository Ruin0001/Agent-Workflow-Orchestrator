import { pathToFileURL } from "node:url";
import { parseArgs, type CliCommand } from "./args.js";
import { formatAppError, helpText } from "./output.js";
import { initCommand } from "../commands/init.js";
import { statusCommand } from "../commands/status.js";
import { configValidateCommand } from "../commands/config-validate.js";
import { nextCommand } from "../commands/next.js";
import { ok, type Result } from "../core/result.js";

async function dispatch(command: CliCommand): Promise<Result<string>> {
  switch (command.name) {
    case "init":
      return initCommand(commandOptions(command));
    case "status":
      return statusCommand(commandOptions(command));
    case "config-validate":
      return configValidateCommand({
        ...commandOptions(command),
        strict: command.flags.strict === true,
      });
    case "next":
      return nextCommand(commandOptions(command));
    case "run-until-user-gate":
      return ok(helpText());
    case "help":
      return ok(helpText());
  }
}

export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    console.error(formatAppError(parsed.error));
    return 1;
  }

  const result = await dispatch(parsed.value);
  if (!result.ok) {
    console.error(formatAppError(result.error));
    return 1;
  }

  console.log(result.value);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main(process.argv.slice(2)).then((exitCode) => {
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  });
}

function stringFlag(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function commandOptions(command: CliCommand): { workspace?: string; configPath?: string } {
  const options: { workspace?: string; configPath?: string } = {};
  const workspace = stringFlag(command.flags.workspace);
  const configPath = stringFlag(command.flags.config);
  if (workspace !== undefined) {
    options.workspace = workspace;
  }
  if (configPath !== undefined) {
    options.configPath = configPath;
  }
  return options;
}
