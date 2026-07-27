export type AgentType = "codex" | "claude" | "cursor" | "gemini" | "copilot";

export type SourceType =
  | "agents"
  | "claude"
  | "cursor"
  | "gemini"
  | "copilot"
  | "mcp";

export interface ContextSource {
  id: string;
  filePath: string;
  relativePath: string;
  sourceType: SourceType;
  agents: AgentType[];
  content: string;
  estimatedTokens: number;
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
  };
  content: string;
  normalizedContent: string;
  estimatedTokens: number;
  references: string[];
}

export interface AnalysisContext {
  repository: string;
  sources: ContextSource[];
  instructions: ContextInstruction[];
  totalEstimatedTokens: number;
  packageJsonScripts: string[] | null;
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
