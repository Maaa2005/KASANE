import fs from "node:fs";
import path from "node:path";
import { minimatch } from "minimatch";
import { realPathOf } from "./aliases.js";
import type {
  AgentType,
  AnalysisContext,
  ContextInstruction,
  Diagnostic,
  EffectiveContext,
} from "./types.js";

export interface ResolveOptions {
  agent: AgentType;
  targetPath?: string;
}

function isExistingDirectory(absolutePath: string): boolean {
  try {
    return fs.statSync(absolutePath).isDirectory();
  } catch {
    return false;
  }
}

/** A `--path` that points outside the repository being analyzed. */
export class TargetPathError extends Error {}

export interface ResolvedTargetPath {
  /** POSIX path relative to the repository; `.` for the root itself. */
  relativePath: string;
  isDirectory: boolean;
}

/**
 * Resolves `--path` against the repository root. A directory is recognized
 * on disk or by a trailing separator, so a directory that does not exist
 * yet can still be named as `src/new/`.
 */
export function resolveTargetPath(
  repository: string,
  targetPath: string,
): ResolvedTargetPath {
  const absolute = path.resolve(repository, targetPath);
  const relative = path.relative(repository, absolute);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new TargetPathError(
      `--path is outside the repository: ${targetPath}`,
    );
  }

  const isDirectory =
    relative === "" || /[\\/]$/.test(targetPath) || isExistingDirectory(absolute);

  return {
    relativePath: relative === "" ? "." : relative.split(path.sep).join("/"),
    isDirectory,
  };
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
  const target = options.targetPath
    ? resolveTargetPath(context.repository, options.targetPath)
    : undefined;
  // A directory gets what an agent started in it loads: config files in it
  // and its parents, plus glob rules that match any file under it.
  const targetDir = target
    ? target.isDirectory
      ? target.relativePath
      : path.posix.dirname(target.relativePath)
    : undefined;
  const matchesGlob = (pattern: string): boolean => {
    if (!target) return true;
    if (!target.isDirectory) return minimatch(target.relativePath, pattern);
    if (target.relativePath === ".") return true;
    return minimatch(target.relativePath, pattern, { partial: true });
  };

  const inScope = (instruction: ContextInstruction): boolean => {
    if (!targetDir) return true;
    if (instruction.scope.type === "repository") return true;
    if (instruction.scope.type === "directory") {
      return isAncestorDir(instruction.scope.patterns[0], targetDir);
    }
    return instruction.scope.patterns.some(matchesGlob);
  };

  // Instructions loaded through `@path` imports follow each file's own. An
  // instruction already in the list — imported by two CLAUDE.md files, or
  // read directly as well — is kept once.
  const seen = new Set<string>();
  const instructions = [
    ...context.instructions,
    ...(context.importedInstructions ?? []),
  ].filter((instruction) => {
    if (!instruction.agents.includes(options.agent)) return false;
    if (instruction.importsOnly) return false;
    if (!inScope(instruction)) return false;
    if (seen.has(instruction.id)) return false;
    seen.add(instruction.id);
    return true;
  });

  const includedPaths = new Set<string>();
  const importedPaths = new Set<string>();
  for (const instruction of instructions) {
    includedPaths.add(instruction.source.relativePath);
    if (instruction.importedBy !== undefined) {
      includedPaths.add(instruction.importedBy);
      importedPaths.add(instruction.source.relativePath);
    }
  }

  const sources = [...context.sources, ...(context.importedSources ?? [])].filter(
    (source) =>
      includedPaths.has(source.relativePath) &&
      (source.agents.includes(options.agent) ||
        importedPaths.has(source.relativePath)),
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
    targetPath: target?.relativePath,
    sources,
    instructions,
    diagnostics: scopedDiagnostics,
    estimatedTokens,
  };
}
