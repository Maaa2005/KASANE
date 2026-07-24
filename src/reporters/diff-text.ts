import type { AgentType, DiffResult } from "../core/types.js";

const AGENT_LABELS: Record<AgentType, string> = {
  codex: "Codex",
  claude: "Claude Code",
  cursor: "Cursor",
  gemini: "Gemini",
  copilot: "GitHub Copilot",
};

export function renderDiffText(diff: DiffResult): string {
  const lines: string[] = [];

  lines.push("Context difference");
  lines.push("");

  if (diff.targetPath) {
    lines.push("Target:");
    lines.push(`  ${diff.targetPath}`);
    lines.push("");
  }

  for (const agent of diff.agents) {
    const onlyIn = diff.onlyIn[agent] ?? [];
    lines.push(`${AGENT_LABELS[agent]} only:`);
    if (onlyIn.length === 0) {
      lines.push("  (none)");
    } else {
      for (const instruction of onlyIn) {
        lines.push(`  + ${instruction.content}`);
      }
    }
    lines.push("");
  }

  lines.push("Common:");
  if (diff.common.length === 0) {
    lines.push("  (none)");
  } else {
    for (const instruction of diff.common) {
      lines.push(`  ${instruction.content}`);
    }
  }
  lines.push("");

  if (diff.conflicts.length > 0) {
    lines.push("Conflicts:");
    for (const conflict of diff.conflicts) {
      lines.push(`  ${conflict.category}:`);
      for (const agent of diff.agents) {
        const value = conflict.values[agent];
        if (value) {
          lines.push(`    ${AGENT_LABELS[agent]}: ${value}`);
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
