/**
 * Normalizes instruction text for exact-match duplicate detection (KASANE001).
 * See 計画書.md §7.1 for the specified normalization steps.
 */
export function normalizeInstruction(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[*_`#>]/g, "")
    .toLowerCase()
    .replace(/[.,!?;:]+$/, "")
    .trim();
}
