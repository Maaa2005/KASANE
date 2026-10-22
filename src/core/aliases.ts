import type { ContextSource } from "./types.js";

type LinkedSource = Pick<ContextSource, "relativePath" | "linkTarget">;

/** The repository-relative path of the file a source's content comes from. */
export function realPathOf(source: LinkedSource): string {
  return source.linkTarget ?? source.relativePath;
}

/**
 * Paths of sources whose file is already analyzed under another path —
 * `CLAUDE.md` when it is a symlink to `AGENTS.md`. Each agent still reads
 * the alias, but its tokens and diagnostics are counted once, under the
 * file itself (or, if that is not a config file, under the first alias).
 */
export function aliasSourcePaths(sources: LinkedSource[]): Set<string> {
  const canonical = new Map<string, string>();
  for (const source of sources) {
    const real = realPathOf(source);
    const current = canonical.get(real);
    if (current === undefined || source.relativePath === real) {
      canonical.set(real, source.relativePath);
    }
  }

  const aliases = new Set<string>();
  for (const source of sources) {
    if (canonical.get(realPathOf(source)) !== source.relativePath) {
      aliases.add(source.relativePath);
    }
  }
  return aliases;
}
