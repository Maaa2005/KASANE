import { describe, expect, it } from "vitest";
import { commandsInCodeBlock } from "../../src/parsers/code-block.js";
import { parseMarkdown } from "../../src/parsers/markdown.js";

const commands = (lang: string | null, value: string) =>
  commandsInCodeBlock(lang, value, 1).map((command) => command.command);

describe("commandsInCodeBlock", () => {
  it("reads one command per line of a shell block", () => {
    expect(commandsInCodeBlock("bash", "pnpm install\npnpm test", 5)).toEqual([
      { command: "pnpm install", lineStart: 5, lineEnd: 5 },
      { command: "pnpm test", lineStart: 6, lineEnd: 6 },
    ]);
  });

  it.each(["sh", "shell", "zsh", "Bash", "powershell", "pwsh", "cmd"])(
    "reads a %s block",
    (lang) => {
      expect(commands(lang, "npm test")).toEqual(["npm test"]);
    },
  );

  it.each(["json", "ts", "yaml", "text", "diff", "python"])(
    "ignores a %s block",
    (lang) => {
      expect(commands(lang, "npm test")).toEqual([]);
    },
  );

  it("reads the language from an info string with attributes", () => {
    expect(commands('bash title="setup"', "npm test")).toEqual(["npm test"]);
    expect(commands("sh{name=setup}", "npm test")).toEqual(["npm test"]);
  });

  it("drops comment lines, blank lines and trailing comments", () => {
    expect(
      commands(
        "bash",
        "#!/usr/bin/env bash\n# install first\n\npnpm install  # once\necho \"#1\" '# no' $#",
      ),
    ).toEqual(["pnpm install", "echo \"#1\" '# no' $#"]);
  });

  it("drops REM and :: comments in a cmd block", () => {
    expect(commands("cmd", "REM setup\n:: note\nnpm test")).toEqual(["npm test"]);
  });

  it("joins lines continued with a backslash, a backtick or a caret", () => {
    expect(commandsInCodeBlock("bash", "pnpm run build \\\n  --watch\npnpm test", 1)).toEqual([
      { command: "pnpm run build --watch", lineStart: 1, lineEnd: 2 },
      { command: "pnpm test", lineStart: 3, lineEnd: 3 },
    ]);
    expect(commands("powershell", "npm run build `\n  --silent")).toEqual([
      "npm run build --silent",
    ]);
    expect(commands("cmd", "npm run build ^\n  --silent")).toEqual([
      "npm run build --silent",
    ]);
  });

  it("joins a line that ends with a pipe or a logical operator", () => {
    expect(commands("bash", "pnpm build &&\n  pnpm test")).toEqual([
      "pnpm build && pnpm test",
    ]);
  });

  it("skips the body of a heredoc", () => {
    expect(
      commandsInCodeBlock("bash", "cat <<'EOF' > .env\nnpm run nope\nEOF\nnpm test", 1),
    ).toEqual([
      { command: "cat <<'EOF' > .env", lineStart: 1, lineEnd: 3 },
      { command: "npm test", lineStart: 4, lineEnd: 4 },
    ]);
  });

  it("skips the body of a PowerShell here-string", () => {
    expect(
      commands("powershell", "$text = @\"\nnpm run nope\n\"@\nnpm test"),
    ).toEqual(['$text = @"', "npm test"]);
  });

  it("reads only prompted lines of a transcript", () => {
    expect(
      commands("console", "$ npm install\nadded 5 packages\n$ npm test\n> kasane@1 test"),
    ).toEqual(["npm install", "npm test"]);
  });

  it("treats a shell block with $ prompts as a transcript", () => {
    expect(commands("bash", "$ npm install\nup to date in 1s")).toEqual(["npm install"]);
  });

  it("strips PowerShell and cmd prompts", () => {
    expect(commands("powershell", "PS C:\\repo> npm test\nok")).toEqual(["npm test"]);
    expect(commands("cmd", "C:\\repo>npm test\nok")).toEqual(["npm test"]);
  });

  it("does not take a $VARIABLE at the start of a line for a prompt", () => {
    expect(commands("powershell", "$env:CI = 1\nnpm test")).toEqual([
      "$env:CI = 1",
      "npm test",
    ]);
  });

  it("keeps a cd and every command after it together", () => {
    expect(
      commandsInCodeBlock("bash", "pnpm install\ncd packages/web\npnpm dev\npnpm lint", 1),
    ).toEqual([
      { command: "pnpm install", lineStart: 1, lineEnd: 1 },
      { command: "cd packages/web; pnpm dev; pnpm lint", lineStart: 2, lineEnd: 4 },
    ]);
  });

  it("reads a block without an info string when every command starts with a known program", () => {
    expect(commands(null, "npm install\nFOO=1 ./scripts/setup.sh\nsudo npm i -g x")).toEqual([
      "npm install",
      "FOO=1 ./scripts/setup.sh",
      "sudo npm i -g x",
    ]);
  });

  it("ignores a block without an info string that is not all commands", () => {
    expect(commands(null, "src/\n├── index.ts\n└── cli/")).toEqual([]);
    expect(commands("", "npm install\nThen open the app.")).toEqual([]);
    expect(commands(null, "@AGENTS.md")).toEqual([]);
  });

  it("reads a block without an info string that uses $ prompts", () => {
    expect(commands(null, "$ mytool --init\ndone")).toEqual(["mytool --init"]);
  });
});

describe("parseMarkdown code blocks", () => {
  it("makes each command its own instruction, with its file line", () => {
    const result = parseMarkdown(
      "---\ndescription: x\n---\n# Setup\n\n```bash\npnpm install\npnpm test\n```\n",
    );

    expect(
      result.instructions.map(({ content, lineStart, lineEnd, inCodeBlock }) => ({
        content,
        lineStart,
        lineEnd,
        inCodeBlock,
      })),
    ).toEqual([
      { content: "`pnpm install`", lineStart: 7, lineEnd: 7, inCodeBlock: true },
      { content: "`pnpm test`", lineStart: 8, lineEnd: 8, inCodeBlock: true },
    ]);
  });

  it("reads a tilde fence and an indented code block", () => {
    const result = parseMarkdown("~~~sh\nnpm test\n~~~\n\nText:\n\n    npm run lint\n");

    expect(
      result.instructions
        .filter((instruction) => instruction.inCodeBlock)
        .map(({ content, lineStart }) => ({ content, lineStart })),
    ).toEqual([
      { content: "`npm test`", lineStart: 2 },
      { content: "`npm run lint`", lineStart: 7 },
    ]);
  });

  it("keeps a list item's code block out of the item's own text", () => {
    const result = parseMarkdown("- Run the tests:\n\n  ```bash\n  pnpm test\n  ```\n");

    expect(result.instructions.map((i) => [i.content, i.lineStart])).toEqual([
      ["Run the tests:", 1],
      ["`pnpm test`", 4],
    ]);
  });

  it("does not wrap a command that contains a backtick in a code span", () => {
    const result = parseMarkdown("```bash\necho `date`\n```\n");

    expect(result.instructions.map((i) => i.content)).toEqual(["echo `date`"]);
  });

  it("reads an unclosed fence to the end of the file", () => {
    const result = parseMarkdown("```bash\nnpm test\n");

    expect(result.instructions.map((i) => [i.content, i.lineStart])).toEqual([
      ["`npm test`", 2],
    ]);
  });
});
