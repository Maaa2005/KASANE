import { getEncoding } from "js-tiktoken";

let encoding: ReturnType<typeof getEncoding> | undefined;

function getSharedEncoding(): ReturnType<typeof getEncoding> {
  encoding ??= getEncoding("cl100k_base");
  return encoding;
}

/**
 * Estimated token count using an OpenAI tokenizer as a comparable proxy.
 * Not an exact count for Claude/Gemini/etc — see docs/README caveat.
 */
export function estimateTokens(content: string): number {
  return getSharedEncoding().encode(content).length;
}
