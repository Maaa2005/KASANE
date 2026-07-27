export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface DetectedCommand {
  manager: PackageManager;
  script: string;
}

// Common non-script subcommands, excluded to avoid false positives
// (e.g. "npm install" is not a missing package.json script).
const BUILTIN_SUBCOMMANDS = new Set([
  "install",
  "i",
  "add",
  "remove",
  "rm",
  "uninstall",
  "update",
  "upgrade",
  "up",
  "ci",
  "run",
  "exec",
  "dlx",
  "create",
  "init",
  "publish",
  "pack",
  "link",
  "unlink",
  "outdated",
  "audit",
  "cache",
  "config",
  "login",
  "logout",
  "whoami",
  "version",
  "help",
  "prune",
  "why",
  "list",
  "ls",
  "view",
  "search",
  "set",
  "get",
  "use",
  "root",
  "store",
  "env",
  "workspace",
  "workspaces",
  "global",
  "policies",
  "node",
  "x",
  "dedupe",
]);

const NPM_ALIAS_PATTERN = /\bnpm (test|start|stop|restart)\b/g;
const RUN_PATTERN = /\b(npm|pnpm|yarn|bun) run ([\w:.-]+)/g;
const BARE_PATTERN = /\b(pnpm|yarn) ([\w:.-]+)/g;
const CODE_SPAN_PATTERN = /`([^`]+)`/g;

function extractCodeSpans(text: string): string {
  return Array.from(text.matchAll(CODE_SPAN_PATTERN), (match) => match[1]).join(
    "\n",
  );
}

/**
 * Extracts npm/pnpm/yarn/bun script invocations from instruction text,
 * excluding common builtin subcommands. Used by KASANE003.
 *
 * The bare `pnpm <word>` / `yarn <word>` form is ambiguous with ordinary
 * prose ("use pnpm for everything"), so it is only checked inside inline
 * code spans, where a command is actually being written.
 */
export function extractPackageManagerCommands(text: string): DetectedCommand[] {
  const results: DetectedCommand[] = [];

  for (const match of text.matchAll(NPM_ALIAS_PATTERN)) {
    results.push({ manager: "npm", script: match[1] });
  }

  for (const match of text.matchAll(RUN_PATTERN)) {
    results.push({
      manager: match[1] as PackageManager,
      script: match[2],
    });
  }

  const codeSpans = extractCodeSpans(text);
  for (const match of codeSpans.matchAll(BARE_PATTERN)) {
    const script = match[2];
    if (BUILTIN_SUBCOMMANDS.has(script)) continue;
    results.push({ manager: match[1] as PackageManager, script });
  }

  return results;
}

const MANAGER_MENTION_PATTERN = /\b(npm|pnpm|yarn|bun)\b/g;

/**
 * A manager named as the thing *not* to use. "Use pnpm instead of npm" and
 * "Do not use npm" both name npm, but neither instructs an agent to run it,
 * and counting them makes KASANE004 contradict the very line that resolves
 * the ambiguity.
 */
const NEGATED_MANAGER_PATTERN =
  /\b(?:do\s+not\s+use|does\s+not\s+use|don'?t\s+use|never\s+use|stop\s+using|avoid(?:\s+using)?|instead\s+of|rather\s+than|not|no)\s+(?:the\s+)?(?:npm|pnpm|yarn|bun)\b/gi;

/**
 * Extracts package manager names the text tells an agent to use, ignoring
 * ones it explicitly tells the agent not to use. Used by KASANE004.
 */
export function extractMentionedManagers(text: string): PackageManager[] {
  const positive = text.replace(NEGATED_MANAGER_PATTERN, " ");
  const matches = positive.match(MANAGER_MENTION_PATTERN) ?? [];
  return Array.from(new Set(matches)) as PackageManager[];
}

export const LOCKFILE_MANAGERS: Record<string, PackageManager> = {
  "package-lock.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "bun.lock": "bun",
  "bun.lockb": "bun",
};
