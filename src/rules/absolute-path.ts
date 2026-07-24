import type { AnalysisContext, Diagnostic, DiagnosticRule } from "../core/types.js";
import { extractAbsolutePaths } from "../utils/path.js";

export const absolutePathRule: DiagnosticRule = {
  id: "KASANE006",

  async run(context: AnalysisContext): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    for (const instruction of context.instructions) {
      for (const absolutePath of extractAbsolutePaths(instruction.content)) {
        diagnostics.push({
          ruleId: "KASANE006",
          severity: "warning",
          title: "Machine-specific absolute path",
          message: `"${absolutePath}" is an absolute path that will not resolve on other machines`,
          source: instruction.source,
          metadata: { path: absolutePath },
        });
      }
    }

    return diagnostics;
  },
};
