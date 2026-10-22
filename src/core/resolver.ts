import path from "node:path";
import { minimatch } from "minimatch";
import { realPathOf } from "./aliases.js";
import type {
  AgentType,
  AnalysisContext,
  Diagnostic,
  EffectiveContext,
} from "./types.js";

export interface ResolveOptions {
  agent: AgentType;
  targetPath?: string;
}

function toRelativePosixPath(repository: string, targetPath: string): string {
  const relative = path.relative(repository, path.resolve(repository, targetPath));
  return relative.split(path.sep).join("/");
}

function isAncestorDir(scopeDir: string, targetDir: string): boolean {
  if (scopeDir === ".") return true;
  return targetDir === scopeDir || targetDir.startsWith(`${scopeDir}/`);
}

export function resolveEffectiveContext(
  context: AnalysisContext,
  diagnostics: Diagnostic[],
  options: ResolveOptions,
): EffectiveContext {
  const targetRelativePath = options.targetPath
    ? toRelativePosixPath(context.repository, options.targetPath)
    : undefined;
  const targetDir = targetRelativePath
    ? path.posix.dirname(targetRelativePath)
    : undefined;

  const instructions = context.instructions.filter((instruction) => {
    if (!instruction.agents.includes(options.agent)) return false;
    if (!targetDir) return true;
    if (instruction.scope.type === "repository") return true;
    if (instruction.scope.type === "directory") {
      return isAncestorDir(instruction.scope.patterns[0], targetDir);
    }
    return instruction.scope.patterns.some((pattern) =>
      minimatch(targetRelativePath as string, pattern),
    );
  });

  const includedPaths = new Set(
    instructions.map((instruction) => instruction.source.relativePath),
  );

  const sources = context.sources.filter(
    (source) =>
      includedPaths.has(source.relativePath) &&
      source.agents.includes(options.agent),
  );

  const estimatedTokens = sources.reduce(
    (sum, source) => sum + source.estimatedTokens,
    0,
  );

  // Findings are reported once per file, so a symlinked source is matched
  // through the file it points to, and a duplicate is relevant when any of
  // its copies is in this agent's context.
  const realPaths = new Map(
    context.sources.map((source) => [source.relativePath, realPathOf(source)]),
  );
  const includedRealPaths = new Set(
    sources.map((source) => realPathOf(source)),
  );
  const isIncluded = (relativePath: string): boolean =>
    includedRealPaths.has(realPaths.get(relativePath) ?? relativePath);

  const scopedDiagnostics = diagnostics.filter(
    (diagnostic) =>
      diagnostic.source === undefined ||
      isIncluded(diagnostic.source.relativePath) ||
      (diagnostic.relatedSources ?? []).some((related) =>
        isIncluded(related.relativePath),
      ),
  );

  return {
    agent: options.agent,
    targetPath: targetRelativePath,
    sources,
    instructions,
    diagnostics: scopedDiagnostics,
    estimatedTokens,
  };
}
