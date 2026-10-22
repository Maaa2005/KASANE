import fs from "node:fs/promises";
import path from "node:path";
import { discoverConfigFiles, resolveFileInside } from "./discover.js";
import { aliasSourcePaths } from "./aliases.js";
import { parseMarkdown } from "../parsers/markdown.js";
import { estimateTokens } from "./tokenizer.js";
import { normalizeInstruction } from "../utils/normalize.js";
import { redactSecrets } from "../utils/secrets.js";
import {
  extractExplicitReferences,
  extractFileReferences,
} from "../utils/path.js";
import { duplicateInstructionRule } from "../rules/duplicate-instruction.js";
import { brokenReferenceRule } from "../rules/broken-reference.js";
import { missingScriptRule } from "../rules/missing-script.js";
import { packageManagerConflictRule } from "../rules/package-manager-conflict.js";
import { contextSizeRule } from "../rules/context-size.js";
import { absolutePathRule } from "../rules/absolute-path.js";
import { possibleSecretRule } from "../rules/possible-secret.js";
import { KASANE_VERSION } from "../version.js";
import type {
  AgentType,
  AnalysisContext,
  ContextInstruction,
  ContextSource,
  Diagnostic,
  DiagnosticRule,
  InspectResult,
  Severity,
  SourceType,
} from "./types.js";

const AGENTS_BY_SOURCE_TYPE: Record<SourceType, AgentType[]> = {
  agents: ["codex"],
  claude: ["claude"],
  cursor: ["cursor"],
  gemini: ["gemini"],
  copilot: ["copilot"],
  mcp: [],
};

const RULES: DiagnosticRule[] = [
  duplicateInstructionRule,
  brokenReferenceRule,
  missingScriptRule,
  packageManagerConflictRule,
  contextSizeRule,
  absolutePathRule,
  possibleSecretRule,
];

function isMarkdownSource(sourceType: SourceType): boolean {
  return sourceType !== "mcp";
}

/**
 * The directory a Cursor rule is anchored to: the parent of its `.cursor`
 * directory, or the repository root for a root-level rule. Cursor applies a
 * nested rule to the subtree that owns it, so `backend/.cursor/rules/x.mdc`
 * is scoped to `backend/`.
 */
function cursorBaseDir(relativePath: string): string {
  const marker = "/.cursor/";
  const index = relativePath.indexOf(marker);
  if (index >= 0) return relativePath.slice(0, index);
  if (relativePath.startsWith(".cursor/")) return ".";
  return path.posix.dirname(relativePath);
}

/**
 * Cursor's `globs` frontmatter is written as a list, as a single string, or
 * as a comma-separated string. Each pattern is kept as its own entry so
 * extglob syntax such as `@(a|b)` is never split apart.
 */
function normalizeGlobs(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value];
  const patterns: string[] = [];

  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    for (const part of entry.split(",")) {
      const trimmed = part.trim();
      if (trimmed.length > 0) patterns.push(trimmed);
    }
  }

  return patterns;
}

function scopeToBase(base: string): ContextInstruction["scope"] {
  return base === "."
    ? { type: "repository", patterns: ["."] }
    : { type: "directory", patterns: [base] };
}

function computeScope(
  relativePath: string,
  sourceType: SourceType,
  frontmatter: Record<string, unknown>,
): ContextInstruction["scope"] {
  if (sourceType === "cursor") {
    const base = cursorBaseDir(relativePath);
    const globs = normalizeGlobs(frontmatter.globs);

    if (globs.length > 0) {
      // Cursor globs are written relative to the rule's own subtree.
      const patterns =
        base === "."
          ? globs
          : globs.map((glob) => `${base}/${glob.replace(/^\.?\//, "")}`);
      return { type: "glob", patterns };
    }

    // Without globs the rule is either always applied or agent-requested.
    // Both reach the whole subtree that owns the rule; scoping them to the
    // `.cursor/rules` directory instead would hide them from every target.
    return scopeToBase(base);
  }

  const dir = path.posix.dirname(relativePath);
  return scopeToBase(dir);
}

interface PackageJsonInfo {
  scripts: string[];
  dependencies: string[];
}

async function readPackageJson(root: string): Promise<PackageJsonInfo | null> {
  try {
    // Same guard as discovery: a symlink out of the repository, or to a
    // device, is not this repository's package.json.
    const file = resolveFileInside(root, "package.json");
    if (!file) return null;
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return {
      scripts: Object.keys(parsed.scripts ?? {}),
      dependencies: [
        ...Object.keys(parsed.dependencies ?? {}),
        ...Object.keys(parsed.devDependencies ?? {}),
      ],
    };
  } catch {
    return null;
  }
}

export async function buildAnalysisContext(root: string): Promise<AnalysisContext> {
  const absoluteRoot = path.resolve(root);
  const discovered = await discoverConfigFiles(absoluteRoot);

  const contents = await Promise.all(
    discovered.map((file) => fs.readFile(file.filePath, "utf8")),
  );

  const sources: ContextSource[] = [];
  const instructions: ContextInstruction[] = [];

  discovered.forEach((file, fileIndex) => {
    const content = contents[fileIndex];
    const estimatedTokens = estimateTokens(content);
    const agents = AGENTS_BY_SOURCE_TYPE[file.sourceType];

    if (isMarkdownSource(file.sourceType)) {
      const parsed = parseMarkdown(content);
      const scope = computeScope(
        file.relativePath,
        file.sourceType,
        parsed.frontmatter,
      );
      parsed.instructions.forEach((instruction, index) => {
        const references = Array.from(
          new Set([
            ...extractFileReferences(instruction.content),
            ...extractExplicitReferences(
              instruction.linkTargets,
              instruction.codeSpans,
            ),
          ]),
        );

        instructions.push({
          id: `${file.relativePath}#${index}`,
          source: {
            filePath: file.filePath,
            relativePath: file.relativePath,
            lineStart: instruction.lineStart,
            lineEnd: instruction.lineEnd,
          },
          agents,
          scope,
          content: instruction.content,
          // Normalizing lowercases and strips `_`, which turns `AKIA…` and
          // `ghp_…` into text no secret pattern recognizes. Mask first.
          normalizedContent: normalizeInstruction(
            redactSecrets(instruction.content),
          ),
          estimatedTokens: estimateTokens(instruction.content),
          references,
        });
      });
    }

    sources.push({
      id: file.relativePath,
      filePath: file.filePath,
      relativePath: file.relativePath,
      sourceType: file.sourceType,
      agents,
      content,
      estimatedTokens,
      ...(file.linkTarget ? { linkTarget: file.linkTarget } : {}),
    });
  });

  const aliases = aliasSourcePaths(sources);
  const totalEstimatedTokens = sources.reduce(
    (sum, source) =>
      aliases.has(source.relativePath) ? sum : sum + source.estimatedTokens,
    0,
  );

  const packageJson = await readPackageJson(absoluteRoot);

  return {
    repository: absoluteRoot,
    sources,
    instructions,
    totalEstimatedTokens,
    packageJsonScripts: packageJson?.scripts ?? null,
    packageJsonDependencies: packageJson?.dependencies ?? [],
  };
}

export async function runDiagnostics(
  context: AnalysisContext,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  for (const rule of RULES) {
    diagnostics.push(...(await rule.run(context)));
  }
  // A symlinked config file would repeat every finding of the file it points
  // to; those are reported once, against the file itself.
  const aliases = aliasSourcePaths(context.sources);
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.source === undefined ||
      !aliases.has(diagnostic.source.relativePath),
  );
}

export async function analyzeRepository(root: string): Promise<InspectResult> {
  const context = await buildAnalysisContext(root);
  const diagnostics = await runDiagnostics(context);

  const diagnosticCount: Record<Severity, number> = {
    info: 0,
    warning: 0,
    error: 0,
  };
  for (const diagnostic of diagnostics) {
    diagnosticCount[diagnostic.severity] += 1;
  }

  return {
    version: KASANE_VERSION,
    repository: context.repository,
    summary: {
      sourceCount: context.sources.length,
      instructionCount: context.instructions.length,
      estimatedTokens: context.totalEstimatedTokens,
      diagnosticCount,
    },
    sources: context.sources,
    diagnostics,
  };
}
