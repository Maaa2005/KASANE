import { describe, expect, it } from "vitest";
import { absolutePathRule } from "../../../src/rules/absolute-path.js";
import { makeContext, makeInstruction } from "../../helpers/context.js";

describe("absolutePathRule (KASANE006)", () => {
  it("flags a Unix absolute path", async () => {
    const context = makeContext({
      instructions: [
        makeInstruction({
          relativePath: "AGENTS.md",
          content: "See /Users/masashi/dev/notes.md for context.",
        }),
      ],
    });

    const diagnostics = await absolutePathRule.run(context);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ ruleId: "KASANE006", severity: "warning" });
  });

  it("flags a path under /root", async () => {
    const context = makeContext({
      instructions: [
        makeInstruction({
          relativePath: "AGENTS.md",
          content: "Imported from /root/.claude/CLAUDE.md on the VM.",
        }),
      ],
    });

    expect(await absolutePathRule.run(context)).toHaveLength(1);
  });

  it("does not flag a relative path", async () => {
    const context = makeContext({
      instructions: [
        makeInstruction({ relativePath: "AGENTS.md", content: "See docs/notes.md for context." }),
      ],
    });

    expect(await absolutePathRule.run(context)).toEqual([]);
  });
});
