import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join } from "node:path";
import { parseJson } from "../core/json.js";
import { err, type Result } from "../core/result.js";
import { DEFAULT_CONFIG_FILE } from "./defaults.js";
import { validateConfig, type AgentFlowConfig } from "./schema.js";

export type LoadConfigOptions = {
  cwd?: string;
  configPath?: string;
};

export async function loadConfig(options: LoadConfigOptions = {}): Promise<Result<AgentFlowConfig>> {
  const cwd = options.cwd ?? process.cwd();
  const requestedPath = options.configPath ?? DEFAULT_CONFIG_FILE;
  const configPath = isAbsolute(requestedPath) ? requestedPath : join(cwd, requestedPath);
  const extension = extname(configPath).toLowerCase();

  if (extension === ".yaml" || extension === ".yml") {
    return err({
      code: "UNSUPPORTED_CONFIG_FORMAT",
      path: configPath,
      message: "Agent Flow v1 supports JSON config only. Use .agent-flow.json.",
    });
  }

  let source: string;
  try {
    source = await readFile(configPath, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return err({
        code: "CONFIG_NOT_FOUND",
        path: configPath,
        message: `Config file not found: ${configPath}`,
      });
    }
    return err({
      code: "CONFIG_UNREADABLE",
      path: configPath,
      message: `Config file could not be read: ${configPath}`,
    });
  }

  const json = parseJson(source, configPath);
  if (!json.ok) {
    return json;
  }

  return validateConfig(json.value);
}
