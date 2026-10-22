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
}

function loadGitignore(root: string): ReturnType<typeof ignore> {
  const ig = ignore();
  const gitignorePath = path.join(root, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath, "utf8"));
  }
  // `.git/info/exclude` is honored by git but never committed, so it is the
  // only place some users keep local-only agent files.
  const excludePath = path.join(root, ".git", "info", "exclude");
  if (fs.existsSync(excludePath)) {
    ig.add(fs.readFileSync(excludePath, "utf8"));
  }
  return ig;
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
      onlyFiles: true,
      followSymbolicLinks: false,
      absolute: false,
    });

    for (const relativePath of matches) {
      if (ig.ignores(relativePath)) continue;
      if (insideNestedRepo(relativePath)) continue;
      if (seen.has(relativePath)) continue;
      seen.add(relativePath);
      results.push({
        filePath: path.join(absoluteRoot, relativePath),
        relativePath,
        sourceType,
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
