import { describe, expect, it } from "vitest";
import { possibleSecretRule } from "../../../src/rules/possible-secret.js";
import { makeContext, makeInstruction } from "../../helpers/context.js";

describe("possibleSecretRule (KASANE007)", () => {
  it("flags a string matching a known secret pattern", async () => {
    const context = makeContext({
      instructions: [
        makeInstruction({
          relativePath: "AGENTS.md",
          content: "API key: sk-abcdefghijklmnop1234567890",
        }),
      ],
    });

    const diagnostics = await possibleSecretRule.run(context);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ ruleId: "KASANE007", severity: "error" });
  });

  it("never includes the full secret value in the diagnostic message", async () => {
    const secret = "sk-abcdefghijklmnop1234567890";
    const context = makeContext({
      instructions: [
        makeInstruction({ relativePath: "AGENTS.md", content: `API key: ${secret}` }),
      ],
    });

    const [diagnostic] = await possibleSecretRule.run(context);

    expect(diagnostic.message).not.toContain(secret);
  });

  it("does not flag ordinary text", async () => {
    const context = makeContext({
      instructions: [
        makeInstruction({ relativePath: "AGENTS.md", content: "Run tests before commit." }),
      ],
    });

    expect(await possibleSecretRule.run(context)).toEqual([]);
  });
});
