import { describe, expect, it } from "vitest";
import { possibleSecretRule } from "../../../src/rules/possible-secret.js";
import { makeContext, makeSource } from "../../helpers/context.js";

// Not a real credential: the shape matches the KASANE007 pattern only.
const SECRET = "sk-abcdefghijklmnop1234567890";

describe("possibleSecretRule (KASANE007)", () => {
  it("flags a string matching a known secret pattern", async () => {
    const context = makeContext({
      sources: [
        makeSource({
          relativePath: "AGENTS.md",
          content: `API key: ${SECRET}\n`,
        }),
      ],
    });

    const diagnostics = await possibleSecretRule.run(context);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ ruleId: "KASANE007", severity: "error" });
  });

  it("never includes the full secret value in the diagnostic message", async () => {
    const context = makeContext({
      sources: [
        makeSource({ relativePath: "AGENTS.md", content: `API key: ${SECRET}\n` }),
      ],
    });

    const [diagnostic] = await possibleSecretRule.run(context);

    expect(diagnostic.message).not.toContain(SECRET);
  });

  it("reports the line the secret is on", async () => {
    const context = makeContext({
      sources: [
        makeSource({
          relativePath: "AGENTS.md",
          content: `# Rules\n\nRun tests.\n\nAPI key: ${SECRET}\n`,
        }),
      ],
    });

    const [diagnostic] = await possibleSecretRule.run(context);

    expect(diagnostic.source?.lineStart).toBe(5);
  });

  it("flags secrets in a non-Markdown source such as MCP configuration", async () => {
    const context = makeContext({
      sources: [
        makeSource({
          relativePath: ".mcp.json",
          sourceType: "mcp",
          agents: [],
          content: `{\n  "env": { "API_KEY": "${SECRET}" }\n}\n`,
        }),
      ],
    });

    const diagnostics = await possibleSecretRule.run(context);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].source?.relativePath).toBe(".mcp.json");
  });

  it("does not flag ordinary text", async () => {
    const context = makeContext({
      sources: [
        makeSource({
          relativePath: "AGENTS.md",
          content: "Run tests before commit.\n",
        }),
      ],
    });

    expect(await possibleSecretRule.run(context)).toEqual([]);
  });
});
