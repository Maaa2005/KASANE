import type { Command } from "commander";
import { analyzeRepository } from "../../core/analyze.js";
import { renderText } from "../../reporters/text.js";
import { renderJson } from "../../reporters/json.js";
import type { Severity } from "../../core/types.js";

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  warning: 1,
  error: 2,
};

interface InspectOptions {
  root: string;
  format: "text" | "json";
  failOn?: Severity;
  includeContent?: boolean;
}

export function registerInspectCommand(program: Command): void {
  program
    .command("inspect")
    .description("Analyze the repository and report detected AI agent context")
    .option("--root <path>", "repository root to analyze", ".")
    .option("--format <format>", "output format: text or json", "text")
    .option(
      "--fail-on <severity>",
      "exit with code 1 if a diagnostic at or above this severity is found (warning|error)",
    )
    .option(
      "--include-content",
      "include the full text of each config file in JSON output",
      false,
    )
    .action(async (options: InspectOptions) => {
      if (options.format !== "text" && options.format !== "json") {
        console.error(
          `Invalid --format value: ${options.format} (expected text or json)`,
        );
        process.exitCode = 2;
        return;
      }

      if (
        options.failOn !== undefined &&
        options.failOn !== "warning" &&
        options.failOn !== "error"
      ) {
        console.error(
          `Invalid --fail-on value: ${options.failOn} (expected warning or error)`,
        );
        process.exitCode = 2;
        return;
      }

      let result;
      try {
        result = await analyzeRepository(options.root);
      } catch (err) {
        console.error(
          `Failed to analyze repository: ${(err as Error).message}`,
        );
        process.exitCode = 3;
        return;
      }

      if (options.format === "json") {
        console.log(
          renderJson(result, { includeContent: options.includeContent }),
        );
      } else {
        console.log(renderText(result));
      }

      if (options.failOn) {
        const threshold = SEVERITY_RANK[options.failOn];
        const hasFailure = result.diagnostics.some(
          (diagnostic) => SEVERITY_RANK[diagnostic.severity] >= threshold,
        );
        if (hasFailure) {
          process.exitCode = 1;
        }
      }
    });
}
