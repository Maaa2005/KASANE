import { redactSecrets } from "../utils/secrets.js";

export interface RenderJsonOptions {
  /** Include each source's full file content. Off by default. */
  includeContent?: boolean;
}

/**
 * Drops `content` from context sources — the verbatim text of a whole
 * config file. KASANE007 masks the secret it reports, but emitting the file
 * alongside the diagnostic put the unmasked value straight back into the
 * output, which is typically piped into CI logs or another tool.
 *
 * Instruction `content` is kept: it is the single line the user asked
 * about, and it still goes through secret redaction below.
 */
function stripSourceContent(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSourceContent);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const isSource = "sourceType" in record && "content" in record;
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      if (isSource && key === "content") continue;
      result[key] = stripSourceContent(entry);
    }
    return result;
  }
  return value;
}

export function renderJson(
  result: object,
  options: RenderJsonOptions = {},
): string {
  const payload = options.includeContent ? result : stripSourceContent(result);
  // Every string is redacted before serialization, so no field — including
  // one added later — can route an unmasked secret to stdout, and JSON
  // escapes such as `\t` cannot hide a key from the patterns. The final
  // pass covers object keys, which a replacer cannot rewrite.
  const serialized = JSON.stringify(
    payload,
    (_key, value: unknown) =>
      typeof value === "string" ? redactSecrets(value) : value,
    2,
  );
  return redactSecrets(serialized);
}
