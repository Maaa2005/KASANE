import fs from "node:fs";
import path from "node:path";
import type { AnalysisContext, Diagnostic, DiagnosticRule } from "../core/types.js";
import { LOCKFILE_MANAGERS, extractMentionedManagers } from "../utils/commands.js";

function detectLockfileManagers(repository: string): string[] {
  const found: string[] = [];
  for (const [lockfile, manager] of Object.entries(LOCKFILE_MANAGERS)) {
    if (fs.existsSync(path.join(repository, lockfile))) {
      found.push(manager);
    }
  }
  return Array.from(new Set(found));
}

export const packageManagerConflictRule: DiagnosticRule = {
  id: "KASANE004",

  async run(context: AnalysisContext): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const lockfileManagers = detectLockfileManagers(context.repository);

    if (lockfileManagers.length > 1) {
      diagnostics.push({
        ruleId: "KASANE004",
        severity: "error",
        title: "Conflicting package manager lockfiles",
        message: `Multiple lockfiles found for different package managers: ${lockfileManagers.join(", ")}`,
        metadata: { managers: lockfileManagers },
      });
    }

    if (lockfileManagers.length === 1) {
      const [expected] = lockfileManagers;
      const reported = new Set<string>();

      for (const instruction of context.instructions) {
        for (const manager of extractMentionedManagers(instruction.content)) {
          if (manager === expected) continue;
          const key = `${instruction.source.relativePath}:${manager}`;
          if (reported.has(key)) continue;
          reported.add(key);

          diagnostics.push({
            ruleId: "KASANE004",
            severity: "warning",
            title: "Package manager mismatch",
            message: `Instruction mentions "${manager}" but the repository lockfile indicates "${expected}"`,
            source: instruction.source,
            metadata: { mentioned: manager, expected },
          });
        }
      }
    }

    return diagnostics;
  },
};
