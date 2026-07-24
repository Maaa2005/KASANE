import { describe, expect, it } from "vitest";
import { estimateTokens } from "../../src/core/tokenizer.js";

describe("estimateTokens", () => {
  it("returns 0 for empty content", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns a positive count for non-empty content", () => {
    expect(estimateTokens("Hello world, this is a test.")).toBeGreaterThan(0);
  });

  it("returns a larger count for longer content", () => {
    const short = estimateTokens("Hello");
    const long = estimateTokens("Hello ".repeat(50));
    expect(long).toBeGreaterThan(short);
  });
});
