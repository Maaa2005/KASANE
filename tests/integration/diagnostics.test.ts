import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeRepository } from "../../src/core/analyze.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "..", "fixtures");

describe("analyzeRepository diagnostics", () => {
  it("detects duplicated instructions across files (KASANE001)", async () => {
    const result = await analyzeRepository(
      path.join(fixturesDir, "duplicate-instructions"),
    );

    expect(result.diagnostics.some((d) => d.ruleId === "KASANE001")).toBe(true);
  });

  it("detects a broken file reference (KASANE002)", async () => {
    const result = await analyzeRepository(
      path.join(fixturesDir, "broken-reference"),
    );

    expect(result.diagnostics.some((d) => d.ruleId === "KASANE002")).toBe(true);
  });

  it("detects a package manager mismatch against the lockfile (KASANE004)", async () => {
    const result = await analyzeRepository(
      path.join(fixturesDir, "mixed-package-manager"),
    );

    expect(result.diagnostics.some((d) => d.ruleId === "KASANE004")).toBe(true);
  });

  it("detects a possible secret and masks it in the message (KASANE007)", async () => {
    const result = await analyzeRepository(
      path.join(fixturesDir, "possible-secret"),
    );

    const diagnostic = result.diagnostics.find((d) => d.ruleId === "KASANE007");
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.message).not.toContain("sk-abcdefghijklmnop1234567890");
  });
});
