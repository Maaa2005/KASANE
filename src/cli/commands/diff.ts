import type { Command } from "commander";
import { buildAnalysisContext, runDiagnostics } from "../../core/analyze.js";
import { computeDiff } from "../../core/differ.js";
import { renderDiffText } from "../../reporters/diff-text.js";
import { renderJson } from "../../reporters/json.js";
import type { AgentType } from "../../core/types.js";

const VALID_AGENTS: AgentType[] = [
  "codex",
  "claude",
  "cursor",
  "gemini",
  "copilot",
];

interface DiffOptions {
  agents?: string;
  root: string;
  path?: string;
  format: "text" | "json";
  includeContent?: boolean;
}

export function registerDiffCommand(program: Command): void {
  program
    .command("diff")
    .description("Show the context difference between multiple agents")
    .option(
      "--agents <agents>",
      `comma-separated list of agents to compare (${VALID_AGENTS.join("|")})`,
    )
    .option("--path <path>", "limit the comparison to a specific file")
    .option("--root <path>", "repository root to analyze", ".")
    .option("--format <format>", "output format: text or json", "text")
    .option(
      "--include-content",
      "include the full text of each config file in JSON output",
      false,
    )
    .action(async (options: DiffOptions) => {
      if (options.agents === undefined) {
        console.error(
          `Missing required option --agents (expected a comma-separated list from ${VALID_AGENTS.join(", ")})`,
        );
        process.exitCode = 2;
        return;
      }

      const agents = options.agents.split(",").map((agent) => agent.trim());
      if (agents.length < 2) {
        console.error("--agents requires at least two agents to compare");
        process.exitCode = 2;
        return;
      }

      const invalidAgent = agents.find(
        (agent) => !VALID_AGENTS.includes(agent as AgentType),
      );
      if (invalidAgent !== undefined) {
        console.error(
          `Invalid --agents value: ${invalidAgent} (expected one of ${VALID_AGENTS.join(", ")})`,
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

      let diff;
      try {
        const context = await buildAnalysisContext(options.root);
        const diagnostics = await runDiagnostics(context);
        diff = computeDiff(context, diagnostics, {
          agents: agents as AgentType[],
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
          renderJson(diff, { includeContent: options.includeContent }),
        );
      } else {
        console.log(renderDiffText(diff));
      }
    });
}
