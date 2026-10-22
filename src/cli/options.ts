import fs from "node:fs/promises";
import path from "node:path";
import { resolveTargetPath, TargetPathError } from "../core/resolver.js";

/**
 * Checks `--root` and `--path` before analysis, so a mistyped location is
 * reported as a usage error (exit 2) instead of an analysis failure.
 * Returns the message to print, or null when both are usable.
 */
export async function checkLocationOptions(options: {
  root: string;
  path?: string;
}): Promise<string | null> {
  const root = path.resolve(options.root);
  const stat = await fs.stat(root).catch(() => null);
  if (stat === null) return `--root does not exist: ${options.root}`;
  if (!stat.isDirectory()) return `--root is not a directory: ${options.root}`;

  if (options.path) {
    try {
      resolveTargetPath(root, options.path);
    } catch (err) {
      if (err instanceof TargetPathError) return err.message;
      throw err;
    }
  }
  return null;
}
