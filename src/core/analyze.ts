import fs from "node:fs/promises";
import path from "node:path";
import { discoverConfigFiles } from "./discover.js";
import { parseMarkdown } from "../parsers/markdown.js";
import { estimateTokens } from "./tokenizer.js";
import { normalizeInstruction } from "../utils/normalize.js";
import { extractFileReferences } from "../utils/path.js";
import { duplicateInstructionRule } from "../rules/duplicate-instruction.js";
import { brokenReferenceRule } from "../rules/broken-reference.js";
import { missingScriptRule } from "../rules/missing-script.js";
import { packageManagerConflictRule } from "../rules/package-manager-conflict.js";
import { contextSizeRule } from "../rules/context-size.js";
import { absolutePathRule } from "../rules/absolute-path.js";
import { possibleSecretRule } from "../rules/possible-secret.js";
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

const PACKAGE_VERSION = "0.1.0";

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

function computeScope(
  relativePath: string,
  sourceType: SourceType,
  frontmatter: Record<string, unknown>,
): ContextInstruction["scope"] {
  if (sourceType === "cursor") {
    const globs = frontmatter.globs;
    if (
      Array.isArray(globs) &&
      globs.length > 0 &&
      globs.every((glob) => typeof glob === "string")
    ) {
      return { type: "glob", value: (globs as string[]).join("|") };
    }
  }

  const dir = path.posix.dirname(relativePath);
  if (dir === ".") {
    return { type: "repository", value: "." };
  }
  return { type: "directory", value: dir };
}

async function readPackageJsonScripts(root: string): Promise<string[] | null> {
  try {
    const raw = await fs.readFile(path.join(root, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
    return Object.keys(parsed.scripts ?? {});
  } catch {
    return null;
  }
}

export async function buildAnalysisContext(root: string): Promise<AnalysisContext> {
  const absoluteRoot = path.resolve(root);
  const discovered = await discoverConfigFiles(absoluteRoot);

  const sources: ContextSource[] = [];
  const instructions: ContextInstruction[] = [];

  for (const file of discovered) {
    const content = await fs.readFile(file.filePath, "utf8");
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
          normalizedContent: normalizeInstruction(instruction.content),
          estimatedTokens: estimateTokens(instruction.content),
          references: extractFileReferences(instruction.content),
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
    });
  }

  const totalEstimatedTokens = sources.reduce(
    (sum, source) => sum + source.estimatedTokens,
    0,
  );

  return {
    repository: absoluteRoot,
    sources,
    instructions,
    totalEstimatedTokens,
    packageJsonScripts: await readPackageJsonScripts(absoluteRoot),
  };
}

export async function runDiagnostics(
  context: AnalysisContext,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  for (const rule of RULES) {
    diagnostics.push(...(await rule.run(context)));
  }
  return diagnostics;
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
    version: PACKAGE_VERSION,
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
