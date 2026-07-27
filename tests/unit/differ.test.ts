import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildAnalysisContext, runDiagnostics } from "../../src/core/analyze.js";
import { computeDiff } from "../../src/core/differ.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(__dirname, "..", "fixtures", "diff-repo");

describe("computeDiff with three agents", () => {
  it("reports text two of three agents share instead of dropping it", async () => {
    const context = await buildAnalysisContext(fixtureRoot);
    const diagnostics = await runDiagnostics(context);

    const diff = computeDiff(context, diagnostics, {
      agents: ["codex", "claude", "gemini"],
    });

    const shared = diff.sharedBy.find((entry) =>
      entry.instruction.content.startsWith("Write tests"),
    );

    expect(shared).toBeDefined();
    expect(shared?.agents).toEqual(["codex", "claude"]);
    expect(diff.common).toEqual([]);
    expect(diff.onlyIn.gemini).toEqual([]);
  });
});

describe("computeDiff (diff-repo fixture)", () => {
  it("finds the shared instruction as common", async () => {
    const context = await buildAnalysisContext(fixtureRoot);
    const diagnostics = await runDiagnostics(context);

    const diff = computeDiff(context, diagnostics, {
      agents: ["codex", "claude"],
    });

    expect(diff.common.map((i) => i.content)).toContain(
      "Write tests for new features.",
    );
  });

  it("puts agent-specific instructions under onlyIn", async () => {
    const context = await buildAnalysisContext(fixtureRoot);
    const diagnostics = await runDiagnostics(context);

    const diff = computeDiff(context, diagnostics, {
      agents: ["codex", "claude"],
    });

    expect(diff.onlyIn.codex.map((i) => i.content)).toContain(
      "Use npm for scripts.",
    );
    expect(diff.onlyIn.claude.map((i) => i.content)).toContain(
      "Use pnpm for scripts.",
    );
    expect(diff.onlyIn.codex.map((i) => i.content)).not.toContain(
      "Write tests for new features.",
    );
  });

  it("detects a package manager conflict between agents", async () => {
    const context = await buildAnalysisContext(fixtureRoot);
    const diagnostics = await runDiagnostics(context);

    const diff = computeDiff(context, diagnostics, {
      agents: ["codex", "claude"],
    });

    expect(diff.conflicts).toHaveLength(1);
    expect(diff.conflicts[0]).toEqual({
      category: "Package manager",
      values: { codex: "npm", claude: "pnpm" },
    });
  });

  it("returns no conflict and empty onlyIn when only one agent is applicable", async () => {
    const context = await buildAnalysisContext(fixtureRoot);
    const diagnostics = await runDiagnostics(context);

    const diff = computeDiff(context, diagnostics, {
      agents: ["claude", "gemini"],
    });

    expect(diff.onlyIn.gemini).toEqual([]);
    expect(diff.conflicts).toEqual([]);
  });
});
