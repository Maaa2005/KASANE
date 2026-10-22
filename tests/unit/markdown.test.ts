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

  it.each([
    ["full", "See [the guide][g] first.\n\n[g]: docs/guide.md"],
    ["collapsed", "See [guide][] first.\n\n[guide]: docs/guide.md"],
    ["shortcut", "See [guide] first.\n\n[guide]: docs/guide.md"],
    ["case-insensitive", "See [the guide][G  Uide] first.\n\n[g uide]: docs/guide.md"],
    ["image", "See ![diagram][d] here.\n\n[d]: docs/guide.md"],
  ])("collects the target of a reference-style link (%s)", (_kind, source) => {
    const result = parseMarkdown(source);

    expect(result.instructions[0].linkTargets).toEqual(["docs/guide.md"]);
  });

  it("uses the first definition of a repeated label", () => {
    const result = parseMarkdown(
      "See [guide][g].\n\n[g]: docs/first.md\n[g]: docs/second.md",
    );

    expect(result.instructions[0].linkTargets).toEqual(["docs/first.md"]);
  });

  it("collects inline code spans", () => {
    const result = parseMarkdown("Run `node dist/index.js` to check.");

    expect(result.instructions[0].codeSpans).toEqual(["node dist/index.js"]);
  });
});

describe("parseMarkdown instruction text", () => {
  it("does not add spaces around inline code, emphasis or links", () => {
    const result = parseMarkdown(
      "- Do not use `npm`; use **pnpm**.\n- See [the guide](docs/guide.md), then *run* it.",
    );

    expect(result.instructions.map((i) => i.content)).toEqual([
      "Do not use `npm`; use pnpm.",
      "See the guide, then run it.",
    ]);
  });

  it("keeps a word split by emphasis as one word", () => {
    const result = parseMarkdown("Run **pnpm**`test`, never un*safe* scripts.");

    expect(result.instructions[0].content).toBe("Run pnpm`test`, never unsafe scripts.");
  });

  it("separates lines joined by a hard break and a list item's paragraphs", () => {
    const result = parseMarkdown("- First line  \n  second line\n\n  Second paragraph.\n");

    expect(result.instructions[0].content).toBe("First line second line Second paragraph.");
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
