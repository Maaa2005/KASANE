import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverConfigFiles } from "../../src/core/discover.js";

// Git refuses to commit paths containing a `.git` component, so fixtures are
// built in a temp dir at test time.
let root: string;

function write(relativePath: string, content = "# x\n"): void {
  const full = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

async function discovered(): Promise<string[]> {
  const files = await discoverConfigFiles(root);
  return files.map((file) => file.relativePath);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "kasane-discover-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("discoverConfigFiles nested checkouts", () => {
  it("skips a worktree whose .git is a file", async () => {
    write("AGENTS.md");
    write(".claude/worktrees/wt/AGENTS.md");
    write(".claude/worktrees/wt/.git", "gitdir: /elsewhere/.git/worktrees/wt\n");

    expect(await discovered()).toEqual(["AGENTS.md"]);
  });

  it("skips a nested directory with its own .git directory", async () => {
    write("AGENTS.md");
    write("vendor/sub/CLAUDE.md");
    write("vendor/sub/deep/AGENTS.md");
    fs.mkdirSync(path.join(root, "vendor/sub/.git"), { recursive: true });

    expect(await discovered()).toEqual(["AGENTS.md"]);
  });

  it("still finds files in a nested directory without .git", async () => {
    write("AGENTS.md");
    write("packages/a/AGENTS.md");

    expect(await discovered()).toEqual(["AGENTS.md", "packages/a/AGENTS.md"]);
  });

  it("honors .git/info/exclude", async () => {
    write("AGENTS.md");
    write("CLAUDE.local.md");
    write(".git/info/exclude", "CLAUDE.local.md\n");

    expect(await discovered()).toEqual(["AGENTS.md"]);
  });

  it("finds root files when the root itself has a .git directory", async () => {
    write("AGENTS.md");
    write("CLAUDE.md");
    write(".git/HEAD", "ref: refs/heads/main\n");

    expect(await discovered()).toEqual(["AGENTS.md", "CLAUDE.md"]);
  });
});
