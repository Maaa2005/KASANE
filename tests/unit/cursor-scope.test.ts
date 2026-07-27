import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildAnalysisContext, runDiagnostics } from "../../src/core/analyze.js";
import { resolveEffectiveContext } from "../../src/core/resolver.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(__dirname, "..", "fixtures", "cursor-nested");

async function resolveFor(targetPath: string) {
  const context = await buildAnalysisContext(fixtureRoot);
  const diagnostics = await runDiagnostics(context);
  return resolveEffectiveContext(context, diagnostics, {
    agent: "cursor",
    targetPath,
  });
}

describe("Cursor rule scoping", () => {
  it("discovers rules from a nested .cursor/rules directory", async () => {
    const context = await buildAnalysisContext(fixtureRoot);

    expect(context.sources.map((source) => source.relativePath)).toContain(
      "backend/.cursor/rules/nested.mdc",
    );
  });

  it("applies a rule whose globs frontmatter is a single string", async () => {
    const effective = await resolveFor("src/index.ts");

    expect(effective.sources.map((source) => source.relativePath)).toContain(
      ".cursor/rules/scalar.mdc",
    );
  });

  it("applies an alwaysApply rule to a file its globs would not match", async () => {
    const effective = await resolveFor("README.md");

    expect(effective.sources.map((source) => source.relativePath)).toContain(
      ".cursor/rules/always.mdc",
    );
    expect(effective.sources.map((source) => source.relativePath)).not.toContain(
      ".cursor/rules/scalar.mdc",
    );
  });

  it("anchors a nested rule's globs to the subtree that owns it", async () => {
    const inside = await resolveFor("backend/app.py");
    const outside = await resolveFor("frontend/app.py");

    expect(inside.sources.map((source) => source.relativePath)).toContain(
      "backend/.cursor/rules/nested.mdc",
    );
    expect(outside.sources.map((source) => source.relativePath)).not.toContain(
      "backend/.cursor/rules/nested.mdc",
    );
  });
});
