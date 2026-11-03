import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeRepository, buildAnalysisContext, runDiagnostics } from "../../src/core/analyze.js";
import { computeDiff } from "../../src/core/differ.js";
import { resolveEffectiveContext } from "../../src/core/resolver.js";
import { renderText } from "../../src/reporters/text.js";

let root: string | undefined;

afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function makeRepo(files: Record<string, string>): string {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "kasane-claude-rules-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

async function claudeInstructions(repo: string, targetPath?: string): Promise<string[]> {
  const context = await buildAnalysisContext(repo);
  const diagnostics = await runDiagnostics(context);
  return resolveEffectiveContext(context, diagnostics, {
    agent: "claude",
    targetPath,
  }).instructions.map((instruction) => instruction.content);
}

const rule = (paths: string | null, text: string): string =>
  paths === null ? `${text}\n` : `---\npaths: ${paths}\n---\n\n${text}\n`;

describe("Claude Code .claude/rules", () => {
  it("discovers every .md file under .claude/rules, recursively", async () => {
    const repo = makeRepo({
      ".claude/rules/testing.md": "- Write tests first.\n",
      ".claude/rules/frontend/react.md": "- Use function components.\n",
      ".claude/rules/notes.txt": "- Not a rule.\n",
      ".claude/rules/legacy.mdc": "- Not a rule either.\n",
    });
    const context = await buildAnalysisContext(repo);

    expect(
      context.sources.map((source) => [source.relativePath, source.sourceType, source.agents]),
    ).toEqual([
      [".claude/rules/frontend/react.md", "claude-rule", ["claude"]],
      [".claude/rules/testing.md", "claude-rule", ["claude"]],
    ]);
  });

  it("gives a rule without paths to Claude Code everywhere, like .claude/CLAUDE.md", async () => {
    const repo = makeRepo({
      "AGENTS.md": "- Write tests first.\n",
      ".claude/rules/testing.md": "- Write tests first.\n- Run pnpm test.\n",
    });
    const context = await buildAnalysisContext(repo);
    const diagnostics = await runDiagnostics(context);

    const diff = computeDiff(context, diagnostics, {
      agents: ["codex", "claude"],
      targetPath: "src/deep/file.ts",
    });

    expect(diff.common.map((i) => i.content)).toEqual(["Write tests first."]);
    expect(diff.onlyIn.claude.map((i) => i.content)).toEqual(["Run pnpm test."]);
  });

  it("gives a rule with paths only for matching files", async () => {
    const repo = makeRepo({
      ".claude/rules/api.md": rule('\n  - "src/api/**/*.ts"', "- Validate input."),
    });

    expect(await claudeInstructions(repo, "src/api/users/get.ts")).toEqual(["Validate input."]);
    expect(await claudeInstructions(repo, "src/web/page.ts")).toEqual([]);
    // A directory gets the rules that match a file under it.
    expect(await claudeInstructions(repo, "src/api/")).toEqual(["Validate input."]);
    // Without --path everything that can load is listed.
    expect(await claudeInstructions(repo)).toEqual(["Validate input."]);
  });

  it("matches a pattern without a slash at any depth and a leading slash only at the base", async () => {
    const repo = makeRepo({
      ".claude/rules/docs.md": rule('"*.md"', "- Wrap at 80 columns."),
      ".claude/rules/root.md": rule('"/*.json"', "- Keep keys sorted."),
    });

    expect(await claudeInstructions(repo, "docs/guide/intro.md")).toEqual([
      "Wrap at 80 columns.",
    ]);
    expect(await claudeInstructions(repo, "package.json")).toEqual(["Keep keys sorted."]);
    expect(await claudeInstructions(repo, "src/config.json")).toEqual([]);
  });

  it("matches dotfiles and dot-directories, as gitignore-style patterns do", async () => {
    const repo = makeRepo({
      ".claude/rules/ci.md": rule('"*.yml"', "- Pin actions by commit."),
    });

    expect(await claudeInstructions(repo, ".github/workflows/ci.yml")).toEqual([
      "Pin actions by commit.",
    ]);
  });

  it("reads the base directory of a nested rule literally", async () => {
    const repo = makeRepo({
      "app/[id]/.claude/rules/page.md": rule('"*.tsx"', "- Await params."),
    });

    expect(await claudeInstructions(repo, "app/[id]/page.tsx")).toEqual(["Await params."]);
    expect(await claudeInstructions(repo, "app/i/page.tsx")).toEqual([]);
  });

  it("checks a scoped rule's commands against the package its paths point into", async () => {
    const repo = makeRepo({
      "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
      "packages/web/package.json": JSON.stringify({ scripts: { dev: "vite" } }),
      ".claude/rules/web.md": rule('"packages/web/**"', "```bash\npnpm dev\npnpm test\npnpm nope\n```"),
    });
    const result = await analyzeRepository(repo);

    expect(
      result.diagnostics.filter((d) => d.ruleId === "KASANE003").map((d) => d.metadata?.script),
    ).toEqual(["nope"]);
  });

  it("accepts paths as a comma-separated string with brace expansion", async () => {
    const repo = makeRepo({
      ".claude/rules/ts.md": rule('"src/**/*.{ts,tsx}, lib/**/*.ts"', "- Use strict types."),
    });

    expect(await claudeInstructions(repo, "src/app.tsx")).toEqual(["Use strict types."]);
    expect(await claudeInstructions(repo, "lib/util.ts")).toEqual(["Use strict types."]);
    expect(await claudeInstructions(repo, "test/util.ts")).toEqual([]);
  });

  it("loads a rule whose frontmatter is not valid YAML as if it had no paths", async () => {
    const repo = makeRepo({
      ".claude/rules/broken.md": rule("**/*.ts", "- Always loaded."),
    });

    expect(await claudeInstructions(repo, "README.md")).toEqual(["Always loaded."]);
  });

  it("anchors a nested .claude/rules to the directory that holds its .claude", async () => {
    const repo = makeRepo({
      "packages/web/.claude/rules/web.md": "- Use the design tokens.\n",
      "packages/web/.claude/rules/tests.md": rule('"src/**/*.test.ts"', "- Use testing-library."),
    });

    expect(await claudeInstructions(repo, "packages/web/src/a.ts")).toEqual([
      "Use the design tokens.",
    ]);
    expect(await claudeInstructions(repo, "packages/web/src/a.test.ts")).toEqual([
      "Use testing-library.",
      "Use the design tokens.",
    ]);
    expect(await claudeInstructions(repo, "packages/api/src/a.ts")).toEqual([]);
    // `src/**` is relative to `packages/web`, not to the repository root.
    expect(await claudeInstructions(repo, "src/a.test.ts")).toEqual([]);
  });

  it("expands @path imports in a rule and scopes them like the rule", async () => {
    // A relative import resolves against the importing file's directory.
    const repo = makeRepo({
      "docs/api.md": "- Return problem+json errors.\n",
      ".claude/rules/api.md": rule('"src/api/**"', "@../../docs/api.md"),
    });

    expect(await claudeInstructions(repo, "src/api/x.ts")).toEqual([
      "Return problem+json errors.",
    ]);
    expect(await claudeInstructions(repo, "src/web/x.ts")).toEqual([]);
  });

  it("checks a rule like any other config file", async () => {
    const repo = makeRepo({
      "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
      ".claude/rules/testing.md": "```bash\npnpm test:unit\n```\n",
    });
    const result = await analyzeRepository(repo);

    expect(
      result.diagnostics.map((d) => [d.ruleId, d.source?.relativePath, d.source?.lineStart]),
    ).toEqual([["KASANE003", ".claude/rules/testing.md", 2]]);
    expect(renderText(result)).toContain(".claude/rules/testing.md (Claude Code rule)");
  });
});
