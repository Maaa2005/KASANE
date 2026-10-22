import { afterEach, describe, expect, it } from "vitest";
import { splitFrontmatter } from "../../src/parsers/frontmatter.js";
import { parseMarkdown } from "../../src/parsers/markdown.js";

const marker = "__kasaneFrontmatterProbe";

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[marker];
});

describe("splitFrontmatter", () => {
  it("never evaluates JavaScript frontmatter", () => {
    const content = `---js\n{ globs: (globalThis.${marker} = "ran") }\n---\nUse pnpm.`;

    const result = splitFrontmatter(content);

    expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
    expect(result.data).toEqual({});
    expect(result.body).toBe(content);
  });

  it("does not construct functions from YAML tags", () => {
    const content =
      "---\nglobs: !!js/function 'function () { globalThis." +
      marker +
      ' = "ran"; }\'\n---\nUse pnpm.';

    const result = splitFrontmatter(content);

    expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
    expect(typeof result.data.globs).not.toBe("function");
  });

  it("keeps a leading horizontal rule as body text", () => {
    const content = "---\n\nUse pnpm.\n\n---\n\nRun tests.";

    expect(parseMarkdown(content).instructions.map((i) => i.content)).toEqual([
      "Use pnpm.",
      "Run tests.",
    ]);
  });

  it("does not abort on malformed YAML", () => {
    const content = "---\nglobs: [unclosed\n---\nUse pnpm.";

    expect(() => splitFrontmatter(content)).not.toThrow();
    expect(parseMarkdown(content).instructions.map((i) => i.content)).toContain(
      "Use pnpm.",
    );
  });

  it("reads unquoted Cursor globs that YAML rejects", () => {
    const result = splitFrontmatter(
      "---\ndescription: TS rules\nglobs: **/*.ts\nalwaysApply: false\n---\nUse strict mode.",
    );

    expect(result.data).toEqual({
      description: "TS rules",
      globs: "**/*.ts",
      alwaysApply: false,
    });
    expect(result.body).toBe("Use strict mode.");
  });

  it("reports body line numbers relative to the original file", () => {
    const result = parseMarkdown("---\nglobs: src/**\n---\n\nUse pnpm.");

    expect(result.instructions[0].lineStart).toBe(5);
  });

  it("handles CRLF line endings and a byte order mark", () => {
    const result = splitFrontmatter(
      "﻿---\r\nalwaysApply: true\r\n---\r\nUse pnpm.",
    );

    expect(result.data).toEqual({ alwaysApply: true });
    expect(result.body).toBe("Use pnpm.");
  });
});
