import path from "node:path";
import fs from "node:fs";
import fg from "fast-glob";
import ignore from "ignore";
import type { SourceType } from "./types.js";

const CONFIG_PATTERNS: Array<{ pattern: string; sourceType: SourceType }> = [
  { pattern: "**/AGENTS.md", sourceType: "agents" },
  { pattern: "**/CLAUDE.md", sourceType: "claude" },
  { pattern: "**/CLAUDE.local.md", sourceType: "claude" },
  { pattern: "**/GEMINI.md", sourceType: "gemini" },
  { pattern: "**/.github/copilot-instructions.md", sourceType: "copilot" },
  // Cursor resolves rules from a `.cursor/rules` directory at any depth,
  // not only at the repository root — `backend/.cursor/rules/*.mdc` applies
  // to files under `backend/`.
  { pattern: "**/.cursor/rules/**/*.md", sourceType: "cursor" },
  { pattern: "**/.cursor/rules/**/*.mdc", sourceType: "cursor" },
  { pattern: "**/.cursorrules", sourceType: "cursor" },
];

const MCP_PATTERNS = [
  ".mcp.json",
  "mcp.json",
  ".cursor/mcp.json",
  ".claude/mcp.json",
];

const ALWAYS_IGNORED = ["**/node_modules/**", "**/.git/**"];

export interface DiscoveredFile {
  filePath: string;
  relativePath: string;
  sourceType: SourceType;
  /**
   * Set when `relativePath` is a symlink: the repository-relative path of the
   * file it resolves to. `ln -s AGENTS.md CLAUDE.md` is a common way to share
   * one file between agents.
   */
  linkTarget?: string;
}

/**
 * Returns the real path of `relativePath` when it resolves, through any
 * symlinks, to a regular file inside `root`; otherwise null. Anything that
 * points outside the repository — `/etc/passwd`, `~/.ssh/…`, `/dev/zero` — is
 * never read, so analyzing an untrusted checkout cannot print or hang on it.
 */
export function resolveFileInside(
  root: string,
  relativePath: string,
): string | null {
  try {
    const realRoot = fs.realpathSync(root);
    const real = fs.realpathSync(path.join(root, relativePath));
    const fromRoot = path.relative(realRoot, real);
    if (
      fromRoot === "" ||
      fromRoot === ".." ||
      fromRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(fromRoot)
    ) {
      return null;
    }
    return fs.statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

function readIgnoreFile(root: string, relativePath: string): string {
  const real = resolveFileInside(root, relativePath);
  return real ? fs.readFileSync(real, "utf8") : "";
}

function loadGitignore(root: string): ReturnType<typeof ignore> {
  const ig = ignore();
  ig.add(readIgnoreFile(root, ".gitignore"));
  // `.git/info/exclude` is honored by git but never committed, so it is the
  // only place some users keep local-only agent files.
  ig.add(readIgnoreFile(root, path.join(".git", "info", "exclude")));
  return ig;
}

// `CLAUDE.local.md` is meant to be gitignored, and Claude Code loads it
// anyway, so ignoring it would hide context the agent actually sees. It is
// still skipped when the directory holding it is ignored.
function isIgnored(ig: ReturnType<typeof ignore>, relativePath: string): boolean {
  if (path.posix.basename(relativePath) !== "CLAUDE.local.md") {
    return ig.ignores(relativePath);
  }
  const dir = path.posix.dirname(relativePath);
  return dir !== "." && ig.ignores(`${dir}/`);
}

// Nested checkouts (worktrees, submodules, vendored repos) are separate
// project roots for agents, so their files are not this repository's context.
// `.git` is a file in worktrees and submodules, a directory in plain clones.
function createNestedRepoCheck(
  root: string,
): (relativePath: string) => boolean {
  const cache = new Map<string, boolean>();

  const isNestedRepo = (relativeDir: string): boolean => {
    const cached = cache.get(relativeDir);
    if (cached !== undefined) return cached;
    const result = fs.existsSync(path.join(root, relativeDir, ".git"));
    cache.set(relativeDir, result);
    return result;
  };

  return (relativePath) => {
    // Walk ancestors below the root only; the root's own `.git` must not
    // exclude everything.
    const segments = relativePath.split("/").slice(0, -1);
    let dir = "";
    for (const segment of segments) {
      dir = dir === "" ? segment : `${dir}/${segment}`;
      if (isNestedRepo(dir)) return true;
    }
    return false;
  };
}

export async function discoverConfigFiles(
  root: string,
): Promise<DiscoveredFile[]> {
  const absoluteRoot = path.resolve(root);
  const ig = loadGitignore(absoluteRoot);
  const insideNestedRepo = createNestedRepoCheck(absoluteRoot);
  const realRoot = fs.realpathSync(absoluteRoot);

  const results: DiscoveredFile[] = [];
  const seen = new Set<string>();

  const collect = async (
    pattern: string,
    sourceType: SourceType,
  ): Promise<void> => {
    const matches = await fg(pattern, {
      cwd: absoluteRoot,
      ignore: ALWAYS_IGNORED,
      dot: true,
      // fast-glob drops symlinks under `onlyFiles`; each match is checked
      // with `resolveFileInside` instead.
      onlyFiles: false,
      followSymbolicLinks: false,
      absolute: false,
    });

    for (const relativePath of matches) {
      if (isIgnored(ig, relativePath)) continue;
      if (insideNestedRepo(relativePath)) continue;
      if (seen.has(relativePath)) continue;
      const real = resolveFileInside(absoluteRoot, relativePath);
      if (!real) continue;
      seen.add(relativePath);
      const target = path.relative(realRoot, real).split(path.sep).join("/");
      results.push({
        filePath: path.join(absoluteRoot, relativePath),
        relativePath,
        sourceType,
        ...(target !== relativePath ? { linkTarget: target } : {}),
      });
    }
  };

  for (const { pattern, sourceType } of CONFIG_PATTERNS) {
    await collect(pattern, sourceType);
  }

  for (const pattern of MCP_PATTERNS) {
    await collect(pattern, "mcp");
  }

  // Glob order is filesystem-dependent, which would make `--format json`
  // output differ between machines for an identical repository.
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return results;
}
