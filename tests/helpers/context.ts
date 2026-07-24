import { normalizeInstruction } from "../../src/utils/normalize.js";
import type { AnalysisContext, ContextInstruction } from "../../src/core/types.js";

export function makeInstruction(
  overrides: Partial<ContextInstruction> & { content: string; relativePath: string },
): ContextInstruction {
  const { relativePath, content, ...rest } = overrides;
  return {
    id: `${relativePath}#0`,
    source: {
      filePath: `/repo/${relativePath}`,
      relativePath,
      lineStart: 1,
      lineEnd: 1,
    },
    agents: ["claude"],
    scope: { type: "repository", value: "." },
    content,
    normalizedContent: normalizeInstruction(content),
    estimatedTokens: 1,
    references: [],
    ...rest,
  };
}

export function makeContext(
  overrides: Partial<AnalysisContext> = {},
): AnalysisContext {
  return {
    repository: "/repo",
    sources: [],
    instructions: [],
    totalEstimatedTokens: 0,
    packageJsonScripts: null,
    ...overrides,
  };
}
