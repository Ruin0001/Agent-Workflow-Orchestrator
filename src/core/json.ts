import { err, ok, type Result } from "./result.js";

export function parseJson(source: string, path?: string): Result<unknown> {
  try {
    return ok(JSON.parse(source));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    if (path === undefined) {
      return err({
        code: "INVALID_JSON",
        message: `Invalid JSON: ${message}`,
      });
    }
    return err({
      code: "INVALID_JSON",
      path,
      message: `Invalid JSON: ${message}`,
    });
  }
}
