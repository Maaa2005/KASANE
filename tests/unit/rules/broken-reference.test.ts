import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAnalysisContext } from "../../../src/core/analyze.js";
import { brokenReferenceRule } from "../../../src/rules/broken-reference.js";

describe("brokenReferenceRule (KASANE002)", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  function makeRepo(files: Record<string, string>): string {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "kasane-broken-reference-"));
    for (const [relativePath, content] of Object.entries(files)) {
      const file = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    return root;
  }

  async function brokenReferences(files: Record<string, string>) {
    const diagnostics = await brokenReferenceRule.run(
      await buildAnalysisContext(makeRepo(files)),
    );
    return diagnostics.map((d) => [d.metadata?.reference, d.source?.lineStart]);
  }

  it("checks the target of a reference-style link where it is used", async () => {
    expect(
      await brokenReferences({
        "AGENTS.md": [
          "Read [the guide][guide] before editing.",
          "",
          "Follow [the style][] too.",
          "",
          "[guide]: docs/missing-guide.md",
          "[the style]: docs/style.md",
          "",
        ].join("\n"),
        "docs/style.md": "# Style\n",
      }),
    ).toEqual([["docs/missing-guide.md", 1]]);
  });

  it("resolves a reference against the config file's directory as well as the root", async () => {
    expect(
      await brokenReferences({
        "packages/web/CLAUDE.md": "See [notes](docs/notes.md) and [root](docs/root.md).\n",
        "packages/web/docs/notes.md": "# Notes\n",
        "docs/root.md": "# Root\n",
      }),
    ).toEqual([]);
  });
});
