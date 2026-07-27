import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeRepository } from "../../src/core/analyze.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(__dirname, "..", "fixtures", "basic-repo");

describe("analyzeRepository (basic-repo fixture)", () => {
  it("detects AGENTS.md, CLAUDE.md, and cursor rules", async () => {
    const result = await analyzeRepository(fixtureRoot);

    const relativePaths = result.sources.map((source) => source.relativePath);
    expect(relativePaths).toContain("AGENTS.md");
    expect(relativePaths).toContain("CLAUDE.md");
    expect(relativePaths).toContain(".cursor/rules/typescript.mdc");
  });

  it("excludes files inside node_modules", async () => {
    const result = await analyzeRepository(fixtureRoot);

    const relativePaths = result.sources.map((source) => source.relativePath);
    expect(
      relativePaths.some((p) => p.includes("node_modules")),
    ).toBe(false);
  });

  it("reports a positive estimated token count and instruction count", async () => {
    const result = await analyzeRepository(fixtureRoot);

    expect(result.summary.sourceCount).toBe(result.sources.length);
    expect(result.summary.estimatedTokens).toBeGreaterThan(0);
    expect(result.summary.instructionCount).toBeGreaterThan(0);
  });

  it("returns no diagnostics for a clean repository", async () => {
    const result = await analyzeRepository(fixtureRoot);

    expect(result.diagnostics).toEqual([]);
    expect(result.summary.diagnosticCount).toEqual({
      info: 0,
      warning: 0,
      error: 0,
    });
  });
});
