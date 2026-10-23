/**
 * Normalizes instruction text for exact-match duplicate detection (KASANE001)
 * and for grouping instructions in `diff`.
 * See 計画書.md §7.1 for the specified normalization steps.
 *
 * The text comes from the Markdown parser, which has already dropped
 * emphasis, heading and quote markup; the only markup left is the backticks
 * it puts around inline code. Any `*`, `_`, `#` or `>` still in the text is
 * literal (`__init__.py`, `src/**`, `#123`, `a > b`), so removing them would
 * merge instructions that say different things.
 *
 * The exception is text with CJK in it. CommonMark does not parse emphasis
 * whose markers touch CJK punctuation or inline code (`**「必ず」**`,
 * `に**`pnpm test`**を`), so the markers stay in the text. There, a `*` or
 * `_` outside inline code is almost always such a marker.
 */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f]/u;

export function normalizeInstruction(text: string): string {
  let normalized = text.normalize("NFKC");
  if (CJK.test(normalized)) {
    normalized = normalized.replace(
      /(`[^`]*`)|[*_]+/g,
      (_match, code: string | undefined) => code ?? "",
    );
  }
  return normalized
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:。、]+$/u, "")
    .trim();
}
