import { Command } from "commander";
import { registerInspectCommand } from "./commands/inspect.js";
import { registerExplainCommand } from "./commands/explain.js";
import { registerDiffCommand } from "./commands/diff.js";
import { KASANE_VERSION } from "../version.js";

const program = new Command();

program
  .name("kasane")
  .description("Lint, explain, and compare context for AI coding agents.")
  .version(KASANE_VERSION);

registerInspectCommand(program);
registerExplainCommand(program);
registerDiffCommand(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(`Unexpected error: ${(err as Error).message}`);
  process.exitCode = 4;
});
