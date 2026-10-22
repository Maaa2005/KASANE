import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAnalysisContext } from "../../../src/core/analyze.js";
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

  it("does not flag a dependency's binary run through pnpm or yarn", async () => {
    const context = makeContext({
      packageJsonScripts: ["build"],
      packageJsonDependencies: ["typescript", "vitest"],
      instructions: [
        makeInstruction({
          relativePath: "AGENTS.md",
          content: "Type-check with `pnpm tsc --noEmit` and test with `yarn vitest`.",
        }),
      ],
    });

    expect(await missingScriptRule.run(context)).toEqual([]);
  });

  it("still flags a binary name run with npm run, which only runs scripts", async () => {
    const context = makeContext({
      packageJsonScripts: ["build"],
      packageJsonDependencies: ["typescript"],
      instructions: [
        makeInstruction({ relativePath: "AGENTS.md", content: "Run `npm run tsc`." }),
      ],
    });

    expect((await missingScriptRule.run(context)).map((d) => d.metadata?.script)).toEqual([
      "tsc",
    ]);
  });

  it("flags a bare pnpm script that is neither a script nor a binary", async () => {
    const context = makeContext({
      packageJsonScripts: ["build"],
      packageJsonDependencies: ["typescript"],
      instructions: [
        makeInstruction({ relativePath: "AGENTS.md", content: "Run `pnpm buildx`." }),
      ],
    });

    expect(await missingScriptRule.run(context)).toHaveLength(1);
  });
});

describe("missingScriptRule in a monorepo", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  function makeRepo(files: Record<string, string>): string {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "kasane-missing-script-"));
    for (const [relativePath, content] of Object.entries(files)) {
      const file = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    return root;
  }

  const packageJson = (scripts: Record<string, string>) => JSON.stringify({ scripts });

  it("checks a nested config file against its own package.json and the root one", async () => {
    const repo = makeRepo({
      "package.json": packageJson({ lint: "eslint ." }),
      "packages/web/package.json": packageJson({ dev: "vite" }),
      "packages/web/AGENTS.md": "- Run `npm run dev`, `npm run lint` and `npm run deploy`.\n",
    });

    const diagnostics = await missingScriptRule.run(await buildAnalysisContext(repo));

    expect(diagnostics.map((d) => d.metadata?.script)).toEqual(["deploy"]);
  });

  it("checks a nested config file without a root package.json", async () => {
    const repo = makeRepo({
      "app/package.json": packageJson({ dev: "vite" }),
      "app/CLAUDE.md": "- Run `npm run dev` or `npm run devx`.\n",
    });

    const diagnostics = await missingScriptRule.run(await buildAnalysisContext(repo));

    expect(diagnostics.map((d) => d.metadata?.script)).toEqual(["devx"]);
  });

  it("treats a server.js next to package.json as the start script", async () => {
    const repo = makeRepo({
      "package.json": packageJson({ build: "tsc" }),
      "server.js": "",
      "AGENTS.md": "- Start the app with `npm start`.\n",
    });

    expect(await missingScriptRule.run(await buildAnalysisContext(repo))).toEqual([]);
  });
});
