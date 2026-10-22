export interface SecretMatch {
  pattern: string;
  value: string;
}

export interface LocatedSecretMatch extends SecretMatch {
  /** 1-based line number within the scanned content. */
  line: number;
}

interface SecretPattern {
  name: string;
  pattern: RegExp;
  /** Extra check on the matched text, for prefixes that also start words. */
  accept?: (value: string) => boolean;
}

// A token never starts in the middle of an identifier or a hyphenated word:
// without this, `flask-sqlalchemy` and `task-management` read as `sk-…`.
const START = String.raw`(?<![A-Za-z0-9_-])`;

const hasDigit = (value: string) => /\d/.test(value);

function prefixed(name: string, body: string, flags = "g"): SecretPattern {
  return { name, pattern: new RegExp(`${START}${body}`, flags) };
}

const SECRET_PATTERNS: SecretPattern[] = [
  // OpenAI and Anthropic keys. Plain words such as `sk-learn-examples`
  // never contain a digit; real keys always do.
  { ...prefixed("sk-", "sk-[A-Za-z0-9_-]{10,}"), accept: hasDigit },
  ...["ghp_", "gho_", "ghu_", "ghs_", "ghr_"].map((prefix) =>
    prefixed(prefix, `${prefix}[A-Za-z0-9]{20,}`),
  ),
  prefixed("github_pat_", "github_pat_[A-Za-z0-9_]{20,}"),
  prefixed("glpat-", "glpat-[A-Za-z0-9_-]{20,}"),
  prefixed("AKIA", "AKIA[0-9A-Z]{16}(?![0-9A-Z])"),
  prefixed("ASIA", "ASIA[0-9A-Z]{16}(?![0-9A-Z])"),
  prefixed("AIza", "AIza[0-9A-Za-z_-]{35}"),
  prefixed("xox", "xox[abprs]-[A-Za-z0-9-]{10,}"),
  prefixed("sk_live_", "[sr]k_live_[0-9A-Za-z]{16,}"),
  prefixed("npm_", "npm_[A-Za-z0-9]{36}"),
  prefixed("hf_", "hf_[A-Za-z0-9]{30,}"),
  prefixed("PRIVATE KEY", "-----BEGIN [A-Z ]*PRIVATE KEY-----"),
  // "Bearer token" and "Bearer YOUR_API_KEY" are prose and placeholders.
  // A credential is long and, unlike an English word, contains a digit.
  {
    ...prefixed("Bearer", String.raw`bearer[ \t]+[A-Za-z0-9\-._~+/]+=*`, "gi"),
    accept: (value) => {
      const token = value.replace(/^bearer[ \t]+/i, "");
      return token.length >= 16 && hasDigit(token);
    },
  },
];

interface RawMatch extends SecretMatch {
  start: number;
  end: number;
}

/**
 * The single source of truth for what counts as a secret. Detection and
 * redaction both go through it, so anything KASANE007 reports is also
 * masked in every output.
 */
function scan(text: string): RawMatch[] {
  const results: RawMatch[] = [];
  for (const { name, pattern, accept } of SECRET_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      const value = match[0];
      if (accept && !accept(value)) continue;
      results.push({
        pattern: name,
        value,
        start: match.index,
        end: match.index + value.length,
      });
    }
  }
  return results;
}

/**
 * Finds strings that look like API keys or tokens. Used by KASANE007.
 */
export function findPossibleSecrets(text: string): SecretMatch[] {
  return scan(text).map(({ pattern, value }) => ({ pattern, value }));
}

/**
 * Scans a whole file's content line by line. Markdown instruction
 * extraction drops headings, fenced code blocks and non-Markdown files
 * entirely, so scanning only instructions misses the places secrets are
 * most likely to sit — MCP JSON and copy-pasteable command blocks.
 */
export function findPossibleSecretsInContent(
  content: string,
): LocatedSecretMatch[] {
  const results: LocatedSecretMatch[] = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((lineText, index) => {
    for (const secret of findPossibleSecrets(lineText)) {
      results.push({ ...secret, line: index + 1 });
    }
  });

  return results;
}

/**
 * Masks a secret value for safe display (e.g. "sk-abc...xyz").
 * Never display the full secret value in logs or diagnostics.
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "***";
  }
  return `${value.slice(0, 5)}...${value.slice(-3)}`;
}

/**
 * Masks every secret-looking string in arbitrary rendered output.
 *
 * KASANE007 masks the value it reports, but the same secret can still
 * reach stdout through a source's raw `content`, through a duplicated
 * instruction quoted in another rule's message, or through JSON. Renderers
 * apply this to their final output so masking cannot be bypassed by
 * choosing a different command or format.
 *
 * Apply it to text before any escaping: JSON turns a tab in front of a key
 * into `\t`, and the `t` then reads as part of a word.
 */
export function redactSecrets(text: string): string {
  const matches = scan(text).sort((a, b) => a.start - b.start || b.end - a.end);
  if (matches.length === 0) return text;

  let redacted = "";
  let cursor = 0;
  let index = 0;
  while (index < matches.length) {
    // Overlapping matches ("Bearer sk-…") are masked as one span.
    const start = matches[index].start;
    let end = matches[index].end;
    index += 1;
    while (index < matches.length && matches[index].start < end) {
      end = Math.max(end, matches[index].end);
      index += 1;
    }
    redacted += text.slice(cursor, start) + maskSecret(text.slice(start, end));
    cursor = end;
  }
  return redacted + text.slice(cursor);
}
