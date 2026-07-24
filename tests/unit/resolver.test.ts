import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildAnalysisContext, runDiagnostics } from "../../src/core/analyze.js";
import { resolveEffectiveContext } from "../../src/core/resolver.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(__dirname, "..", "fixtures", "scoped-repo");

describe("resolveEffectiveContext (scoped-repo fixture)", () => {
  it("includes root and directory-scoped CLAUDE.md for a file under src/", async () => {
    const context = await buildAnalysisContext(fixtureRoot);
    const diagnostics = await runDiagnostics(context);

    const effective = resolveEffectiveContext(context, diagnostics, {
      agent: "claude",
      targetPath: "src/auth/login.ts",
    });

    const relativePaths = effective.sources.map((s) => s.relativePath);
    expect(relativePaths).toContain("CLAUDE.md");
    expect(relativePaths).toContain(path.join("src", "CLAUDE.md"));
  });

  it("excludes the nested CLAUDE.md for a file outside src/", async () => {
    const context = await buildAnalysisContext(fixtureRoot);
    const diagnostics = await runDiagnostics(context);

    const effective = resolveEffectiveContext(context, diagnostics, {
      agent: "claude",
      targetPath: "README.md",
    });

    const relativePaths = effective.sources.map((s) => s.relativePath);
    expect(relativePaths).toContain("CLAUDE.md");
    expect(relativePaths).not.toContain(path.join("src", "CLAUDE.md"));
  });

  it("includes a cursor rule only when the target path matches its glob", async () => {
    const context = await buildAnalysisContext(fixtureRoot);
    const diagnostics = await runDiagnostics(context);

    const matching = resolveEffectiveContext(context, diagnostics, {
      agent: "cursor",
      targetPath: "src/auth/login.ts",
    });
    const nonMatching = resolveEffectiveContext(context, diagnostics, {
      agent: "cursor",
      targetPath: "README.md",
    });

    expect(matching.sources.map((s) => s.relativePath)).toContain(
      path.join(".cursor", "rules", "typescript.mdc"),
    );
    expect(nonMatching.sources).toEqual([]);
  });

  it("excludes sources that do not apply to the requested agent", async () => {
    const context = await buildAnalysisContext(fixtureRoot);
    const diagnostics = await runDiagnostics(context);

    const effective = resolveEffectiveContext(context, diagnostics, {
      agent: "gemini",
      targetPath: "src/auth/login.ts",
    });

    expect(effective.sources).toEqual([]);
  });

  it("includes all agent-applicable sources when no target path is given", async () => {
    const context = await buildAnalysisContext(fixtureRoot);
    const diagnostics = await runDiagnostics(context);

    const effective = resolveEffectiveContext(context, diagnostics, {
      agent: "claude",
    });

    const relativePaths = effective.sources.map((s) => s.relativePath);
    expect(relativePaths).toContain("CLAUDE.md");
    expect(relativePaths).toContain(path.join("src", "CLAUDE.md"));
    expect(effective.targetPath).toBeUndefined();
  });
});
