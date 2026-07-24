export interface SecretMatch {
  pattern: string;
  value: string;
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
 * Masks a secret value for safe display (e.g. "sk-abc...xyz").
 * Never display the full secret value in logs or diagnostics.
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "***";
  }
  return `${value.slice(0, 5)}...${value.slice(-3)}`;
}
