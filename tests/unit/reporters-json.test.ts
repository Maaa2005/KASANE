import { describe, expect, it } from "vitest";
import { renderJson } from "../../src/reporters/json.js";
import { makeSource } from "../helpers/context.js";

// Not a real credential: the shape matches the KASANE007 pattern only.
const SECRET = "sk-abcdefghijklmnop1234567890";

describe("renderJson", () => {
  const result = {
    sources: [
      makeSource({
        relativePath: "AGENTS.md",
        content: `API key: ${SECRET}\n`,
      }),
    ],
  };

  it("omits raw file content by default", () => {
    const parsed = JSON.parse(renderJson(result)) as {
      sources: Array<Record<string, unknown>>;
    };

    expect(parsed.sources[0]).not.toHaveProperty("content");
    expect(parsed.sources[0].relativePath).toBe("AGENTS.md");
  });

  it("masks secrets even when content is explicitly requested", () => {
    const output = renderJson(result, { includeContent: true });

    expect(output).not.toContain(SECRET);
    expect(output).toContain("sk-ab...890");
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("keeps instruction text, which is what the user asked to see", () => {
    const output = renderJson({
      instructions: [{ content: "Run tests before commit." }],
    });

    expect(output).toContain("Run tests before commit.");
  });
});
