import { describe, expect, it } from "vitest";
import { normalizeInstruction } from "../../src/utils/normalize.js";

describe("normalizeInstruction", () => {
  it.each([
    ["Run `npm test` before committing.", "Run npm test before committing"],
    ["  Use   PNPM!  ", "use pnpm"],
    ["テストを書く。", "テストを書く"],
    ["Ｕｓｅ　ｐｎｐｍ．", "use pnpm"],
    ["**「禁止」**です。", "「禁止」です。"],
    ["コミット前に**`pnpm test`**を実行する。", "コミット前に`pnpm test`を実行する"],
  ])("treats %j and %j as the same instruction", (a, b) => {
    expect(normalizeInstruction(a)).toBe(normalizeInstruction(b));
  });

  it.each([
    ["Edit `__init__.py` only.", "Edit init.py only."],
    ["Never edit `src/**/*.gen.ts`.", "Never edit src/.gen.ts."],
    ["Link the issue as #12.", "Link the issue as 12."],
    ["Keep `a > b` true.", "Keep a b true."],
    ["Name tests `snake_case`.", "Name tests snakecase."],
    ["`src/**` は編集しない。", "`src/` は編集しない。"],
    ["`__init__.py` だけ編集する。", "`init.py` だけ編集する。"],
  ])("keeps %j and %j apart", (a, b) => {
    expect(normalizeInstruction(a)).not.toBe(normalizeInstruction(b));
  });
});
