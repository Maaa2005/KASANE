import fs from "node:fs";
import path from "node:path";
import type { AnalysisContext, Diagnostic, DiagnosticRule } from "../core/types.js";
import {
  LOCKFILE_MANAGERS,
  extractMentionedManagers,
  type PackageManager,
} from "../utils/commands.js";

function detectLockfileManagers(repository: string): PackageManager[] {
  const found: PackageManager[] = [];
  for (const [lockfile, manager] of Object.entries(LOCKFILE_MANAGERS)) {
    if (fs.existsSync(path.join(repository, lockfile))) {
      found.push(manager);
    }
  }
  return Array.from(new Set(found));
}

const KNOWN_MANAGERS = new Set<string>(Object.values(LOCKFILE_MANAGERS));

const isKnownManager = (value: string | undefined): value is PackageManager =>
  value !== undefined && KNOWN_MANAGERS.has(value);

export const packageManagerConflictRule: DiagnosticRule = {
  id: "KASANE004",

  async run(context: AnalysisContext): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const lockfileManagers = detectLockfileManagers(context.repository);
    const declared = isKnownManager(context.declaredPackageManager)
      ? context.declaredPackageManager
      : undefined;

    if (lockfileManagers.length > 1) {
      diagnostics.push({
        ruleId: "KASANE004",
        severity: "error",
        title: "Conflicting package manager lockfiles",
        message: `Multiple lockfiles found for different package managers: ${lockfileManagers.join(", ")}`,
        metadata: { managers: lockfileManagers },
      });
    }

    const [lockfileManager] = lockfileManagers;
    if (
      declared !== undefined &&
      lockfileManagers.length === 1 &&
      lockfileManager !== declared
    ) {
      diagnostics.push({
        ruleId: "KASANE004",
        severity: "error",
        title: "Package manager declaration conflicts with lockfile",
        message: `package.json "packageManager" declares "${declared}" but the repository lockfile indicates "${lockfileManager}"`,
        metadata: { declared, lockfile: lockfileManager },
      });
      return diagnostics;
    }

    // A single lockfile settles which manager the repository uses. Without
    // one (a fresh clone of a repository that does not commit it), or with
    // several, the package.json declaration does: Corepack enforces it.
    const expected =
      lockfileManagers.length === 1 ? lockfileManager : declared;
    if (expected === undefined) return diagnostics;
    const basis =
      lockfileManagers.length === 1
        ? "the repository lockfile indicates"
        : 'package.json "packageManager" declares';

    const reported = new Set<string>();
    for (const instruction of context.instructions) {
      for (const manager of extractMentionedManagers(instruction.content, expected)) {
        if (manager === expected) continue;
        const key = `${instruction.source.relativePath}:${manager}`;
        if (reported.has(key)) continue;
        reported.add(key);

        diagnostics.push({
          ruleId: "KASANE004",
          severity: "warning",
          title: "Package manager mismatch",
          message: `Instruction mentions "${manager}" but ${basis} "${expected}"`,
          source: instruction.source,
          metadata: { mentioned: manager, expected },
        });
      }
    }

    return diagnostics;
  },
};
