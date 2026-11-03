export type AgentType = "codex" | "claude" | "cursor" | "gemini" | "copilot";

export type SourceType =
  | "agents"
  | "claude"
  /** A Claude Code rule in a `.claude/rules/` directory. */
  | "claude-rule"
  | "cursor"
  | "gemini"
  | "copilot"
  | "mcp"
  /** A file Claude Code reads only because a CLAUDE.md imports it. */
  | "import";

export interface ContextSource {
  id: string;
  filePath: string;
  relativePath: string;
  sourceType: SourceType;
  agents: AgentType[];
  content: string;
  estimatedTokens: number;
  /** Repository-relative path of the file this symlink resolves to. */
  linkTarget?: string;
}

export type Severity = "info" | "warning" | "error";

export interface Diagnostic {
  ruleId: string;
  severity: Severity;
  title: string;
  message: string;
  source?: {
    filePath: string;
    relativePath: string;
    lineStart?: number;
    lineEnd?: number;
  };
  relatedSources?: Array<{
    filePath: string;
    relativePath: string;
    lineStart?: number;
    lineEnd?: number;
  }>;
  metadata?: Record<string, unknown>;
}

export interface InspectSummary {
  sourceCount: number;
  instructionCount: number;
  estimatedTokens: number;
  diagnosticCount: Record<Severity, number>;
}

export interface InspectResult {
  version: string;
  repository: string;
  summary: InspectSummary;
  sources: ContextSource[];
  diagnostics: Diagnostic[];
}

export interface ContextInstruction {
  id: string;
  source: {
    filePath: string;
    relativePath: string;
    lineStart: number;
    lineEnd: number;
  };
  agents: AgentType[];
  scope: {
    type: "repository" | "directory" | "glob";
    /**
     * For "repository" this is `["."]`, for "directory" a single
     * repository-relative directory, and for "glob" one or more
     * repository-relative minimatch patterns (Cursor `globs` frontmatter
     * accepts both a scalar and a list, and each entry is kept intact so
     * extglob syntax such as `@(a|b)` survives).
     */
    patterns: string[];
    /**
     * Glob patterns also match dotfiles and dot-directories, as the
     * gitignore-style `paths` of a Claude Code rule do (`*.yml` matches
     * `.github/workflows/ci.yml`).
     */
    dot?: boolean;
  };
  content: string;
  normalizedContent: string;
  estimatedTokens: number;
  references: string[];
  /**
   * Set on a copy that reaches Claude Code through `@path` imports: the
   * CLAUDE.md whose imports load it, directly or through other imported
   * files. `source` is still the imported file, and `id` that of the
   * instruction there.
   */
  importedBy?: string;
  /**
   * The instruction is nothing but `@path` imports that KASANE follows, so
   * the files they name stand in for it in Claude Code's context.
   */
  importsOnly?: boolean;
}

export interface AnalysisContext {
  repository: string;
  sources: ContextSource[];
  instructions: ContextInstruction[];
  /**
   * What Claude Code loads through `@path` imports in its CLAUDE.md files:
   * a copy of each imported instruction, scoped like the file that imports
   * it. Kept apart from `instructions` so each file is linted once.
   */
  importedInstructions?: ContextInstruction[];
  /** Imported files that are not config files of their own. */
  importedSources?: ContextSource[];
  totalEstimatedTokens: number;
  packageJsonScripts: string[] | null;
  /** Names from dependencies and devDependencies of the root package.json. */
  packageJsonDependencies?: string[];
  /**
   * The scripts and dependencies a config file's commands run against, keyed
   * by its relative path: those of the nearest package.json at or above the
   * directory it belongs to, merged with every package.json above that. Null
   * when there is none. A path missing from the map uses the root fields.
   */
  packageScripts?: ReadonlyMap<string, PackageScripts | null>;
  /**
   * The package manager the root package.json declares in `packageManager`
   * (or `devEngines.packageManager`), e.g. "pnpm" for "pnpm@9.1.0".
   */
  declaredPackageManager?: string;
}

export interface PackageScripts {
  scripts: string[];
  dependencies: string[];
  packageManager?: string;
}

export interface DiagnosticRule {
  id: string;
  run(context: AnalysisContext): Promise<Diagnostic[]>;
}

export interface EffectiveContext {
  agent: AgentType;
  targetPath?: string;
  sources: ContextSource[];
  instructions: ContextInstruction[];
  diagnostics: Diagnostic[];
  estimatedTokens: number;
}

export interface DiffConflict {
  category: string;
  values: Partial<Record<AgentType, string>>;
}

export interface SharedInstruction {
  agents: AgentType[];
  instruction: ContextInstruction;
}

export interface DiffResult {
  targetPath?: string;
  agents: AgentType[];
  perAgent: Record<string, EffectiveContext>;
  /** Instructions that reach exactly one of the compared agents. */
  onlyIn: Record<string, ContextInstruction[]>;
  /** Instructions that reach every compared agent. */
  common: ContextInstruction[];
  /**
   * Instructions that reach more than one but not all of the compared
   * agents. Without this, a three-way comparison silently drops anything
   * two agents share.
   */
  sharedBy: SharedInstruction[];
  conflicts: DiffConflict[];
}
