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

/**
 * `$ npm test`, `PS C:\repo> npm test`, `C:\repo>npm test`. A cmd prompt
 * has no space before its `>`, which tells it from `C:\x.exe > out.txt`.
 */
const PROMPTS: Record<Dialect, RegExp> = {
  posix: /^\$(?:\s+|$)/,
  powershell: /^(?:PS(?:\s[^>]*)?>\s*|\$(?:\s+|$))/,
  cmd: /^(?:[A-Za-z]:\\(?:[^>]*\S)?>\s*|\$(?:\s+|$))/,
};

const COMMENTS: Record<Dialect, RegExp> = {
  posix: /^#/,
  powershell: /^#/,
  cmd: /^(?:@?rem(?:\s|$)|::)/i,
};

/**
 * The character that escapes the next one, and so continues a command on
 * the next line when it ends one.
 */
const ESCAPES: Record<Dialect, string> = {
  posix: "\\",
  powershell: "`",
  cmd: "^",
};

/** A pipe or `&&` / `||` at the end of a line continues the command. */
const TRAILING_OPERATOR = /(?:&&|\|\||\|)$/;

/** The delimiter after `<<` in `cat <<EOF` or `cat <<-'EOF'`. */
const HEREDOC_DELIMITER = /^<<-?[ \t]*(["']?)([A-Za-z_][\w.-]*)\1/;
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
 * The index of the first character of `line` outside quotes, escapes and
 * arithmetic (`$((1 << n))`) for which `matches` is true, or -1.
 */
function findUnquoted(
  line: string,
  dialect: Dialect,
  matches: (index: number) => boolean,
): number {
  const escape = ESCAPES[dialect];
  let quote: string | null = null;
  let arithmetic = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote !== null) {
      if (char === quote) quote = null;
      else if (char === escape && quote === '"') index += 1;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === escape) {
      index += 1;
    } else if (line.startsWith("((", index)) {
      arithmetic += 1;
      index += 1;
    } else if (arithmetic > 0) {
      if (line.startsWith("))", index)) {
        arithmetic -= 1;
        index += 1;
      }
    } else if (matches(index)) {
      return index;
    }
  }
  return -1;
}

/**
 * Drops a `# comment` that starts a word outside quotes. `#` inside a word
 * (`$#`, `url#anchor`) or a string is part of the command.
 */
function stripTrailingComment(line: string, dialect: Dialect): string {
  const start = findUnquoted(
    line,
    dialect,
    (index) => line[index] === "#" && (index === 0 || /\s/.test(line[index - 1])),
  );
  return start < 0 ? line : line.slice(0, start).trimEnd();
}

/** The delimiter of the heredoc `text` opens outside quotes and arithmetic. */
function heredocDelimiter(text: string): string | undefined {
  let delimiter: string | undefined;
  findUnquoted(text, "posix", (index) => {
    if (!text.startsWith("<<", index) || text[index - 1] === "<") return false;
    delimiter = HEREDOC_DELIMITER.exec(text.slice(index))?.[2];
    return delimiter !== undefined;
  });
  return delimiter;
}

/** The text a continued line contributes, or null when it ends the command. */
function continuedText(text: string, dialect: Dialect): string | null {
  // `\\` at the end is an escaped backslash, not a continuation.
  const escape = ESCAPES[dialect];
  let trailing = 0;
  while (text[text.length - 1 - trailing] === escape) trailing += 1;
  if (trailing % 2 === 1) return text.slice(0, -1).trimEnd();
  return TRAILING_OPERATOR.test(text) ? text : null;
}

/**
 * Whether the commands after `command` run in another directory. A `cd`
 * inside a subshell or a command substitution (`(cd web && make)`,
 * `$(cd x && pwd)`) does not change the directory of the next line.
 */
function leavesDirectory(command: string, dialect: Dialect): boolean {
  const escape = ESCAPES[dialect];
  let outside = "";
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < command.length; index += 1) {
    let char = command[index];
    if (char === escape && (quote === null || quote === '"')) {
      char += command[index + 1] ?? "";
      index += 1;
    } else if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(" || (char === ")" && depth > 0)) {
      depth += char === "(" ? 1 : -1;
      continue;
    }
    if (depth === 0) outside += char;
  }
  return changesDirectory(outside);
}

/** Whether `line` closes the heredoc or here-string `text` opened. */
function bodyCloser(text: string, dialect: Dialect): ((line: string) => boolean) | null {
  if (dialect === "posix") {
    const delimiter = heredocDelimiter(text);
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
  const strip =
    dialect === "cmd"
      ? (line: string) => line
      : (line: string) => stripTrailingComment(line, dialect);
  const lines = value.split("\n").map((line) => line.replace(/\r$/, "").trim());
  const session =
    SESSION_LANGUAGES.has(language) || lines.some((line) => prompt.test(line));
  // A transcript shows `> ` before each line that continues a command.
  const unprompted = (line: string): string =>
    session ? line.replace(/^>\s?/, "") : line;

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
    // A PowerShell block comment runs from `<#` to `#>`.
    if (dialect === "powershell" && line.startsWith("<#")) {
      let closed = line.includes("#>");
      while (!closed && index < lines.length) {
        closed = lines[index].includes("#>");
        index += 1;
      }
      continue;
    }

    let text = strip(line);
    let lineEnd = lineStart;
    for (
      let continued = continuedText(text, dialect);
      continued !== null;
      continued = continuedText(text, dialect)
    ) {
      text = continued;
      if (index >= lines.length) break;
      text = `${text} ${strip(unprompted(lines[index]))}`.trim();
      lineEnd = firstLine + index;
      index += 1;
    }

    const closes = bodyCloser(text, dialect);
    if (closes !== null) {
      while (index < lines.length) {
        lineEnd = firstLine + index;
        index += 1;
        if (closes(unprompted(lines[index - 1]))) break;
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
    if (last !== undefined && leavesDirectory(last.command, dialect)) {
      last.command = `${last.command}; ${command.command}`;
      last.lineEnd = command.lineEnd;
    } else {
      grouped.push({ ...command });
    }
  }
  return grouped;
}
