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

  it("closes a heredoc in a transcript, where its lines start with >", () => {
    expect(
      commands("console", "$ cat <<EOF > a.txt\n> hello\n> EOF\n$ npm run lint"),
    ).toEqual(["cat <<EOF > a.txt", "npm run lint"]);
  });

  it("does not take << in arithmetic or in a string for a heredoc", () => {
    expect(commands("bash", "x=$((1<<n))\nnpm run lint")).toEqual([
      "x=$((1<<n))",
      "npm run lint",
    ]);
    expect(commands("bash", 'git commit -m "explain <<EOF usage"\nnpm test')).toEqual([
      'git commit -m "explain <<EOF usage"',
      "npm test",
    ]);
  });

  it("does not take a redirect in a cmd block for a prompt", () => {
    expect(commands("cmd", "C:\\tools\\gen.exe > out.txt\nnpm run lint")).toEqual([
      "C:\\tools\\gen.exe > out.txt",
      "npm run lint",
    ]);
  });

  it("reads PowerShell strings and block comments by PowerShell's rules", () => {
    expect(commands("powershell", 'echo "C:\\x\\" # npm run nope')).toEqual([
      'echo "C:\\x\\"',
    ]);
    expect(commands("powershell", "<#\nnpm run nope\n#>\nnpm test")).toEqual(["npm test"]);
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

  it("does not keep commands together after a cd in a subshell", () => {
    expect(
      commands("bash", "(cd web && pnpm build)\npnpm test\nx=$(cd lib && pwd)\npnpm lint"),
    ).toEqual(["(cd web && pnpm build)", "pnpm test", "x=$(cd lib && pwd)", "pnpm lint"]);
    expect(commands("bash", 'cd "my app"\npnpm dev')).toEqual(['cd "my app"; pnpm dev']);
  });

  it("does not continue a line that ends with an escaped backslash", () => {
    expect(commands("bash", "echo C:\\\\\npnpm test")).toEqual(["echo C:\\\\", "pnpm test"]);
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
      result.instructions.map(({ content, lineStart, lineEnd, command }) => ({
        content,
        lineStart,
        lineEnd,
        command,
      })),
    ).toEqual([
      { content: "`pnpm install`", lineStart: 7, lineEnd: 7, command: "pnpm install" },
      { content: "`pnpm test`", lineStart: 8, lineEnd: 8, command: "pnpm test" },
    ]);
  });

  it("reads a tilde fence and an indented code block", () => {
    const result = parseMarkdown("~~~sh\nnpm test\n~~~\n\nText:\n\n    npm run lint\n");

    expect(
      result.instructions
        .filter((instruction) => instruction.command !== undefined)
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

  it("keeps a code block without commands in a list item's text", () => {
    const result = parseMarkdown('- @AGENTS.md\n\n  ```json\n  { "a": 1 }\n  ```\n');

    expect(result.instructions.map((i) => [i.content, i.importsOnly])).toEqual([
      ['@AGENTS.md { "a": 1 }', false],
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
