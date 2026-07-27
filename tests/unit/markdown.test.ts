import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../../src/parsers/markdown.js";

describe("parseMarkdown nested lists and links", () => {
  it("does not fold a child list item's text into its parent", () => {
    const result = parseMarkdown("- Parent item\n  - Child item");

    expect(result.instructions.map((i) => i.content)).toEqual([
      "Parent item",
      "Child item",
    ]);
  });

  it("collects Markdown link targets", () => {
    const result = parseMarkdown("See [the guide](docs/guide.md) first.");

    expect(result.instructions[0].linkTargets).toEqual(["docs/guide.md"]);
  });

  it("collects inline code spans", () => {
    const result = parseMarkdown("Run `node dist/index.js` to check.");

    expect(result.instructions[0].codeSpans).toEqual(["node dist/index.js"]);
  });
});

describe("parseMarkdown", () => {
  it("counts paragraphs as instructions", () => {
    const result = parseMarkdown("First paragraph.\n\nSecond paragraph.");
    expect(result.instructions).toHaveLength(2);
  });

  it("counts list items as instructions", () => {
    const result = parseMarkdown("- Use pnpm\n- Run tests before commit");
    expect(result.instructions).toHaveLength(2);
    expect(result.instructions.map((i) => i.content)).toEqual([
      "Use pnpm",
      "Run tests before commit",
    ]);
  });

  it("extracts frontmatter separately from body", () => {
    const result = parseMarkdown(
      "---\nglobs:\n  - \"src/**/*.ts\"\n---\nUse TypeScript strictly.",
    );
    expect(result.frontmatter.globs).toEqual(["src/**/*.ts"]);
    expect(result.body).toContain("Use TypeScript strictly.");
  });
});
