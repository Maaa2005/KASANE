import { describe, expect, it } from "vitest";
import {
  extractExplicitReferences,
  extractFileReferences,
} from "../../src/utils/path.js";

describe("extractFileReferences", () => {
  it("finds a genuinely missing relative path", () => {
    expect(extractFileReferences("read docs/missing.md first")).toEqual([
      "docs/missing.md",
    ]);
  });

  it("finds ./ and ../ prefixed paths", () => {
    expect(extractFileReferences("see ./docs/a.md and ../b/c.md")).toEqual([
      "./docs/a.md",
      "../b/c.md",
    ]);
  });

  it("ignores home-relative paths", () => {
    expect(extractFileReferences("`~/.claude-sync/CLAUDE.md`")).toEqual([]);
    expect(extractFileReferences("~/.claude-sync/CLAUDE.md")).toEqual([]);
  });

  it("ignores absolute paths", () => {
    expect(extractFileReferences("/root/.claude/CLAUDE.md")).toEqual([]);
    expect(extractFileReferences("@/home/user/x/y.md")).toEqual([]);
  });

  it("ignores template placeholders", () => {
    expect(extractFileReferences("Decisions/YYYY-MM-DD-topic.md")).toEqual([]);
    expect(extractFileReferences("journal/yyyy/mm/yyyy-mm-dd.md")).toEqual([]);
    expect(extractFileReferences("docs/decisions/ADR-XXXX.md")).toEqual([]);
    expect(extractFileReferences("docs/xxx/a.md")).toEqual([]);
  });

  it("does not treat x runs inside words as placeholders", () => {
    expect(extractFileReferences("docs/max.md")).toEqual(["docs/max.md"]);
    expect(extractFileReferences("docs/boxxx/a.md")).toEqual([
      "docs/boxxx/a.md",
    ]);
  });

  it("keeps ignoring bare names and URLs", () => {
    expect(extractFileReferences("Use Node.js and Next.js")).toEqual([]);
    expect(extractFileReferences("see https://example.com/a/b.md")).toEqual([]);
  });
});

describe("extractExplicitReferences", () => {
  it("finds a missing path in a link target and inline code", () => {
    expect(extractExplicitReferences(["docs/missing.md"], [])).toEqual([
      "docs/missing.md",
    ]);
    expect(extractExplicitReferences([], ["docs/missing.md"])).toEqual([
      "docs/missing.md",
    ]);
  });

  it("ignores home and absolute paths", () => {
    expect(
      extractExplicitReferences(
        ["~/.claude-sync/docs/x.md", "/root/.claude/CLAUDE.md"],
        ["~/.claude-sync/docs/x.md", "/home/user/x/y.md"],
      ),
    ).toEqual([]);
  });

  it("ignores template placeholders", () => {
    expect(
      extractExplicitReferences(
        ["Decisions/YYYY-MM-DD-topic.md", "docs/decisions/ADR-XXXX.md"],
        ["journal/yyyy/mm/yyyy-mm-dd.md"],
      ),
    ).toEqual([]);
  });

  it("keeps globs and bare code identifiers ignored", () => {
    expect(extractExplicitReferences(["docs/*.md"], ["Node.js"])).toEqual([]);
  });
});
