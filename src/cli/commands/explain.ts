import type { Command } from "commander";
import { buildAnalysisContext, runDiagnostics } from "../../core/analyze.js";
import { resolveEffectiveContext } from "../../core/resolver.js";
import { renderExplainText } from "../../reporters/explain-text.js";
import { renderJson } from "../../reporters/json.js";
import type { AgentType } from "../../core/types.js";

const VALID_AGENTS: AgentType[] = [
  "codex",
  "claude",
  "cursor",
  "gemini",
  "copilot",
];

interface ExplainOptions {
  agent?: string;
  root: string;
  path?: string;
  format: "text" | "json";
  showContent?: boolean;
  includeContent?: boolean;
}

export function registerExplainCommand(program: Command): void {
  program
    .command("explain")
    .description("Show the effective context applied to a specific agent")
    .option(
      "--agent <agent>",
      `which agent to explain (${VALID_AGENTS.join("|")})`,
    )
    .option("--path <path>", "limit the explanation to a specific file")
    .option("--root <path>", "repository root to analyze", ".")
    .option("--format <format>", "output format: text or json", "text")
    .option("--show-content", "print the full content of applicable instructions", false)
    .option(
      "--include-content",
      "include the full text of each config file in JSON output",
      false,
    )
    .action(async (options: ExplainOptions) => {
      if (options.agent === undefined) {
        console.error(
          `Missing required option --agent (expected one of ${VALID_AGENTS.join(", ")})`,
        );
        process.exitCode = 2;
        return;
      }

      if (!VALID_AGENTS.includes(options.agent as AgentType)) {
        console.error(
          `Invalid --agent value: ${options.agent} (expected one of ${VALID_AGENTS.join(", ")})`,
        );
        process.exitCode = 2;
        return;
      }

      if (options.format !== "text" && options.format !== "json") {
        console.error(
          `Invalid --format value: ${options.format} (expected text or json)`,
        );
        process.exitCode = 2;
        return;
      }

      let effective;
      try {
        const context = await buildAnalysisContext(options.root);
        const diagnostics = await runDiagnostics(context);
        effective = resolveEffectiveContext(context, diagnostics, {
          agent: options.agent as AgentType,
          targetPath: options.path,
        });
      } catch (err) {
        console.error(
          `Failed to analyze repository: ${(err as Error).message}`,
        );
        process.exitCode = 3;
        return;
      }

      if (options.format === "json") {
        console.log(
          renderJson(effective, { includeContent: options.includeContent }),
        );
      } else {
        console.log(
          renderExplainText(effective, { showContent: options.showContent }),
        );
      }
    });
}
