import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAnalysisContext, runDiagnostics } from "../../src/core/analyze.js";
import { computeDiff } from "../../src/core/differ.js";

let root: string | undefined;

afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function makeRepo(files: Record<string, string>): string {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "kasane-code-blocks-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

async function analyze(repo: string) {
  const context = await buildAnalysisContext(repo);
  const diagnostics = await runDiagnostics(context);
  return { context, diagnostics };
}

const PACKAGE_JSON = JSON.stringify({ scripts: { build: "tsup", test: "vitest" } });

describe("commands in code blocks", () => {
  it("compares the commands of two agents' code blocks", async () => {
    const repo = makeRepo({
      "AGENTS.md": "# Commands\n\n```bash\npnpm install\npnpm test\n```\n",
      "CLAUDE.md": "# Commands\n\n```bash\nnpm install\npnpm test\n```\n",
    });
    const { context, diagnostics } = await analyze(repo);

    const diff = computeDiff(context, diagnostics, { agents: ["codex", "claude"] });

    expect(diff.common.map((i) => i.content)).toEqual(["`pnpm test`"]);
    expect(diff.onlyIn.codex.map((i) => i.content)).toEqual(["`pnpm install`"]);
    expect(diff.onlyIn.claude.map((i) => i.content)).toEqual(["`npm install`"]);
  });

  it("reports a package manager conflict that is only in code blocks", async () => {
    const repo = makeRepo({
      "AGENTS.md": "```sh\npnpm install\npnpm test\n```\n",
      "CLAUDE.md": "```sh\nnpm install\nnpm test\n```\n",
    });
    const { context, diagnostics } = await analyze(repo);

    const diff = computeDiff(context, diagnostics, { agents: ["codex", "claude"] });

    expect(diff.conflicts).toEqual([
      { category: "Package manager", values: { codex: "pnpm", claude: "npm" } },
    ]);
  });

  it("matches a command in a code block with the same command in a list item", async () => {
    const repo = makeRepo({
      "AGENTS.md": "- `pnpm test`\n",
      "CLAUDE.md": "```bash\npnpm test\n```\n",
    });
    const { context, diagnostics } = await analyze(repo);

    const diff = computeDiff(context, diagnostics, { agents: ["codex", "claude"] });

    expect(diff.common).toHaveLength(1);
    expect(diff.onlyIn).toEqual({ codex: [], claude: [] });
  });

  it("flags a missing script in a code block at its line (KASANE003)", async () => {
    const repo = makeRepo({
      "package.json": PACKAGE_JSON,
      "AGENTS.md": "# Commands\n\n```bash\npnpm build\npnpm lint\nnpm run typecheck\n```\n",
    });
    const { diagnostics } = await analyze(repo);

    expect(
      diagnostics
        .filter((d) => d.ruleId === "KASANE003")
        .map((d) => [d.metadata?.script, d.source?.lineStart]),
    ).toEqual([
      ["lint", 5],
      ["typecheck", 6],
    ]);
  });

  it("checks a command that contains backticks of its own", async () => {
    const repo = makeRepo({
      "package.json": PACKAGE_JSON,
      "AGENTS.md": "```sh\necho `date`; pnpm lint\n```\n",
    });
    const { diagnostics } = await analyze(repo);

    expect(
      diagnostics.filter((d) => d.ruleId === "KASANE003").map((d) => d.metadata?.script),
    ).toEqual(["lint"]);
  });

  it("does not check the commands after a cd against the root package.json", async () => {
    const repo = makeRepo({
      "package.json": PACKAGE_JSON,
      "AGENTS.md": "```bash\ncd packages/web\npnpm dev\nnpm run preview\n```\n",
    });
    const { diagnostics } = await analyze(repo);

    expect(diagnostics.filter((d) => d.ruleId === "KASANE003")).toEqual([]);
  });

  it("does not take transcript output for commands", async () => {
    const repo = makeRepo({
      "package.json": PACKAGE_JSON,
      "AGENTS.md": "```console\n$ npm test\n> npm run lint\nok\n```\n",
    });
    const { diagnostics } = await analyze(repo);

    expect(diagnostics.filter((d) => d.ruleId === "KASANE003")).toEqual([]);
  });

  it("warns about a package manager in a code block that the lockfile contradicts (KASANE004)", async () => {
    const repo = makeRepo({
      "package.json": PACKAGE_JSON,
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "AGENTS.md": "```bash\nyarn install\n```\n",
    });
    const { diagnostics } = await analyze(repo);

    expect(
      diagnostics
        .filter((d) => d.ruleId === "KASANE004")
        .map((d) => [d.metadata?.mentioned, d.source?.lineStart]),
    ).toEqual([["yarn", 2]]);
  });

  it("does not report files a command creates as broken references", async () => {
    const repo = makeRepo({
      "AGENTS.md": "```bash\ncp config/example.json config/local.json\n```\n",
    });
    const { diagnostics } = await analyze(repo);

    expect(diagnostics.filter((d) => d.ruleId === "KASANE002")).toEqual([]);
  });

  it("ignores commands in code blocks that are not shell", async () => {
    const repo = makeRepo({
      "package.json": PACKAGE_JSON,
      "AGENTS.md": '```json\n{ "scripts": { "x": "npm run nope" } }\n```\n',
    });
    const { context, diagnostics } = await analyze(repo);

    expect(context.instructions).toEqual([]);
    expect(diagnostics.filter((d) => d.ruleId === "KASANE003")).toEqual([]);
  });
});
