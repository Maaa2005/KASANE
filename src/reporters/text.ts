import type { InspectResult } from "../core/types.js";
import { redactSecrets } from "../utils/secrets.js";

const SOURCE_TYPE_LABELS: Record<string, string> = {
  agents: "AGENTS.md",
  claude: "CLAUDE.md",
  cursor: "Cursor rule",
  gemini: "GEMINI.md",
  copilot: "Copilot instructions",
  mcp: "MCP server config",
};

export function renderText(result: InspectResult): string {
  const lines: string[] = [];

  lines.push("KASANE");
  lines.push("");
  lines.push("Repository:");
  lines.push(`  ${result.repository}`);
  lines.push("");

  lines.push("Detected:");
  if (result.sources.length === 0) {
    lines.push("  (no config files found)");
  } else {
    for (const source of result.sources) {
      const label = SOURCE_TYPE_LABELS[source.sourceType] ?? source.sourceType;
      lines.push(`  ✓ ${source.relativePath} (${label})`);
    }
  }
  lines.push("");

  lines.push("Context:");
  lines.push(`  ${result.summary.sourceCount} files`);
  lines.push(`  ${result.summary.estimatedTokens} estimated tokens`);
  lines.push(`  ${result.summary.instructionCount} instructions`);
  lines.push("");

  lines.push("Issues:");
  const { info, warning, error } = result.summary.diagnosticCount;
  if (info + warning + error === 0) {
    lines.push("  none");
  } else {
    lines.push(`  ${error} error(s), ${warning} warning(s), ${info} info`);
    lines.push("");
    for (const diagnostic of result.diagnostics) {
      const location = diagnostic.source
        ? `${diagnostic.source.relativePath}${
            diagnostic.source.lineStart !== undefined
              ? `:${diagnostic.source.lineStart}`
              : ""
          }`
        : "(repository)";
      lines.push(
        `  [${diagnostic.severity}] ${diagnostic.ruleId} ${location} — ${diagnostic.title}`,
      );
      lines.push(`    ${diagnostic.message}`);
    }
  }

  return redactSecrets(lines.join("\n"));
}
