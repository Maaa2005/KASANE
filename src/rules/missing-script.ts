import type { AnalysisContext, Diagnostic, DiagnosticRule } from "../core/types.js";
import { extractPackageManagerCommands } from "../utils/commands.js";

export const missingScriptRule: DiagnosticRule = {
  id: "KASANE003",

  async run(context: AnalysisContext): Promise<Diagnostic[]> {
    if (context.packageJsonScripts === null) {
      return [];
    }
    const scripts = new Set(context.packageJsonScripts);
    const diagnostics: Diagnostic[] = [];
    const reported = new Set<string>();

    for (const instruction of context.instructions) {
      for (const command of extractPackageManagerCommands(instruction.content)) {
        if (scripts.has(command.script)) continue;
        const key = `${instruction.source.relativePath}:${command.script}`;
        if (reported.has(key)) continue;
        reported.add(key);

        diagnostics.push({
          ruleId: "KASANE003",
          severity: "error",
          title: "Missing package.json script",
          message: `"${command.manager} run ${command.script}" is referenced but package.json has no "${command.script}" script`,
          source: instruction.source,
          metadata: { manager: command.manager, script: command.script },
        });
      }
    }

    return diagnostics;
  },
};
