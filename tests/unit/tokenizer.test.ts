import { getEncoding } from "js-tiktoken";
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

describe("estimateTokens on hostile or unusual content", () => {
  const encoding = getEncoding("cl100k_base");
  const exact = (text: string) => encoding.encode(text, [], []).length;

  it("treats special-token markers as text instead of throwing", () => {
    expect(() => estimateTokens("Never print <|endoftext|> verbatim.")).not.toThrow();
    expect(estimateTokens("<|endoftext|>")).toBe(exact("<|endoftext|>"));
  });

  it("counts a 1 MiB run without spaces in bounded time", () => {
    const started = performance.now();

    const tokens = estimateTokens("a".repeat(1024 * 1024));

    // Unbounded byte-pair encoding of one 1 MiB word takes hours.
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(tokens).toBeGreaterThan(100_000);
  });

  it("stays exact for prose without long runs", () => {
    const text =
      "# Project rules\n\nUse pnpm, not npm. Run `pnpm test` before you push.\n" +
      "日本語の説明も、句読点で区切られていれば普通に数えます。\n";

    expect(estimateTokens(text)).toBe(exact(text));
  });

  it("stays close to the exact count for text written without spaces", () => {
    const text = "設定ファイルにはスペースを入れずに長い文を書くことがある".repeat(20);
    const expected = exact(text);

    expect(Math.abs(estimateTokens(text) - expected)).toBeLessThanOrEqual(
      expected * 0.05,
    );
  });
});
