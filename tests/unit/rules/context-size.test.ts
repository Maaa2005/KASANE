import { describe, expect, it } from "vitest";
import { contextSizeRule } from "../../../src/rules/context-size.js";
import { makeContext } from "../../helpers/context.js";

describe("contextSizeRule (KASANE005)", () => {
  it("flags a repository whose total estimated tokens exceed the threshold", async () => {
    const context = makeContext({ totalEstimatedTokens: 9000 });

    const diagnostics = await contextSizeRule.run(context);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ ruleId: "KASANE005", severity: "warning" });
  });

  it("flags an individual source file whose estimated tokens exceed the threshold", async () => {
    const context = makeContext({
      totalEstimatedTokens: 5000,
      sources: [
        {
          id: "AGENTS.md",
          filePath: "/repo/AGENTS.md",
          relativePath: "AGENTS.md",
          sourceType: "agents",
          agents: ["codex"],
          content: "x".repeat(100),
          estimatedTokens: 5000,
        },
      ],
    });

    const diagnostics = await contextSizeRule.run(context);

    expect(diagnostics.some((d) => d.source?.relativePath === "AGENTS.md")).toBe(true);
  });

  it("does not flag a small repository", async () => {
    const context = makeContext({ totalEstimatedTokens: 100 });

    expect(await contextSizeRule.run(context)).toEqual([]);
  });
});
