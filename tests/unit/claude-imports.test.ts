import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAnalysisContext, runDiagnostics } from "../../src/core/analyze.js";
import { computeDiff } from "../../src/core/differ.js";
import { resolveEffectiveContext } from "../../src/core/resolver.js";
import type { AgentType } from "../../src/core/types.js";

let root: string | undefined;
let outside: string | undefined;

afterEach(() => {
  for (const dir of [root, outside]) {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
  root = undefined;
  outside = undefined;
});

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const file = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

function makeRepo(files: Record<string, string>): string {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "kasane-claude-imports-"));
  writeFiles(root, files);
  return root;
}

async function diff(repo: string, agents: AgentType[], targetPath?: string) {
  const context = await buildAnalysisContext(repo);
  const diagnostics = await runDiagnostics(context);
  const result = computeDiff(context, diagnostics, { agents, targetPath });
  const texts = (list: Array<{ content: string }>) =>
    list.map((instruction) => instruction.content);
  return {
    common: texts(result.common),
    onlyIn: Object.fromEntries(
      agents.map((agent) => [agent, texts(result.onlyIn[agent])]),
    ),
  };
}

async function claudeContext(repo: string, targetPath?: string) {
  const context = await buildAnalysisContext(repo);
  const diagnostics = await runDiagnostics(context);
  const effective = resolveEffectiveContext(context, diagnostics, {
    agent: "claude",
    targetPath,
  });
  return {
    sources: effective.sources.map((source) => source.relativePath),
    instructions: effective.instructions.map((instruction) => instruction.content),
  };
}

const AGENTS_MD = "- Use pnpm.\n- Write tests for new features.\n";

describe("Claude Code @path imports", () => {
  it("compares an AGENTS.md imported by CLAUDE.md as context both agents share", async () => {
    const repo = makeRepo({ "AGENTS.md": AGENTS_MD, "CLAUDE.md": "@AGENTS.md\n" });

    expect(await diff(repo, ["codex", "claude"])).toEqual({
      common: ["Use pnpm.", "Write tests for new features."],
      onlyIn: { codex: [], claude: [] },
    });
  });

  it("lists both the importing and the imported file as Claude's sources", async () => {
    const repo = makeRepo({ "AGENTS.md": AGENTS_MD, "CLAUDE.md": "@AGENTS.md\n" });

    const { sources } = await claudeContext(repo);
    expect(sources).toEqual(["AGENTS.md", "CLAUDE.md"]);
  });

  it("keeps every importing file in Claude's sources when two import the same file", async () => {
    const repo = makeRepo({
      "AGENTS.md": AGENTS_MD,
      "CLAUDE.md": "@AGENTS.md\n",
      "CLAUDE.local.md": "@AGENTS.md\n",
    });

    const { sources } = await claudeContext(repo);
    expect(sources).toEqual(["AGENTS.md", "CLAUDE.local.md", "CLAUDE.md"]);
  });

  it("lists a file that only passes an import on as one of Claude's sources", async () => {
    const repo = makeRepo({
      "CLAUDE.md": "@hub.md\n",
      "hub.md": "@real.md\n",
      "real.md": "- Real.\n",
    });

    const { sources } = await claudeContext(repo);
    expect(sources).toEqual(["CLAUDE.md", "hub.md", "real.md"]);
  });

  it("keeps Claude-specific instructions below the import as Claude only", async () => {
    const repo = makeRepo({
      "AGENTS.md": AGENTS_MD,
      "CLAUDE.md": "@AGENTS.md\n\n## Claude Code\n\n- Use plan mode for billing changes.\n",
    });

    expect(await diff(repo, ["codex", "claude"])).toEqual({
      common: ["Use pnpm.", "Write tests for new features."],
      onlyIn: { codex: [], claude: ["Use plan mode for billing changes."] },
    });
  });

  it("expands an import written in the middle of an instruction", async () => {
    const repo = makeRepo({
      "docs/git.md": "- Squash before merging.\n",
      "CLAUDE.md": "- git workflow @docs/git.md\n",
    });

    const { instructions } = await claudeContext(repo);
    expect(instructions).toEqual(["git workflow @docs/git.md", "Squash before merging."]);
  });

  it("does not import a path inside a code span or a fenced code block", async () => {
    const repo = makeRepo({
      "AGENTS.md": AGENTS_MD,
      "CLAUDE.md": "- Mention `@AGENTS.md` without importing it.\n\n```\n@AGENTS.md\n```\n",
    });

    const { instructions } = await claudeContext(repo);
    expect(instructions).toEqual(["Mention `@AGENTS.md` without importing it."]);
  });

  it("does not import a quoted path", async () => {
    const repo = makeRepo({
      "AGENTS.md": AGENTS_MD,
      "CLAUDE.md": '@AGENTS.md @"AGENTS.md"\n',
    });

    const { instructions } = await claudeContext(repo);
    expect(instructions).toEqual([
      '@AGENTS.md @"AGENTS.md"',
      "Use pnpm.",
      "Write tests for new features.",
    ]);
  });

  it("does not treat an e-mail address as an import", async () => {
    const repo = makeRepo({
      "AGENTS.md": AGENTS_MD,
      "CLAUDE.md": "- Ask ops@AGENTS.md for access.\n",
    });

    const { instructions } = await claudeContext(repo);
    expect(instructions).toEqual(["Ask ops@AGENTS.md for access."]);
  });

  it("resolves a relative import against the importing file, not the root", async () => {
    const repo = makeRepo({
      "AGENTS.md": AGENTS_MD,
      ".claude/CLAUDE.md": "@AGENTS.md\n",
      ".claude/AGENTS.md": "- Only for Claude.\n",
    });

    const { instructions } = await claudeContext(repo);
    expect(instructions).toEqual(["Only for Claude."]);
  });

  it("scopes imported instructions like the CLAUDE.md that imports them", async () => {
    const repo = makeRepo({
      "src/CLAUDE.md": "@conventions.md\n",
      "src/conventions.md": "- Prefer named exports.\n",
    });

    expect((await claudeContext(repo, "README.md")).instructions).toEqual([]);
    expect((await claudeContext(repo, "src/app.ts")).instructions).toEqual([
      "Prefer named exports.",
    ]);
  });

  it("follows imports recursively up to four hops", async () => {
    const repo = makeRepo({
      "CLAUDE.md": "@docs/1.md\n",
      "docs/1.md": "- One.\n\n@2.md\n",
      "docs/2.md": "- Two.\n\n@3.md\n",
      "docs/3.md": "- Three.\n\n@4.md\n",
      "docs/4.md": "- Four.\n\n@5.md\n",
      "docs/5.md": "- Five.\n",
    });

    const { instructions } = await claudeContext(repo);
    expect(instructions).toEqual(["One.", "Two.", "Three.", "Four.", "@5.md"]);
  });

  it("stops on an import cycle", async () => {
    const repo = makeRepo({
      "CLAUDE.md": "@a.md\n",
      "a.md": "- A.\n\n@b.md\n",
      "b.md": "- B.\n\n@a.md\n",
    });

    const { instructions } = await claudeContext(repo);
    expect(instructions).toEqual(["A.", "B."]);
  });

  it("follows a backslash-escaped space in the path", async () => {
    const repo = makeRepo({
      "Design Docs/api.md": "- Version every endpoint.\n",
      "CLAUDE.md": "- API conventions @Design\\ Docs/api.md\n",
    });

    const { instructions } = await claudeContext(repo);
    expect(instructions).toContain("Version every endpoint.");
  });

  it("never reads an import outside the repository", async () => {
    outside = fs.mkdtempSync(path.join(os.tmpdir(), "kasane-claude-outside-"));
    writeFiles(outside, { "secret.md": "- Outside instruction.\n" });
    const absolute = path.join(outside, "secret.md").split(path.sep).join("/");
    const repo = makeRepo({
      "CLAUDE.md": `@${absolute}\n\n@../${path.basename(outside)}/secret.md\n\n@~/secret.md\n`,
    });

    const { instructions } = await claudeContext(repo);
    expect(instructions.join("\n")).not.toContain("Outside instruction.");
    // An import that cannot be followed stays visible as Claude-only text.
    expect(instructions).toContain("@~/secret.md");
  });

  it("does not expand a file that is not Markdown or plain text", async () => {
    const repo = makeRepo({
      "package.json": '{ "scripts": { "test": "vitest" } }\n',
      "CLAUDE.md": "@package.json\n",
    });

    const { instructions } = await claudeContext(repo);
    expect(instructions).toEqual(["@package.json"]);
  });

  it("never reads git metadata, dependencies or other extension-less files", async () => {
    const repo = makeRepo({
      ".git/config": "[remote]\n\turl = https://alice:hunter2pass@example.com/x.git\n",
      "node_modules/pkg/README.md": "- From a dependency.\n",
      "LICENSE": "Permission is hereby granted.\n",
      "README": "- Read the overview.\n",
      "CLAUDE.md": "@.git/config\n\n@node_modules/pkg/README.md\n\n@LICENSE\n\n@README\n",
    });

    const { instructions } = await claudeContext(repo);
    expect(instructions).toEqual([
      "@.git/config",
      "@node_modules/pkg/README.md",
      "@LICENSE",
      "Read the overview.",
    ]);
  });

  it("blocks git metadata and dependencies in any letter case", async () => {
    // Windows and macOS file systems reach `.git/` through `.GIT/` as well.
    const repo = makeRepo({
      ".GIT/notes.txt": "- From git metadata.\n",
      "NODE_MODULES/pkg/README.md": "- From a dependency.\n",
      "CLAUDE.md": "@.GIT/notes.txt\n\n@NODE_MODULES/pkg/README.md\n",
    });

    const { instructions } = await claudeContext(repo);
    expect(instructions).toEqual(["@.GIT/notes.txt", "@NODE_MODULES/pkg/README.md"]);
  });

  it("marks an imported file that is not a config file as an import", async () => {
    const repo = makeRepo({
      "docs/git.md": "- Squash before merging.\n",
      "CLAUDE.md": "@docs/git.md\n",
    });

    const context = await buildAnalysisContext(repo);
    expect(
      context.importedSources?.map((source) => [source.relativePath, source.sourceType]),
    ).toEqual([["docs/git.md", "import"]]);
  });

  it("does not expand imports for agents other than Claude Code", async () => {
    const repo = makeRepo({
      "AGENTS.md": "@docs/extra.md\n",
      "docs/extra.md": "- Extra.\n",
    });

    expect(await diff(repo, ["codex", "claude"])).toEqual({
      common: [],
      onlyIn: { codex: ["@docs/extra.md"], claude: [] },
    });
  });

  it("lints an imported config file once, under its own path", async () => {
    const repo = makeRepo({
      "AGENTS.md": "- See docs/missing.md first.\n- Write tests.\n",
      "CLAUDE.md": "@AGENTS.md\n\n- Write tests.\n",
    });

    const context = await buildAnalysisContext(repo);
    const diagnostics = await runDiagnostics(context);
    const broken = diagnostics.filter((d) => d.ruleId === "KASANE002");
    expect(broken.map((d) => d.source?.relativePath)).toEqual(["AGENTS.md"]);
    const duplicates = diagnostics.filter((d) => d.ruleId === "KASANE001");
    expect(duplicates).toHaveLength(1);
  });
});
