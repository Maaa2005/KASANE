import { describe, expect, it } from "vitest";
import { missingScriptRule } from "../../../src/rules/missing-script.js";
import { makeContext, makeInstruction } from "../../helpers/context.js";

describe("missingScriptRule (KASANE003)", () => {
  it("flags a referenced script that is not in package.json", async () => {
    const context = makeContext({
      packageJsonScripts: ["build", "test"],
      instructions: [
        makeInstruction({ relativePath: "AGENTS.md", content: "Run `npm run buildx` before deploying." }),
      ],
    });

    const diagnostics = await missingScriptRule.run(context);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ ruleId: "KASANE003", severity: "error" });
  });

  it("does not flag a script that exists in package.json", async () => {
    const context = makeContext({
      packageJsonScripts: ["build", "test"],
      instructions: [
        makeInstruction({ relativePath: "AGENTS.md", content: "Run `npm run build` before deploying." }),
      ],
    });

    expect(await missingScriptRule.run(context)).toEqual([]);
  });

  it("skips entirely when there is no package.json", async () => {
    const context = makeContext({
      packageJsonScripts: null,
      instructions: [
        makeInstruction({ relativePath: "AGENTS.md", content: "Run `npm run buildx` before deploying." }),
      ],
    });

    expect(await missingScriptRule.run(context)).toEqual([]);
  });

  it("does not flag ordinary prose mentioning a package manager", async () => {
    const context = makeContext({
      packageJsonScripts: ["build", "test"],
      instructions: [
        makeInstruction({ relativePath: "AGENTS.md", content: "Use pnpm for all package management commands." }),
      ],
    });

    expect(await missingScriptRule.run(context)).toEqual([]);
  });
});
