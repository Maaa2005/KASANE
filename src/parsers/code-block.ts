import { changesDirectory } from "../utils/commands.js";

/** A command written in a code block, one line of what an agent would run. */
export interface CodeBlockCommand {
  /** The command without its prompt, comments or line continuations. */
  command: string;
  lineStart: number;
  lineEnd: number;
}

type Dialect = "posix" | "powershell" | "cmd";

/**
 * Info strings of code blocks that hold commands. Anything else (`json`,
 * `ts`, `text`, `diff`) is code or output an agent does not run as written.
 */
const SHELL_LANGUAGES = new Map<string, Dialect>([
  ["sh", "posix"],
  ["bash", "posix"],
  ["zsh", "posix"],
  ["ksh", "posix"],
  ["fish", "posix"],
  ["shell", "posix"],
  ["console", "posix"],
  ["terminal", "posix"],
  ["shell-session", "posix"],
  ["shellsession", "posix"],
  ["sh-session", "posix"],
  ["bash-session", "posix"],
  ["powershell", "powershell"],
  ["pwsh", "powershell"],
  ["ps1", "powershell"],
  ["posh", "powershell"],
  ["cmd", "cmd"],
  ["bat", "cmd"],
  ["batch", "cmd"],
]);

/** Terminal transcripts: a line is a command only after a prompt. */
const SESSION_LANGUAGES = new Set([
  "console",
  "terminal",
  "shell-session",
  "shellsession",
  "sh-session",
  "bash-session",
]);

/** `$ npm test`, `PS C:\repo> npm test`, `C:\repo>npm test`. */
const PROMPTS: Record<Dialect, RegExp> = {
  posix: /^\$(?:\s+|$)/,
  powershell: /^(?:PS(?:\s[^>]*)?>\s*|\$(?:\s+|$))/,
  cmd: /^(?:[A-Za-z]:\\[^>]*>\s*|\$(?:\s+|$))/,
};

const COMMENTS: Record<Dialect, RegExp> = {
  posix: /^#/,
  powershell: /^#/,
  cmd: /^(?:@?rem(?:\s|$)|::)/i,
};

/** The character that continues a command on the next line. */
const CONTINUATIONS: Record<Dialect, string> = {
  posix: "\\",
  powershell: "`",
  cmd: "^",
};

/** A pipe or `&&` / `||` at the end of a line continues the command. */
const TRAILING_OPERATOR = /(?:&&|\|\||\|)$/;

/** `cat <<EOF`, `<<-'EOF'`; `<<<` is a here-string on the same line. */
const HEREDOC_PATTERN = /(?<!<)<<-?[ \t]*(["']?)([A-Za-z_][\w.-]*)\1/;
/** A PowerShell here-string opens with `@"` or `@'` at the end of a line. */
const HERE_STRING_PATTERN = /@(["'])$/;

/**
 * Programs a block without an info string has to start every command with
 * to be read. Such blocks hold directory trees and sample output as often
 * as commands, and those lines are not instructions an agent runs.
 */
const KNOWN_PROGRAMS = new Set([
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "npx",
  "pnpx",
  "bunx",
  "corepack",
  "node",
  "deno",
  "tsx",
  "git",
  "gh",
  "make",
  "just",
  "cargo",
  "rustup",
  "go",
  "python",
  "python3",
  "pip",
  "pip3",
  "pipx",
  "uv",
  "uvx",
  "poetry",
  "pytest",
  "bundle",
  "gem",
  "rake",
  "rails",
  "composer",
  "php",
  "dotnet",
  "mvn",
  "gradle",
  "docker",
  "podman",
  "kubectl",
  "terraform",
  "swift",
  "flutter",
  "dart",
  "brew",
  "apt",
  "apt-get",
  "cd",
  "pushd",
  "export",
  "source",
  "mkdir",
  "cp",
  "mv",
  "rm",
  "ls",
  "cat",
  "echo",
  "curl",
]);

/** `FOO=1 npm test`, `sudo npm i -g x` and `env CI=1 npm test` start with a program too. */
const COMMAND_PREFIX = /^(?:(?:sudo|env)\s+|[A-Za-z_]\w*=\S*\s+)*/;

function startsWithKnownProgram(command: string): boolean {
  const [program = ""] = command.replace(COMMAND_PREFIX, "").split(/\s+/);
  return KNOWN_PROGRAMS.has(program) || /^\.{1,2}\//.test(program);
}

/** The language a code block's info string names: `bash` for `bash title="x"`. */
function languageOf(lang: string | null | undefined): string {
  return /^[\w+-]*/.exec((lang ?? "").trim().toLowerCase())?.[0] ?? "";
}

/**
 * Drops a `# comment` that starts a word outside quotes. `#` inside a word
 * (`$#`, `url#anchor`) or a string is part of the command.
 */
function stripTrailingComment(line: string): string {
  let quote: string | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote !== null) {
      if (char === quote) quote = null;
      else if (char === "\\" && quote === '"') index += 1;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "\\") {
      index += 1;
    } else if (char === "#" && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(0, index).trimEnd();
    }
  }
  return line;
}

/** The text a continued line contributes, or null when it ends the command. */
function continuedText(text: string, dialect: Dialect): string | null {
  if (text.endsWith(CONTINUATIONS[dialect])) return text.slice(0, -1).trimEnd();
  return TRAILING_OPERATOR.test(text) ? text : null;
}

/** Whether `line` closes the heredoc or here-string `text` opened. */
function bodyCloser(text: string, dialect: Dialect): ((line: string) => boolean) | null {
  if (dialect === "posix") {
    const delimiter = HEREDOC_PATTERN.exec(text)?.[2];
    return delimiter === undefined ? null : (line) => line === delimiter;
  }
  if (dialect === "powershell") {
    const quote = HERE_STRING_PATTERN.exec(text)?.[1];
    return quote === undefined ? null : (line) => line.startsWith(`${quote}@`);
  }
  return null;
}

/**
 * The commands in a code block, so they are compared and checked like the
 * commands written in prose. `firstLine` is the file line of the block's
 * first line of code.
 *
 * Only shell blocks are read, and a block without an info string only when
 * every command starts with a program in `KNOWN_PROGRAMS`. In a transcript
 * (`console`, or any block with `$ ` prompts) only prompted lines are
 * commands and the rest is output. Comments are dropped, continued lines
 * are joined, and a heredoc's body is skipped: it is data, not commands.
 *
 * Commands after a `cd` run against another package.json, so a `cd` and
 * everything after it in the block become one command, which KASANE003
 * leaves unchecked as it does `cd x && npm test` in prose.
 */
export function commandsInCodeBlock(
  lang: string | null | undefined,
  value: string,
  firstLine: number,
): CodeBlockCommand[] {
  const language = languageOf(lang);
  const untagged = language === "";
  const dialect = untagged ? "posix" : SHELL_LANGUAGES.get(language);
  if (dialect === undefined) return [];

  const prompt = PROMPTS[dialect];
  const comment = COMMENTS[dialect];
  const strip = dialect === "cmd" ? (line: string) => line : stripTrailingComment;
  const lines = value.split("\n").map((line) => line.replace(/\r$/, "").trim());
  const session =
    SESSION_LANGUAGES.has(language) || lines.some((line) => prompt.test(line));

  const commands: CodeBlockCommand[] = [];
  let index = 0;
  while (index < lines.length) {
    const lineStart = firstLine + index;
    let line = lines[index];
    index += 1;
    if (session) {
      const match = prompt.exec(line);
      if (!match) continue;
      line = line.slice(match[0].length);
    }
    if (line === "" || comment.test(line)) continue;

    let text = strip(line);
    let lineEnd = lineStart;
    for (
      let continued = continuedText(text, dialect);
      continued !== null;
      continued = continuedText(text, dialect)
    ) {
      text = continued;
      if (index >= lines.length) break;
      // A transcript shows `> ` before each continued line.
      const next = session ? lines[index].replace(/^>\s?/, "") : lines[index];
      text = `${text} ${strip(next)}`.trim();
      lineEnd = firstLine + index;
      index += 1;
    }

    const closes = bodyCloser(text, dialect);
    if (closes !== null) {
      while (index < lines.length) {
        lineEnd = firstLine + index;
        index += 1;
        if (closes(lines[index - 1])) break;
      }
    }

    if (text !== "") commands.push({ command: text, lineStart, lineEnd });
  }

  if (untagged && !session && !commands.every((c) => startsWithKnownProgram(c.command))) {
    return [];
  }

  const grouped: CodeBlockCommand[] = [];
  for (const command of commands) {
    const last = grouped[grouped.length - 1];
    if (last !== undefined && changesDirectory(last.command)) {
      last.command = `${last.command}; ${command.command}`;
      last.lineEnd = command.lineEnd;
    } else {
      grouped.push({ ...command });
    }
  }
  return grouped;
}
