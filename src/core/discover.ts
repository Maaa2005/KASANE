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
  { pattern: ".github/copilot-instructions.md", sourceType: "copilot" },
  { pattern: ".cursor/rules/**/*.md", sourceType: "cursor" },
  { pattern: ".cursor/rules/**/*.mdc", sourceType: "cursor" },
  { pattern: ".cursorrules", sourceType: "cursor" },
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
  return ig;
}

export async function discoverConfigFiles(
  root: string,
): Promise<DiscoveredFile[]> {
  const absoluteRoot = path.resolve(root);
  const ig = loadGitignore(absoluteRoot);

  const results: DiscoveredFile[] = [];
  const seen = new Set<string>();

  for (const { pattern, sourceType } of CONFIG_PATTERNS) {
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
      if (seen.has(relativePath)) continue;
      seen.add(relativePath);
      results.push({
        filePath: path.join(absoluteRoot, relativePath),
        relativePath,
        sourceType,
      });
    }
  }

  for (const pattern of MCP_PATTERNS) {
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
      if (seen.has(relativePath)) continue;
      seen.add(relativePath);
      results.push({
        filePath: path.join(absoluteRoot, relativePath),
        relativePath,
        sourceType: "mcp",
      });
    }
  }

  return results;
}
