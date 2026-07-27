const URL_PATTERN = /https?:\/\/\S+/g;

/**
 * Path-like tokens in running prose. A separator is required on purpose:
 * without it, ordinary words such as "Node.js" or "Next.js" would be read
 * as file names and reported as broken references.
 */
const PROSE_REFERENCE_PATTERN =
  /(?:\.{1,2}\/)?(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]+/g;

/**
 * A whole token that is a relative file path. Used for link targets and
 * inline code, where the author is pointing at a file explicitly rather
 * than writing prose, so a bare `guide.md` is unambiguous.
 */
const EXPLICIT_REFERENCE_PATTERN =
  /^(?:\.{1,2}[\\/])?(?:[\w.-]+[\\/])*[\w.-]+\.[A-Za-z0-9]+$/;

const SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const GLOB_CHARS = /[*?[\]{}()!]/;

/**
 * Extracts file-path-like tokens from instruction text, excluding URLs.
 * Used by KASANE002 (broken file reference).
 */
export function extractFileReferences(text: string): string[] {
  const withoutUrls = text.replace(URL_PATTERN, " ");
  const matches = withoutUrls.match(PROSE_REFERENCE_PATTERN) ?? [];
  return Array.from(new Set(matches));
}

function normalizeReference(raw: string): string | null {
  let value = raw.trim().replace(/^[`'"(<]+|[`'")>,.;:]+$/g, "");
  if (value.length === 0) return null;

  // Anchors, queries and mail/URL schemes are not files on disk.
  if (value.startsWith("#")) return null;
  value = value.split("#")[0].split("?")[0];
  if (value.length === 0) return null;
  if (SCHEME_PATTERN.test(value)) return null;

  // Globs describe a set of paths, not one file that must exist.
  if (GLOB_CHARS.test(value)) return null;

  value = value.replace(/\\/g, "/");
  if (value.startsWith("/")) return null;
  value = value.replace(/^\.\//, "");

  return EXPLICIT_REFERENCE_PATTERN.test(value) ? value : null;
}

/**
 * Extracts references the author wrote explicitly rather than in prose:
 * Markdown link/image targets (`[guide](docs/guide.md)`) and paths inside
 * inline code (`` `dist/index.js` ``). Prose extraction alone misses both,
 * and a Markdown link is the most common way to point at a file.
 *
 * Inline code still requires a separator, because a code span is often a
 * bare identifier ("`Node.js`") rather than a path.
 */
export function extractExplicitReferences(
  linkTargets: string[],
  codeSpans: string[],
): string[] {
  const references: string[] = [];

  for (const target of linkTargets) {
    const normalized = normalizeReference(target);
    if (normalized !== null) references.push(normalized);
  }

  for (const span of codeSpans) {
    for (const token of span.split(/\s+/)) {
      if (!token.includes("/") && !token.includes("\\")) continue;
      const normalized = normalizeReference(token);
      if (normalized !== null) references.push(normalized);
    }
  }

  return Array.from(new Set(references));
}

const UNIX_ABSOLUTE_PATTERN =
  /(?<![\w./-])\/(?:Users|home|opt|srv|mnt|var|tmp)\/[\w.\-/]+/g;
const WINDOWS_DRIVE_PATTERN = /\b[A-Za-z]:[\\/][^\s"'`)\]]+/g;
const WINDOWS_UNC_PATTERN = /\\\\[A-Za-z0-9._-]+\\[^\s"'`)\]]+/g;

/**
 * Extracts absolute filesystem paths that are unlikely to work on other
 * machines. Used by KASANE006 (absolute path).
 *
 * Covers POSIX home and system directories, Windows drive paths written
 * with either separator (`C:\src`, `C:/src`) and UNC shares.
 */
export function extractAbsolutePaths(text: string): string[] {
  const matches = [
    ...(text.match(UNIX_ABSOLUTE_PATTERN) ?? []),
    ...(text.match(WINDOWS_DRIVE_PATTERN) ?? []),
    ...(text.match(WINDOWS_UNC_PATTERN) ?? []),
  ];
  return Array.from(new Set(matches));
}
