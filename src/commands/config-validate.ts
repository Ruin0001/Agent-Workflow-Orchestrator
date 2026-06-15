import { loadConfig } from "../config/load.js";
import { err, ok, type Result } from "../core/result.js";

export type ConfigValidateOptions = {
  workspace?: string;
  configPath?: string;
  strict?: boolean;
};

export async function configValidateCommand(
  options: ConfigValidateOptions = {},
): Promise<Result<string>> {
  const loadOptions: { cwd: string; configPath?: string } = {
    cwd: options.workspace ?? process.cwd(),
  };
  if (options.configPath !== undefined) {
    loadOptions.configPath = options.configPath;
  }

  const config = await loadConfig(loadOptions);
  if (!config.ok) {
    return err(config.error);
  }

  void options.strict;
  return ok("Config valid");
}
