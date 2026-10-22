import { Command, CommanderError } from "commander";
import { registerInspectCommand } from "./commands/inspect.js";
import { registerExplainCommand } from "./commands/explain.js";
import { registerDiffCommand } from "./commands/diff.js";
import { KASANE_VERSION } from "../version.js";

const program = new Command();

program
  .name("kasane")
  .description("Lint, explain, and compare context for AI coding agents.")
  .version(KASANE_VERSION)
  // Exit code 1 means "findings at --fail-on"; usage errors get 2 instead
  // of commander's default 1 so CI can tell them apart.
  .exitOverride();

registerInspectCommand(program);
registerExplainCommand(program);
registerDiffCommand(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof CommanderError) {
    // commander has already printed the message, help or version.
    process.exitCode = err.exitCode === 0 ? 0 : 2;
    return;
  }
  console.error(`Unexpected error: ${(err as Error).message}`);
  process.exitCode = 4;
});
