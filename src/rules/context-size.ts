import type { AnalysisContext, Diagnostic, DiagnosticRule } from "../core/types.js";

const TOTAL_TOKEN_WARNING_THRESHOLD = 8000;
const SOURCE_TOKEN_WARNING_THRESHOLD = 4000;

export const contextSizeRule: DiagnosticRule = {
  id: "KASANE005",

  async run(context: AnalysisContext): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    if (context.totalEstimatedTokens > TOTAL_TOKEN_WARNING_THRESHOLD) {
      diagnostics.push({
        ruleId: "KASANE005",
        severity: "warning",
        title: "Context is large",
        message: `Total estimated tokens across all context files is ${context.totalEstimatedTokens}, above the ${TOTAL_TOKEN_WARNING_THRESHOLD} warning threshold`,
        metadata: { totalEstimatedTokens: context.totalEstimatedTokens },
      });
    }

    for (const source of context.sources) {
      if (source.estimatedTokens <= SOURCE_TOKEN_WARNING_THRESHOLD) continue;
      diagnostics.push({
        ruleId: "KASANE005",
        severity: "warning",
        title: "Context file is large",
        message: `${source.relativePath} is estimated at ${source.estimatedTokens} tokens, above the ${SOURCE_TOKEN_WARNING_THRESHOLD} warning threshold`,
        source: { filePath: source.filePath, relativePath: source.relativePath },
        metadata: { estimatedTokens: source.estimatedTokens },
      });
    }

    return diagnostics;
  },
};
