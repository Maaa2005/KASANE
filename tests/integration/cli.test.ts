import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..", "..");
const fixtureRoot = path.join(__dirname, "..", "fixtures", "scoped-repo");

// Runs the CLI from source; the build is not available when tests run in CI.
function kasane(...args: string[]): { status: number | null; stderr: string } {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", path.join(projectRoot, "src", "cli", "index.ts"), ...args],
    { cwd: projectRoot, encoding: "utf8" },
  );
  return { status: result.status, stderr: result.stderr };
}

describe("CLI exit codes", () => {
  it.each([
    [["inspect", "--bogus"], "unknown option"],
    [["nosuchcommand"], "unknown command"],
    [["inspect", "--root", path.join(fixtureRoot, "missing")], "--root does not exist"],
    [["inspect", "--root", path.join(fixtureRoot, "CLAUDE.md")], "--root is not a directory"],
    [["explain", "--agent", "claude", "--root", fixtureRoot, "--path", "../x.ts"], "outside the repository"],
    [["diff", "--agents", "claude,cursor", "--root", fixtureRoot, "--path", ".."], "outside the repository"],
  ])("exits 2 for a usage error: %j", (args, message) => {
    const result = kasane(...args);
    expect(result.stderr).toContain(message);
    expect(result.status).toBe(2);
  });

  it("exits 0 for --version and for a directory --path", () => {
    expect(kasane("--version").status).toBe(0);
    expect(kasane("explain", "--agent", "claude", "--root", fixtureRoot, "--path", "src").status).toBe(0);
  });
}, 60_000);
