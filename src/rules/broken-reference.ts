import fs from "node:fs";
import path from "node:path";
import type { AnalysisContext, Diagnostic, DiagnosticRule } from "../core/types.js";

function referenceExists(
  reference: string,
  repository: string,
  sourceFilePath: string,
): boolean {
  const candidates = [
    path.resolve(repository, reference),
    path.resolve(path.dirname(sourceFilePath), reference),
  ];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

export const brokenReferenceRule: DiagnosticRule = {
  id: "KASANE002",

  async run(context: AnalysisContext): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    for (const instruction of context.instructions) {
      for (const reference of instruction.references) {
        if (referenceExists(reference, context.repository, instruction.source.filePath)) {
          continue;
        }
        diagnostics.push({
          ruleId: "KASANE002",
          severity: "error",
          title: "Broken file reference",
          message: `${reference} does not exist`,
          source: instruction.source,
          metadata: { reference },
        });
      }
    }

    return diagnostics;
  },
};
