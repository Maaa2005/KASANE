import type { AnalysisContext, Diagnostic, DiagnosticRule } from "../core/types.js";
import { findPossibleSecrets, maskSecret } from "../utils/secrets.js";

export const possibleSecretRule: DiagnosticRule = {
  id: "KASANE007",

  async run(context: AnalysisContext): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    for (const instruction of context.instructions) {
      for (const secret of findPossibleSecrets(instruction.content)) {
        diagnostics.push({
          ruleId: "KASANE007",
          severity: "error",
          title: "Possible secret in context file",
          message: `A string matching the "${secret.pattern}" pattern was found: ${maskSecret(secret.value)}`,
          source: instruction.source,
          metadata: { pattern: secret.pattern },
        });
      }
    }

    return diagnostics;
  },
};
