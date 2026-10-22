import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAnalysisContext, runDiagnostics } from "../../src/core/analyze.js";
import { computeDiff } from "../../src/core/differ.js";
import { resolveEffectiveContext } from "../../src/core/resolver.js";
import type { AgentType } from "../../src/core/types.js";

let root: string | undefined;

afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function makeRepo(files: Record<string, string>): string {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "kasane-agent-scope-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

async function sourcesFor(repo: string, agent: AgentType, targetPath?: string) {
  const context = await buildAnalysisContext(repo);
  const diagnostics = await runDiagnostics(context);
  const effective = resolveEffectiveContext(context, diagnostics, {
    agent,
    targetPath,
  });
  return effective.sources.map((source) => source.relativePath);
}

describe("Cursor rule types", () => {
  it("ignores the globs of an alwaysApply rule", async () => {
    const repo = makeRepo({
      ".cursor/rules/always.mdc":
        "---\nalwaysApply: true\nglobs: src/**\n---\n- Use pnpm.\n",
    });

    expect(await sourcesFor(repo, "cursor", "README.md")).toContain(
      ".cursor/rules/always.mdc",
    );
  });

  it("keeps brace alternatives in a comma-separated globs string intact", async () => {
    const repo = makeRepo({
      ".cursor/rules/react.mdc": '---\nglobs: "src/**/*.{ts,tsx}"\n---\n- Use hooks.\n',
    });

    expect(await sourcesFor(repo, "cursor", "src/app.tsx")).toContain(
      ".cursor/rules/react.mdc",
    );
  });

  it("leaves out a manual rule but still scans it for secrets", async () => {
    const repo = makeRepo({
      ".cursor/rules/manual.mdc": `---\nalwaysApply: false\n---\n- Token ${"sk-"}abcdefghijklmnop1234567890\n`,
    });

    expect(await sourcesFor(repo, "cursor", "src/index.ts")).not.toContain(
      ".cursor/rules/manual.mdc",
    );

    const context = await buildAnalysisContext(repo);
    const diagnostics = await runDiagnostics(context);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.ruleId === "KASANE007" &&
          diagnostic.source?.relativePath === ".cursor/rules/manual.mdc",
      ),
    ).toBe(true);
  });

  it("applies an agent-requested rule that has only a description", async () => {
    const repo = makeRepo({
      ".cursor/rules/db.mdc": "---\ndescription: Database migrations\n---\n- Never edit applied migrations.\n",
    });

    expect(await sourcesFor(repo, "cursor", "src/index.ts")).toContain(
      ".cursor/rules/db.mdc",
    );
  });

  it("does not treat a plain .md file in .cursor/rules as a rule", async () => {
    const repo = makeRepo({
      ".cursor/rules/notes.md": "- Use pnpm.\n",
    });

    expect(await sourcesFor(repo, "cursor")).not.toContain(".cursor/rules/notes.md");
  });

  it("still applies .cursorrules", async () => {
    const repo = makeRepo({ ".cursorrules": "- Use pnpm.\n" });

    expect(await sourcesFor(repo, "cursor", "src/index.ts")).toContain(".cursorrules");
  });
});

describe("files under .github and .claude", () => {
  it("applies the root Copilot instructions to files elsewhere in the repository", async () => {
    const repo = makeRepo({ ".github/copilot-instructions.md": "- Use pnpm.\n" });

    expect(await sourcesFor(repo, "copilot", "src/x.ts")).toContain(
      ".github/copilot-instructions.md",
    );
  });

  it("does not apply Copilot instructions from a nested .github directory", async () => {
    const repo = makeRepo({ "pkg/.github/copilot-instructions.md": "- Use pnpm.\n" });

    expect(await sourcesFor(repo, "copilot", "pkg/src/x.ts")).not.toContain(
      "pkg/.github/copilot-instructions.md",
    );
  });

  it("applies .claude/CLAUDE.md to files elsewhere in the repository", async () => {
    const repo = makeRepo({ ".claude/CLAUDE.md": "- Use pnpm.\n" });

    expect(await sourcesFor(repo, "claude", "src/x.ts")).toContain(".claude/CLAUDE.md");
  });
});

describe("AGENTS.md", () => {
  it("is part of both Codex's and Cursor's context", async () => {
    const repo = makeRepo({ "AGENTS.md": "- Use pnpm for every install.\n" });
    const context = await buildAnalysisContext(repo);
    const diagnostics = await runDiagnostics(context);

    const diff = computeDiff(context, diagnostics, { agents: ["codex", "cursor"] });

    expect(diff.common.map((instruction) => instruction.content)).toEqual([
      "Use pnpm for every install.",
    ]);
  });
});
