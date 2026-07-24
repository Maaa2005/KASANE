const URL_PATTERN = /https?:\/\/\S+/g;
const REFERENCE_PATTERN =
  /(?:\.{1,2}\/)?(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]+/g;

/**
 * Extracts file-path-like tokens from instruction text, excluding URLs.
 * Used by KASANE002 (broken file reference).
 */
export function extractFileReferences(text: string): string[] {
  const withoutUrls = text.replace(URL_PATTERN, " ");
  const matches = withoutUrls.match(REFERENCE_PATTERN) ?? [];
  return Array.from(new Set(matches));
}

const UNIX_ABSOLUTE_PATTERN = /\/(?:Users|home)\/[\w.\-/]+/g;
const WINDOWS_ABSOLUTE_PATTERN = /[A-Za-z]:\\[^\s"'`]+/g;

/**
 * Extracts absolute filesystem paths that are unlikely to work on other
 * machines. Used by KASANE006 (absolute path).
 */
export function extractAbsolutePaths(text: string): string[] {
  const matches = [
    ...(text.match(UNIX_ABSOLUTE_PATTERN) ?? []),
    ...(text.match(WINDOWS_ABSOLUTE_PATTERN) ?? []),
  ];
  return Array.from(new Set(matches));
}
