export interface SecretMatch {
  pattern: string;
  value: string;
}

export interface LocatedSecretMatch extends SecretMatch {
  /** 1-based line number within the scanned content. */
  line: number;
}

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "sk-", pattern: /sk-[A-Za-z0-9_-]{10,}/g },
  { name: "ghp_", pattern: /ghp_[A-Za-z0-9]{20,}/g },
  { name: "github_pat_", pattern: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: "AKIA", pattern: /AKIA[0-9A-Z]{16}/g },
  { name: "Bearer", pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g },
];

/**
 * Finds strings that look like API keys or tokens. Used by KASANE007.
 */
export function findPossibleSecrets(text: string): SecretMatch[] {
  const results: SecretMatch[] = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    for (const match of text.match(pattern) ?? []) {
      results.push({ pattern: name, value: match });
    }
  }
  return results;
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
 * The replacement only ever produces `[A-Za-z0-9.-]`, so it is safe to
 * apply to already-serialized JSON.
 */
export function redactSecrets(text: string): string {
  let redacted = text;
  for (const { pattern } of SECRET_PATTERNS) {
    redacted = redacted.replace(
      new RegExp(pattern.source, pattern.flags),
      (match) => maskSecret(match),
    );
  }
  return redacted;
}
