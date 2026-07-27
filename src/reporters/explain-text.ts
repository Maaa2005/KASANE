import type { AgentType, EffectiveContext } from "../core/types.js";
import { redactSecrets } from "../utils/secrets.js";

const AGENT_LABELS: Record<AgentType, string> = {
  codex: "Codex",
  claude: "Claude Code",
  cursor: "Cursor",
  gemini: "Gemini",
  copilot: "GitHub Copilot",
};

export interface RenderExplainOptions {
  showContent?: boolean;
}

export function renderExplainText(
  effective: EffectiveContext,
  options: RenderExplainOptions = {},
): string {
  const lines: string[] = [];

  lines.push(`Effective context for ${AGENT_LABELS[effective.agent]}`);
  lines.push("");

  if (effective.targetPath) {
    lines.push("Target:");
    lines.push(`  ${effective.targetPath}`);
    lines.push("");
  }

  lines.push("Sources:");
  if (effective.sources.length === 0) {
    lines.push("  (none)");
  } else {
    effective.sources.forEach((source, index) => {
      lines.push(`  ${index + 1}. ${source.relativePath}`);
    });
  }
  lines.push("");

  lines.push("Estimated tokens:");
  lines.push(`  ${effective.estimatedTokens}`);
  lines.push("");

  const brokenReferences = effective.diagnostics.filter(
    (d) => d.ruleId === "KASANE002",
  );
  const otherDiagnostics = effective.diagnostics.filter(
    (d) => d.ruleId !== "KASANE002",
  );

  if (otherDiagnostics.length > 0) {
    lines.push("Diagnostics:");
    for (const diagnostic of otherDiagnostics) {
      const location = diagnostic.source
        ? `${diagnostic.source.relativePath}${
            diagnostic.source.lineStart !== undefined
              ? `:${diagnostic.source.lineStart}`
              : ""
          }`
        : "(repository)";
      lines.push(`  [${diagnostic.severity}] ${diagnostic.ruleId} ${location}`);
      lines.push(`    ${diagnostic.message}`);
    }
    lines.push("");
  }

  if (brokenReferences.length > 0) {
    lines.push("Broken references:");
    for (const diagnostic of brokenReferences) {
      lines.push(`  ${diagnostic.message}`);
    }
    lines.push("");
  }

  if (options.showContent) {
    lines.push("Content:");
    for (const instruction of effective.instructions) {
      lines.push(
        `  ${instruction.source.relativePath}:${instruction.source.lineStart}`,
      );
      lines.push(`    ${instruction.content}`);
    }
    lines.push("");
  }

  return redactSecrets(lines.join("\n").trimEnd());
}
