import type { AppError } from "./result.js";

export function validationError(path: string, message: string): AppError {
  return { code: "VALIDATION_ERROR", path, message };
}

export function filesystemError(message: string, path?: string): AppError {
  if (path === undefined) {
    return { code: "FILESYSTEM_ERROR", message };
  }

  return { code: "FILESYSTEM_ERROR", path, message };
}

export function usageError(message: string): AppError {
  return { code: "USAGE_ERROR", message };
}
