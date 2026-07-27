import type { AnalysisContext, Diagnostic, DiagnosticRule } from "../core/types.js";
import { findPossibleSecretsInContent, maskSecret } from "../utils/secrets.js";

export const possibleSecretRule: DiagnosticRule = {
  id: "KASANE007",

  async run(context: AnalysisContext): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    // Scan whole files rather than extracted instructions. Headings, fenced
    // code blocks and non-Markdown sources never become instructions, and
    // MCP configuration — the source most likely to hold a real token — is
    // never parsed for instructions at all.
    for (const source of context.sources) {
      const reported = new Set<string>();

      for (const secret of findPossibleSecretsInContent(source.content)) {
        const key = `${secret.line}:${secret.value}`;
        if (reported.has(key)) continue;
        reported.add(key);

        diagnostics.push({
          ruleId: "KASANE007",
          severity: "error",
          title: "Possible secret in context file",
          message: `A string matching the "${secret.pattern}" pattern was found: ${maskSecret(secret.value)}`,
          source: {
            filePath: source.filePath,
            relativePath: source.relativePath,
            lineStart: secret.line,
            lineEnd: secret.line,
          },
          metadata: { pattern: secret.pattern },
        });
      }
    }

    return diagnostics;
  },
};
