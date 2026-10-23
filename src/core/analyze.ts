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
  PackageScripts,
  Severity,
  SourceType,
} from "./types.js";

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
 * Splits on commas that separate patterns, not the ones inside `{ts,tsx}`,
 * `@(a|b,c)` or `[,]`.
 */
function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      index += 1;
    } else if (char === "{" || char === "(" || char === "[") {
      depth += 1;
    } else if ((char === "}" || char === ")" || char === "]") && depth > 0) {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));

  return parts;
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
    for (const part of splitTopLevelCommas(entry)) {
      const trimmed = part.trim();
      if (trimmed.length > 0) patterns.push(trimmed);
    }
  }

  return patterns;
}

function isAlwaysApplied(frontmatter: Record<string, unknown>): boolean {
  const value = frontmatter.alwaysApply;
  return value === true || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

function hasDescription(frontmatter: Record<string, unknown>): boolean {
  const value = frontmatter.description;
  return typeof value === "string" && value.trim().length > 0;
}

function isInCursorRulesDir(relativePath: string): boolean {
  return (
    relativePath.startsWith(".cursor/rules/") ||
    relativePath.includes("/.cursor/rules/")
  );
}

/**
 * Whether Cursor loads a rule without being asked to. Inside `.cursor/rules`
 * only `.mdc` files are rules, and one with no `alwaysApply`, `globs` or
 * `description` is applied only when @-mentioned. `.cursorrules` is always
 * applied.
 */
function isLoadedCursorRule(
  relativePath: string,
  frontmatter: Record<string, unknown>,
): boolean {
  if (!isInCursorRulesDir(relativePath)) return true;
  if (!relativePath.endsWith(".mdc")) return false;
  return (
    isAlwaysApplied(frontmatter) ||
    normalizeGlobs(frontmatter.globs).length > 0 ||
    hasDescription(frontmatter)
  );
}

/**
 * The agents that load a config file on their own. AGENTS.md is merged with
 * every AGENTS.md above the target by Codex and Cursor. Claude Code reads it
 * only when there is no CLAUDE.md, and Copilot reads only the nearest one,
 * so neither is modeled.
 */
function agentsFor(
  relativePath: string,
  sourceType: SourceType,
  frontmatter: Record<string, unknown>,
): AgentType[] {
  switch (sourceType) {
    case "agents":
      return ["codex", "cursor"];
    case "claude":
      return ["claude"];
    case "gemini":
      return ["gemini"];
    case "copilot":
      // Only the repository's own `.github/copilot-instructions.md` is read.
      return relativePath === ".github/copilot-instructions.md" ? ["copilot"] : [];
    case "cursor":
      return isLoadedCursorRule(relativePath, frontmatter) ? ["cursor"] : [];
    case "mcp":
      return [];
  }
}

function scopeToBase(base: string): ContextInstruction["scope"] {
  return base === "."
    ? { type: "repository", patterns: ["."] }
    : { type: "directory", patterns: [base] };
}

/**
 * The directory a config file belongs to. `.github/copilot-instructions.md`
 * and `.claude/CLAUDE.md` belong to the directory holding `.github` or
 * `.claude`, not to that directory itself, and a Cursor rule to the parent of
 * its `.cursor` directory.
 */
function ownerDir(relativePath: string, sourceType: SourceType): string {
  if (sourceType === "cursor") return cursorBaseDir(relativePath);
  const dir = path.posix.dirname(relativePath);
  const dirName = path.posix.basename(dir);
  if (
    (sourceType === "copilot" && dirName === ".github") ||
    (sourceType === "claude" && dirName === ".claude")
  ) {
    return path.posix.dirname(dir);
  }
  return dir;
}

function computeScope(
  relativePath: string,
  sourceType: SourceType,
  frontmatter: Record<string, unknown>,
): ContextInstruction["scope"] {
  const base = ownerDir(relativePath, sourceType);
  if (sourceType === "cursor") {
    // `alwaysApply: true` includes the rule everywhere; its globs are ignored.
    if (isAlwaysApplied(frontmatter)) return scopeToBase(base);
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

  return scopeToBase(base);
}

async function readPackageJson(
  root: string,
  dir = ".",
): Promise<PackageScripts | null> {
  try {
    // Same guard as discovery: a symlink out of the repository, or to a
    // device, is not this repository's package.json.
    const file = resolveFileInside(root, path.posix.join(dir, "package.json"));
    if (!file) return null;
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      packageManager?: unknown;
      devEngines?: { packageManager?: unknown };
    };
    const scripts =
      parsed.scripts !== null && typeof parsed.scripts === "object"
        ? Object.keys(parsed.scripts)
        : [];
    // npm and pnpm run `node server.js` for `start` when there is no start
    // script and a server.js sits next to package.json.
    if (
      !scripts.includes("start") &&
      resolveFileInside(root, path.posix.join(dir, "server.js"))
    ) {
      scripts.push("start");
    }
    return {
      scripts,
      dependencies: [
        ...Object.keys(parsed.dependencies ?? {}),
        ...Object.keys(parsed.devDependencies ?? {}),
      ],
      packageManager: declaredManager(parsed),
    };
  } catch {
    return null;
  }
}

/**
 * The manager in `"packageManager": "pnpm@9.1.0+sha512..."`, or in npm's
 * `"devEngines": { "packageManager": { "name": "pnpm" } }`.
 */
function declaredManager(parsed: {
  packageManager?: unknown;
  devEngines?: { packageManager?: unknown };
}): string | undefined {
  if (typeof parsed.packageManager === "string") {
    return parsed.packageManager.split("@")[0]?.trim() || undefined;
  }
  const devEngine = parsed.devEngines?.packageManager;
  const first: unknown = Array.isArray(devEngine) ? devEngine[0] : devEngine;
  if (first !== null && typeof first === "object") {
    const name = (first as { name?: unknown }).name;
    if (typeof name === "string" && name.trim() !== "") return name.trim();
  }
  return undefined;
}

/**
 * The scripts and dependencies a config file in `dir` can reach: its own
 * package.json and every one above it. An agent may run a command from the
 * package directory or from the repository root, so a script defined in
 * either is not reported as missing.
 */
async function packageScriptsFor(
  root: string,
  dir: string,
  cache: Map<string, Promise<PackageScripts | null>>,
): Promise<PackageScripts | null> {
  const chain: Promise<PackageScripts | null>[] = [];
  let current = dir;
  for (;;) {
    let entry = cache.get(current);
    if (!entry) {
      entry = readPackageJson(root, current);
      cache.set(current, entry);
    }
    chain.push(entry);
    if (current === ".") break;
    current = path.posix.dirname(current);
  }

  const found = (await Promise.all(chain)).filter(
    (info): info is PackageScripts => info !== null,
  );
  if (found.length === 0) return null;
  return {
    scripts: Array.from(new Set(found.flatMap((info) => info.scripts))),
    dependencies: Array.from(new Set(found.flatMap((info) => info.dependencies))),
  };
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
    const parsed = isMarkdownSource(file.sourceType)
      ? parseMarkdown(content)
      : undefined;
    const agents = agentsFor(
      file.relativePath,
      file.sourceType,
      parsed?.frontmatter ?? {},
    );

    if (parsed) {
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
          // Normalizing lowercases, which turns `AKIA…` into text no secret
          // pattern recognizes. Mask first.
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

  const packageJsonCache = new Map<string, Promise<PackageScripts | null>>();
  const packageScripts = new Map<string, PackageScripts | null>();
  for (const file of discovered) {
    if (!isMarkdownSource(file.sourceType)) continue;
    packageScripts.set(
      file.relativePath,
      await packageScriptsFor(
        absoluteRoot,
        ownerDir(file.relativePath, file.sourceType),
        packageJsonCache,
      ),
    );
  }
  const packageJson = await packageScriptsFor(absoluteRoot, ".", packageJsonCache);
  const rootPackageJson = await packageJsonCache.get(".");

  return {
    repository: absoluteRoot,
    sources,
    instructions,
    totalEstimatedTokens,
    packageJsonScripts: packageJson?.scripts ?? null,
    packageJsonDependencies: packageJson?.dependencies ?? [],
    packageScripts,
    declaredPackageManager: rootPackageJson?.packageManager,
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
