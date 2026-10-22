import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAnalysisContext } from "../../../src/core/analyze.js";
import { packageManagerConflictRule } from "../../../src/rules/package-manager-conflict.js";

describe("packageManagerConflictRule (KASANE004)", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  function makeRepo(files: Record<string, string>): string {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "kasane-package-manager-"));
    for (const [relativePath, content] of Object.entries(files)) {
      const file = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    return root;
  }

  async function run(files: Record<string, string>) {
    return packageManagerConflictRule.run(await buildAnalysisContext(makeRepo(files)));
  }

  it("checks instructions against packageManager when no lockfile is committed", async () => {
    const diagnostics = await run({
      "package.json": JSON.stringify({ packageManager: "pnpm@9.12.0+sha512.abc" }),
      "AGENTS.md": "- Install dependencies with `yarn install`.\n",
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: "warning",
      title: "Package manager mismatch",
      metadata: { mentioned: "yarn", expected: "pnpm" },
    });
    expect(diagnostics[0].message).toContain('package.json "packageManager" declares "pnpm"');
  });

  it("reads npm's devEngines.packageManager", async () => {
    const diagnostics = await run({
      "package.json": JSON.stringify({ devEngines: { packageManager: { name: "bun" } } }),
      "AGENTS.md": "- Run `npm install`.\n",
    });

    expect(diagnostics.map((d) => d.metadata)).toEqual([{ mentioned: "npm", expected: "bun" }]);
  });

  it("reports a declaration that disagrees with the lockfile", async () => {
    const diagnostics = await run({
      "package.json": JSON.stringify({ packageManager: "yarn@4.5.0" }),
      "pnpm-lock.yaml": "",
      "AGENTS.md": "- Run `pnpm install`.\n",
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: "error",
      title: "Package manager declaration conflicts with lockfile",
      metadata: { declared: "yarn", lockfile: "pnpm" },
    });
  });

  it("lets the declaration pick between several lockfiles", async () => {
    const diagnostics = await run({
      "package.json": JSON.stringify({ packageManager: "pnpm@9.0.0" }),
      "pnpm-lock.yaml": "",
      "package-lock.json": "{}",
      "AGENTS.md": "- Run `pnpm install`.\n- Run `npm ci` in CI.\n",
    });

    expect(diagnostics.map((d) => d.title)).toEqual([
      "Conflicting package manager lockfiles",
      "Package manager mismatch",
    ]);
    expect(diagnostics[1].metadata).toEqual({ mentioned: "npm", expected: "pnpm" });
  });

  it("checks nothing without a lockfile or a declaration", async () => {
    expect(
      await run({
        "package.json": JSON.stringify({ name: "app" }),
        "AGENTS.md": "- Run `yarn install`.\n",
      }),
    ).toEqual([]);
  });

  it("ignores a declaration naming a tool it does not know", async () => {
    expect(
      await run({
        "package.json": JSON.stringify({ packageManager: "deno@2.0.0" }),
        "AGENTS.md": "- Run `npm install`.\n",
      }),
    ).toEqual([]);
  });
});
