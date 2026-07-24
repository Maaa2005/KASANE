import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../../src/parsers/markdown.js";

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
