import { aliasSourcePaths } from "../core/aliases.js";
import type { AnalysisContext, Diagnostic, DiagnosticRule } from "../core/types.js";

export const duplicateInstructionRule: DiagnosticRule = {
  id: "KASANE001",

  async run(context: AnalysisContext): Promise<Diagnostic[]> {
    const groups = new Map<string, typeof context.instructions>();
    // A symlink and its target are one file, not a duplicate.
    const aliases = aliasSourcePaths(context.sources);

    for (const instruction of context.instructions) {
      if (instruction.normalizedContent.length === 0) continue;
      if (aliases.has(instruction.source.relativePath)) continue;
      const group = groups.get(instruction.normalizedContent) ?? [];
      group.push(instruction);
      groups.set(instruction.normalizedContent, group);
    }

    const diagnostics: Diagnostic[] = [];

    for (const group of groups.values()) {
      const distinctFiles = new Set(group.map((i) => i.source.relativePath));
      if (distinctFiles.size < 2) continue;

      const [first, ...rest] = group;
      diagnostics.push({
        ruleId: "KASANE001",
        severity: "warning",
        title: "Duplicated instruction",
        message: `The same instruction appears in ${distinctFiles.size} files: "${first.content}"`,
        source: first.source,
        relatedSources: rest.map((i) => i.source),
      });
    }

    return diagnostics;
  },
};
