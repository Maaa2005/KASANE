import { describe, expect, it } from "vitest";
import { duplicateInstructionRule } from "../../../src/rules/duplicate-instruction.js";
import { makeContext, makeInstruction } from "../../helpers/context.js";

describe("duplicateInstructionRule (KASANE001)", () => {
  it("flags the same instruction repeated across files", async () => {
    const context = makeContext({
      instructions: [
        makeInstruction({ relativePath: "AGENTS.md", content: "Run tests before commit." }),
        makeInstruction({ relativePath: "CLAUDE.md", content: "Run tests before commit." }),
      ],
    });

    const diagnostics = await duplicateInstructionRule.run(context);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ ruleId: "KASANE001", severity: "warning" });
  });

  it("does not flag a repeated instruction within a single file", async () => {
    const context = makeContext({
      instructions: [
        makeInstruction({ relativePath: "AGENTS.md", content: "Run tests." }),
        makeInstruction({ relativePath: "AGENTS.md", content: "Run tests." }),
      ],
    });

    expect(await duplicateInstructionRule.run(context)).toEqual([]);
  });

  it("does not flag distinct instructions", async () => {
    const context = makeContext({
      instructions: [
        makeInstruction({ relativePath: "AGENTS.md", content: "Run tests before commit." }),
        makeInstruction({ relativePath: "CLAUDE.md", content: "Use TypeScript strictly." }),
      ],
    });

    expect(await duplicateInstructionRule.run(context)).toEqual([]);
  });
});
