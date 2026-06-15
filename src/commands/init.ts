import { access, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { DEFAULT_CONFIG_FILE, applyConfigDefaults } from "../config/defaults.js";
import { loadConfig } from "../config/load.js";
import { filesystemError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { createInitialState } from "../state/schema.js";
import { writeState } from "../state/store.js";

export type InitOptions = {
  workspace?: string;
  configPath?: string;
};

export async function initCommand(options: InitOptions = {}): Promise<Result<string>> {
  const workspace = options.workspace ?? process.cwd();
  const requestedConfigPath = options.configPath ?? DEFAULT_CONFIG_FILE;
  const configPath = resolvePath(workspace, requestedConfigPath);
  const loadedConfig = await loadConfig({ cwd: workspace, configPath: requestedConfigPath });
  if (!loadedConfig.ok && loadedConfig.error.code !== "CONFIG_NOT_FOUND") {
    return err(loadedConfig.error);
  }

  const config = loadedConfig.ok ? loadedConfig.value : applyConfigDefaults({ version: 1 });
  const stateDir = resolvePath(workspace, config.workspace.stateDir);
  const logDir = resolvePath(workspace, config.workspace.logDir);
  const artifactDir = resolvePath(workspace, config.workspace.artifactDir);
  const promptDir = resolvePath(workspace, config.workspace.promptDir);

  try {
    await mkdir(workspace, { recursive: true });
    await mkdir(stateDir, { recursive: true });
    await mkdir(logDir, { recursive: true });
    await mkdir(artifactDir, { recursive: true });
    await mkdir(promptDir, { recursive: true });
  } catch (error) {
    return err(filesystemError(errorMessage(error), workspace));
  }

  const configWrite = await writeIfAbsent(
    configPath,
    `${JSON.stringify({ version: 1 }, null, 2)}\n`,
  );
  if (!configWrite.ok) return configWrite;

  const statePath = join(stateDir, "workflow_state.json");
  if (!(await pathExists(statePath))) {
    const stateWrite = await writeState(statePath, createInitialState(config));
    if (!stateWrite.ok) return stateWrite;
  }

  const files: Array<[string, string]> = [
    [join(stateDir, "handoff.md"), "# Agent Flow Handoff\n"],
    [join(logDir, "agent_log.md"), "# Agent Log\n"],
    [join(logDir, "runs.jsonl"), ""],
  ];

  for (const [path, content] of files) {
    const result = await writeIfAbsent(path, content);
    if (!result.ok) return result;
  }

  return ok(`Agent Flow initialized in ${workspace}`);
}

async function writeIfAbsent(path: string, content: string): Promise<Result<void>> {
  try {
    await writeFile(path, content, { encoding: "utf8", flag: "wx" });
    return ok(undefined);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "EEXIST") {
      return ok(undefined);
    }
    return err(filesystemError(errorMessage(error), path));
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function resolvePath(workspace: string, path: string): string {
  return isAbsolute(path) ? path : join(workspace, path);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Filesystem operation failed";
}
