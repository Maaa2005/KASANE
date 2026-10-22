import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAnalysisContext, runDiagnostics } from "../../src/core/analyze.js";
import { discoverConfigFiles } from "../../src/core/discover.js";
import { resolveEffectiveContext } from "../../src/core/resolver.js";

// Creating symlinks on Windows needs extra privileges, so these run on posix.
const posixIt = it.skipIf(process.platform === "win32");

let root: string;
let outside: string;

function write(relativePath: string, content = "# x\n"): void {
  const full = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function link(target: string, relativePath: string): void {
  fs.symlinkSync(target, path.join(root, relativePath));
}

async function discovered() {
  return (await discoverConfigFiles(root)).map((file) => ({
    path: file.relativePath,
    linkTarget: file.linkTarget,
  }));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "kasane-links-"));
  outside = fs.mkdtempSync(path.join(os.tmpdir(), "kasane-outside-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

describe("symlinked config files", () => {
  posixIt("discovers CLAUDE.md that links to AGENTS.md", async () => {
    write("AGENTS.md");
    link("AGENTS.md", "CLAUDE.md");

    expect(await discovered()).toEqual([
      { path: "AGENTS.md", linkTarget: undefined },
      { path: "CLAUDE.md", linkTarget: "AGENTS.md" },
    ]);
  });

  posixIt("skips a config file that links outside the repository", async () => {
    fs.writeFileSync(path.join(outside, "notes.md"), "# private\n");
    write("AGENTS.md");
    link(path.join(outside, "notes.md"), "CLAUDE.md");

    expect(await discovered()).toEqual([
      { path: "AGENTS.md", linkTarget: undefined },
    ]);
  });

  posixIt("does not report a linked file's findings twice", async () => {
    write(
      "AGENTS.md",
      "- Read /Users/alice/notes.md before starting.\n- Use pnpm.\n",
    );
    link("AGENTS.md", "CLAUDE.md");

    const context = await buildAnalysisContext(root);
    const diagnostics = await runDiagnostics(context);

    expect(diagnostics.map((d) => [d.ruleId, d.source?.relativePath])).toEqual([
      ["KASANE006", "AGENTS.md"],
    ]);
    expect(context.totalEstimatedTokens).toBe(
      context.sources.find((s) => s.relativePath === "AGENTS.md")
        ?.estimatedTokens,
    );
  });

  posixIt("shows the linked file's findings to the agent reading the link", async () => {
    write("AGENTS.md", "- Read /Users/alice/notes.md before starting.\n");
    link("AGENTS.md", "CLAUDE.md");

    const context = await buildAnalysisContext(root);
    const diagnostics = await runDiagnostics(context);
    const effective = resolveEffectiveContext(context, diagnostics, {
      agent: "claude",
    });

    expect(effective.sources.map((s) => s.relativePath)).toEqual(["CLAUDE.md"]);
    expect(effective.diagnostics.map((d) => d.ruleId)).toEqual(["KASANE006"]);
  });
});

describe("ignore files and package.json", () => {
  posixIt("does not read a .gitignore that links outside the repository", async () => {
    fs.writeFileSync(path.join(outside, "ignore"), "AGENTS.md\n");
    write("AGENTS.md");
    link(path.join(outside, "ignore"), ".gitignore");

    expect((await discovered()).map((f) => f.path)).toEqual(["AGENTS.md"]);
  });

  posixIt("does not hang on a .gitignore that links to a device", async () => {
    write("AGENTS.md");
    link("/dev/zero", ".gitignore");

    expect((await discovered()).map((f) => f.path)).toEqual(["AGENTS.md"]);
  }, 5000);

  posixIt("does not read a package.json that links outside the repository", async () => {
    fs.writeFileSync(
      path.join(outside, "package.json"),
      JSON.stringify({ scripts: { secret: "echo" } }),
    );
    write("AGENTS.md");
    link(path.join(outside, "package.json"), "package.json");

    const context = await buildAnalysisContext(root);

    expect(context.packageJsonScripts).toBeNull();
  });
});

describe("CLAUDE.local.md", () => {
  it("is analyzed even though it is gitignored", async () => {
    write("CLAUDE.local.md");
    write(".gitignore", "CLAUDE.local.md\n");

    expect((await discovered()).map((f) => f.path)).toEqual(["CLAUDE.local.md"]);
  });

  it("is skipped when its whole directory is ignored", async () => {
    write("CLAUDE.md");
    write("vendor/CLAUDE.local.md");
    write(".gitignore", "vendor/\n");

    expect((await discovered()).map((f) => f.path)).toEqual(["CLAUDE.md"]);
  });
});
