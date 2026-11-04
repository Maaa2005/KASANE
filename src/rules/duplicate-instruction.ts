import { aliasSourcePaths } from "../core/aliases.js";
import type {
  AnalysisContext,
  ContextInstruction,
  Diagnostic,
  DiagnosticRule,
} from "../core/types.js";

/**
 * Whether one target can receive both instructions. `packages/a/AGENTS.md`
 * and `packages/b/AGENTS.md` never load together, so the same `pnpm test` in
 * both is not a duplicate. Globs are assumed to overlap.
 */
function overlaps(a: ContextInstruction, b: ContextInstruction): boolean {
  if (a.scope.type !== "directory" || b.scope.type !== "directory") return true;
  const [x] = a.scope.patterns;
  const [y] = b.scope.patterns;
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

function hasOverlappingCopies(group: ContextInstruction[]): boolean {
  return group.some((a, index) =>
    group
      .slice(index + 1)
      .some(
        (b) => a.source.relativePath !== b.source.relativePath && overlaps(a, b),
      ),
  );
}

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
      if (distinctFiles.size < 2 || !hasOverlappingCopies(group)) continue;

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
