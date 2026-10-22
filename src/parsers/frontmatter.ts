import yaml from "js-yaml";

export interface SplitFrontmatter {
  data: Record<string, unknown>;
  body: string;
  /** Number of lines before `body` starts in the original content. */
  lineOffset: number;
}

const OPEN = /^---[ \t]*$/;
const CLOSE = /^(?:---|\.\.\.)[ \t]*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Reads `key: value` lines without a YAML parser. Cursor writes globs
 * unquoted (`globs: **\/*.ts`), which YAML rejects as an alias, yet Cursor
 * itself accepts them.
 */
function parseLoose(block: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const line of block.split(/\r?\n/)) {
    const match = /^([A-Za-z_][\w-]*):[ \t]*(.*?)[ \t]*$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    const unquoted = raw.replace(/^(["'])(.*)\1$/, "$2");
    if (raw === "true" || raw === "false") {
      data[key] = raw === "true";
    } else {
      data[key] = unquoted;
    }
  }
  return data;
}

/**
 * Splits YAML frontmatter from a Markdown file.
 *
 * Only a bare `---` opening line starts frontmatter. gray-matter also
 * accepted `---js` and evaluated the block as JavaScript, so merely
 * inspecting a repository could run code from it. The block is parsed with
 * the YAML core schema, which has no executable types.
 *
 * Anything that is not a YAML mapping (an unclosed `---` used as a
 * horizontal rule, a list, a scalar) is left in the body rather than
 * swallowed, and a malformed block never aborts the run.
 */
export function splitFrontmatter(content: string): SplitFrontmatter {
  const text = content.startsWith("﻿") ? content.slice(1) : content;
  const none: SplitFrontmatter = { data: {}, body: text, lineOffset: 0 };

  const lines = text.split("\n");
  if (lines.length < 2 || !OPEN.test(lines[0].replace(/\r$/, ""))) {
    return none;
  }

  let closeIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (CLOSE.test(lines[i].replace(/\r$/, ""))) {
      closeIndex = i;
      break;
    }
  }
  if (closeIndex === -1) return none;

  const block = lines.slice(1, closeIndex).join("\n");
  const body = lines.slice(closeIndex + 1).join("\n");
  const stripped: SplitFrontmatter = {
    data: {},
    body,
    lineOffset: closeIndex + 1,
  };

  if (block.trim() === "") return stripped;

  let parsed: unknown;
  try {
    parsed = yaml.load(block, { schema: yaml.CORE_SCHEMA });
  } catch {
    const loose = parseLoose(block);
    return Object.keys(loose).length > 0
      ? { ...stripped, data: loose }
      : none;
  }

  return isPlainObject(parsed) ? { ...stripped, data: parsed } : none;
}
