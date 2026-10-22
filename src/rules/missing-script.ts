import type { AnalysisContext, Diagnostic, DiagnosticRule } from "../core/types.js";
import {
  extractPackageManagerCommands,
  isDependencyBinary,
} from "../utils/commands.js";

interface ReachablePackage {
  scripts: Set<string>;
  dependencies: Set<string>;
}

function reachablePackage(
  context: AnalysisContext,
  relativePath: string,
  cache: Map<string, ReachablePackage | null>,
): ReachablePackage | null {
  const cached = cache.get(relativePath);
  if (cached !== undefined) return cached;

  let result: ReachablePackage | null;
  if (context.packageScripts?.has(relativePath)) {
    const info = context.packageScripts.get(relativePath) ?? null;
    result = info && {
      scripts: new Set(info.scripts),
      dependencies: new Set(info.dependencies),
    };
  } else {
    result =
      context.packageJsonScripts === null
        ? null
        : {
            scripts: new Set(context.packageJsonScripts),
            dependencies: new Set(context.packageJsonDependencies ?? []),
          };
  }
  cache.set(relativePath, result);
  return result;
}

export const missingScriptRule: DiagnosticRule = {
  id: "KASANE003",

  async run(context: AnalysisContext): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const reported = new Set<string>();
    const packages = new Map<string, ReachablePackage | null>();

    for (const instruction of context.instructions) {
      const reachable = reachablePackage(
        context,
        instruction.source.relativePath,
        packages,
      );
      if (reachable === null) continue;

      for (const command of extractPackageManagerCommands(instruction.content)) {
        if (reachable.scripts.has(command.script)) continue;
        // `pnpm tsc` and `yarn jest` run the binary when no script matches.
        if (
          command.runsBinaries &&
          isDependencyBinary(command.script, reachable.dependencies)
        ) {
          continue;
        }
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
