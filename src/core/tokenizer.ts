import { getEncoding } from "js-tiktoken";

let encoding: ReturnType<typeof getEncoding> | undefined;

function getSharedEncoding(): ReturnType<typeof getEncoding> {
  encoding ??= getEncoding("cl100k_base");
  return encoding;
}

// Byte-pair encoding is quadratic in the byte length of a single word, so
// one long run of non-space characters (minified code, a base64 blob, or
// prose in a language written without spaces) can take seconds to count.
// Long runs are counted in slices of at most MAX_BYTES bytes, which shifts
// the estimate by at most a token per slice.
const MAX_BYTES = 32;
const LONG_RUN = /\S{32,}|\s{32,}/gu;
// Beyond this many characters, the count of the first part is extrapolated.
const SAMPLE_LENGTH = 64 * 1024;

function encodedLength(text: string): number {
  // Special-token markers such as `<|endoftext|>` are ordinary text in a
  // config file; by default js-tiktoken throws on them.
  return getSharedEncoding().encode(text, [], []).length;
}

function utf8Length(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  return code < 0x10000 ? 3 : 4;
}

function countRun(run: string): number {
  let total = 0;
  let slice = "";
  let bytes = 0;
  for (const char of run) {
    const size = utf8Length(char);
    if (bytes + size > MAX_BYTES) {
      total += encodedLength(slice);
      slice = "";
      bytes = 0;
    }
    slice += char;
    bytes += size;
  }
  return total + encodedLength(slice);
}

function countBounded(text: string): number {
  let total = 0;
  let last = 0;
  for (const match of text.matchAll(LONG_RUN)) {
    total += encodedLength(text.slice(last, match.index)) + countRun(match[0]);
    last = match.index + match[0].length;
  }
  return total + encodedLength(text.slice(last));
}

export function estimateTokens(content: string): number {
  if (content.length <= SAMPLE_LENGTH) return countBounded(content);
  const sample = countBounded(content.slice(0, SAMPLE_LENGTH));
  return Math.ceil((sample * content.length) / SAMPLE_LENGTH);
}
