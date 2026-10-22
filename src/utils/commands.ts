export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface DetectedCommand {
  manager: PackageManager;
  script: string;
  /**
   * Whether the manager falls back to a dependency's binary when no script
   * has this name, as `pnpm tsc`, `yarn jest` and `bun run vite` do.
   * `npm run` and `pnpm run` only run scripts.
   */
  runsBinaries: boolean;
}

// Subcommands of the bare `pnpm <word>` / `yarn <word>` form that are not
// scripts (e.g. "pnpm install" is not a missing package.json script).
const BUILTIN_SUBCOMMANDS = new Set([
  "install",
  "i",
  "add",
  "remove",
  "rm",
  "uninstall",
  "update",
  "upgrade",
  "upgrade-interactive",
  "up",
  "ci",
  "run",
  "run-script",
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
  "explain",
  "list",
  "ls",
  "view",
  "info",
  "search",
  "set",
  "get",
  "use",
  "root",
  "bin",
  "store",
  "env",
  "workspace",
  "workspaces",
  "recursive",
  "global",
  "policies",
  "node",
  "npm",
  "x",
  "dedupe",
  "restart",
  "import",
  "patch",
  "patch-commit",
  "patch-remove",
  "rebuild",
  "rb",
  "deploy",
  "licenses",
  "fetch",
  "setup",
  "self-update",
  "doctor",
  "server",
  "docs",
  "home",
  "approve-builds",
  "ignored-builds",
  "completion",
  "constraints",
  "plugin",
  "unplug",
  "autoclean",
  "check",
  "sdks",
  "stage",
  "tag",
  "owner",
  "team",
]);

/** Subcommands that run the script named after them. */
const RUN_SUBCOMMANDS = new Set(["run", "run-script"]);
/** npm also accepts these misspellings of `run`. */
const NPM_RUN_ALIASES = new Set(["rum", "urn"]);

/**
 * npm subcommands that run a script of the same name. `npm restart` is left
 * out: without a restart script it runs the stop and start scripts.
 */
const NPM_SCRIPT_ALIASES = new Map([
  ["test", "test"],
  ["t", "test"],
  ["tst", "test"],
  ["start", "start"],
  ["stop", "stop"],
]);

/**
 * Flags after which the command runs another package's script, or no longer
 * fails when the script is missing. Such a command is not checked against
 * this package.json at all.
 */
const UNCHECKABLE_FLAGS = new Set([
  "--filter",
  "-F",
  "--dir",
  "-C",
  "--prefix",
  "--cwd",
  "-r",
  "--recursive",
  "-w",
  "--workspace",
  "--workspace-root",
  "--workspaces",
  "--ws",
  "--include-workspace-root",
  "-g",
  "--global",
  "--if-present",
]);

/** Flags that take no value and do not change which script runs. */
const BOOLEAN_FLAGS = new Set([
  "-s",
  "--silent",
  "-q",
  "--quiet",
  "--verbose",
  "--parallel",
  "--stream",
  "--aggregate-output",
  "--sequential",
  "--bail",
  "--no-bail",
  "--reporter-hide-prefix",
  "--report-summary",
  "--use-stderr",
  "--bun",
  "-b",
  "--watch",
  "--hot",
  "--smol",
  "--color",
  "--no-color",
  "--offline",
  "--prefer-offline",
]);

/** Flags that take the next word as their value. */
const VALUE_FLAGS = new Set([
  "--loglevel",
  "--reporter",
  "--shell",
  "--resume-from",
  "--workspace-concurrency",
  "--elide-lines",
]);

const SCRIPT_NAME_PATTERN = /^[A-Za-z_][\w:.@+-]*$/;
/** `bun run index.ts` runs a file, not a script. */
const FILE_NAME_PATTERN = /\.(?:[cm]?[jt]sx?|json|sh)$/i;
/** Words that stand for a script in documentation ("npm run <script>"). */
const PLACEHOLDERS = new Set([
  "script",
  "scripts",
  "command",
  "commands",
  "task",
  "tasks",
  "name",
]);
/**
 * Words that follow "npm run" in a sentence about it rather than in a
 * command ("use npm run for scripts"). Only applied outside code spans.
 */
const PROSE_WORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "for",
  "with",
  "and",
  "or",
  "in",
  "on",
  "at",
  "of",
  "from",
  "as",
  "if",
  "when",
  "before",
  "after",
  "then",
  "first",
  "it",
  "this",
  "that",
  "these",
  "those",
  "them",
  "is",
  "are",
  "will",
  "can",
  "should",
  "must",
  "your",
  "our",
  "its",
  "every",
  "each",
  "any",
  "all",
]);

const CODE_SPAN_PATTERN = /`([^`]+)`/g;
/** Shell operators that start a new command. */
const SEGMENT_SEPARATOR = /&&|\|\||[;|\n]/;
const MANAGER_PATTERN = /(?<![\w./@-])(npm|pnpm|yarn|bun)(?=\s)/g;
const MANAGER_WORD = /^(?:npm|pnpm|yarn|bun)$/;
/**
 * Once the text changes directory, the commands after it run against
 * another package.json.
 */
const CHANGE_DIRECTORY_PATTERN = /(?<![\w./-])(?:cd|pushd)\s+[^\s`]/;

function cleanWord(word: string): string {
  return word.replace(/^["'(]+/, "").replace(/["'.,;:!?)\]}]+$/, "");
}

/**
 * Returns the index of the first word that is not a flag, or null when a
 * flag makes the command uncheckable. Unknown flags count as uncheckable:
 * guessing whether they take a value would misread the script name.
 */
function skipFlags(words: string[], start: number): number | null {
  let index = start;
  while (index < words.length && words[index].startsWith("-")) {
    const word = words[index];
    const [name] = word.split("=");
    if (UNCHECKABLE_FLAGS.has(name)) return null;
    if (word.startsWith("--") && word.includes("=")) {
      index += 1;
    } else if (BOOLEAN_FLAGS.has(word)) {
      index += 1;
    } else if (VALUE_FLAGS.has(word)) {
      index += 2;
    } else {
      return null;
    }
  }
  return index;
}

function isScriptName(script: string, inCode: boolean): boolean {
  if (!SCRIPT_NAME_PATTERN.test(script)) return false;
  if (FILE_NAME_PATTERN.test(script)) return false;
  const lower = script.toLowerCase();
  if (PLACEHOLDERS.has(lower)) return false;
  return inCode || !PROSE_WORDS.has(lower);
}

function parseCommand(
  manager: PackageManager,
  words: string[],
  inCode: boolean,
): DetectedCommand | null {
  let index = skipFlags(words, 0);
  if (index === null || index >= words.length) return null;
  const subcommand = cleanWord(words[index]);

  let script: string;
  let runsBinaries: boolean;
  if (
    RUN_SUBCOMMANDS.has(subcommand) ||
    (manager === "npm" && NPM_RUN_ALIASES.has(subcommand))
  ) {
    index = skipFlags(words, index + 1);
    if (index === null || index >= words.length) return null;
    script = cleanWord(words[index]);
    runsBinaries = manager === "yarn" || manager === "bun";
  } else if (manager === "npm") {
    const alias = NPM_SCRIPT_ALIASES.get(subcommand);
    if (alias === undefined) return null;
    script = alias;
    runsBinaries = false;
  } else if (
    // The bare form is ambiguous with prose ("use pnpm for everything"), so
    // it is only read inside code spans. `bun <word>` prefers bun's own
    // commands over scripts, so it is not read at all.
    inCode &&
    (manager === "pnpm" || manager === "yarn") &&
    !BUILTIN_SUBCOMMANDS.has(subcommand)
  ) {
    script = subcommand;
    runsBinaries = true;
  } else {
    return null;
  }

  // npm reads workspace flags after the script name too.
  for (const word of words.slice(index + 1)) {
    if (word === "--") break;
    if (UNCHECKABLE_FLAGS.has(word.split("=")[0])) return null;
  }

  return isScriptName(script, inCode) ? { manager, script, runsBinaries } : null;
}

function extractFromSegment(segment: string, inCode: boolean): DetectedCommand[] {
  const results: DetectedCommand[] = [];

  for (const match of segment.matchAll(MANAGER_PATTERN)) {
    const rest = segment.slice((match.index ?? 0) + match[0].length);
    const words = rest.split(/\s+/).filter((word) => word.length > 0);
    // A command ends where the next one starts ("npm run a or yarn b").
    const next = words.findIndex((word) => MANAGER_WORD.test(word));
    const command = parseCommand(
      match[1] as PackageManager,
      next >= 0 ? words.slice(0, next) : words,
      inCode,
    );
    if (command) results.push(command);
  }

  return results;
}

/**
 * Extracts npm/pnpm/yarn/bun script invocations from instruction text.
 * Used by KASANE003.
 *
 * Commands are read from inline code spans and from the prose around them,
 * split at shell operators. Anything that targets another package (`cd`,
 * `--filter`, `--workspace`), tolerates a missing script (`--if-present`)
 * or carries a flag this parser does not know is skipped: a missed command
 * is cheaper than an error for a script that exists.
 */
export function extractPackageManagerCommands(text: string): DetectedCommand[] {
  const cd = CHANGE_DIRECTORY_PATTERN.exec(text);
  const checked = cd ? text.slice(0, cd.index) : text;

  const codeSpans = Array.from(checked.matchAll(CODE_SPAN_PATTERN), (m) => m[1]);
  const prose = checked.replace(CODE_SPAN_PATTERN, "\n");

  const results: DetectedCommand[] = [];
  for (const span of codeSpans) {
    for (const segment of span.split(SEGMENT_SEPARATOR)) {
      results.push(...extractFromSegment(segment, true));
    }
  }
  for (const segment of prose.split(SEGMENT_SEPARATOR)) {
    results.push(...extractFromSegment(segment, false));
  }
  return results;
}

/**
 * Packages whose binary is not named after the package. A binary named
 * after its package (`eslint`, `vitest`) is matched directly.
 */
const BINARY_PACKAGES = new Map<string, string[]>([
  ["tsc", ["typescript"]],
  ["tsserver", ["typescript"]],
  ["playwright", ["@playwright/test"]],
  ["biome", ["@biomejs/biome"]],
  ["ng", ["@angular/cli"]],
  ["changeset", ["@changesets/cli"]],
  ["commitlint", ["@commitlint/cli"]],
  ["svelte-kit", ["@sveltejs/kit"]],
  ["nuxi", ["nuxt"]],
  ["tailwindcss", ["@tailwindcss/cli"]],
  ["firebase", ["firebase-tools"]],
  ["netlify", ["netlify-cli"]],
  ["nest", ["@nestjs/cli"]],
  ["tauri", ["@tauri-apps/cli"]],
  ["vue-cli-service", ["@vue/cli-service"]],
  ["graphql-codegen", ["@graphql-codegen/cli"]],
  ["run-s", ["npm-run-all", "npm-run-all2"]],
  ["run-p", ["npm-run-all", "npm-run-all2"]],
  ["eas", ["eas-cli"]],
  ["cdk", ["aws-cdk"]],
  ["docusaurus", ["@docusaurus/core"]],
  ["remix", ["@remix-run/dev"]],
  ["cz", ["commitizen"]],
  ["dotenv", ["dotenv-cli"]],
]);

/** Whether one of the dependencies installs a binary with this name. */
export function isDependencyBinary(
  name: string,
  dependencies: ReadonlySet<string>,
): boolean {
  if (dependencies.has(name)) return true;
  return (BINARY_PACKAGES.get(name) ?? []).some((pkg) => dependencies.has(pkg));
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
