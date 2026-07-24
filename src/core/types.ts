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
    value: string;
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

export interface DiffResult {
  targetPath?: string;
  agents: AgentType[];
  perAgent: Record<string, EffectiveContext>;
  onlyIn: Record<string, ContextInstruction[]>;
  common: ContextInstruction[];
  conflicts: DiffConflict[];
}
