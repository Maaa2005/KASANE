import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildAnalysisContext, runDiagnostics } from "../../src/core/analyze.js";
import {
  resolveEffectiveContext,
  TargetPathError,
} from "../../src/core/resolver.js";

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
    expect(relativePaths).toContain("src/CLAUDE.md");
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
    expect(relativePaths).not.toContain("src/CLAUDE.md");
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
      ".cursor/rules/typescript.mdc",
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
    expect(relativePaths).toContain("src/CLAUDE.md");
    expect(effective.targetPath).toBeUndefined();
  });
});

describe("resolveEffectiveContext with a directory as the target", () => {
  async function sourcesFor(agent: "claude" | "cursor", targetPath: string) {
    const context = await buildAnalysisContext(fixtureRoot);
    const diagnostics = await runDiagnostics(context);
    return resolveEffectiveContext(context, diagnostics, { agent, targetPath })
      .sources.map((s) => s.relativePath);
  }

  it("includes the directory's own config file and glob rules for files under it", async () => {
    expect(await sourcesFor("claude", "src")).toEqual(["CLAUDE.md", "src/CLAUDE.md"]);
    expect(await sourcesFor("cursor", "src")).toEqual([".cursor/rules/typescript.mdc"]);
  });

  it("leaves out config files in subdirectories of the target", async () => {
    expect(await sourcesFor("claude", ".")).toEqual(["CLAUDE.md"]);
  });

  it("leaves out glob rules that cannot match anything under the target", async () => {
    expect(await sourcesFor("cursor", "docs")).toEqual([]);
  });

  it("treats a trailing slash as a directory that does not exist yet", async () => {
    expect(await sourcesFor("cursor", "src/new/")).toEqual([".cursor/rules/typescript.mdc"]);
    expect(await sourcesFor("cursor", "src/new")).toEqual([]);
  });

  it("rejects a path outside the repository", async () => {
    const context = await buildAnalysisContext(fixtureRoot);
    for (const targetPath of ["../x.ts", "..", path.resolve(fixtureRoot, "..", "x.ts")]) {
      expect(() =>
        resolveEffectiveContext(context, [], { agent: "claude", targetPath }),
      ).toThrow(TargetPathError);
    }
  });

  it("accepts an absolute path inside the repository", async () => {
    expect(await sourcesFor("claude", path.join(fixtureRoot, "src", "a.ts"))).toEqual([
      "CLAUDE.md",
      "src/CLAUDE.md",
    ]);
  });
});
