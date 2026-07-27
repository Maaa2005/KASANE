import { describe, expect, it } from "vitest";
import { extractMentionedManagers } from "../../src/utils/commands.js";

describe("extractMentionedManagers", () => {
  it("returns the manager an instruction tells the agent to use", () => {
    expect(extractMentionedManagers("Use pnpm for scripts.")).toEqual(["pnpm"]);
  });

  it("ignores a manager named only to forbid it", () => {
    expect(extractMentionedManagers("Do not use npm; use pnpm.")).toEqual([
      "pnpm",
    ]);
  });

  it("ignores the rejected side of an 'instead of' instruction", () => {
    expect(extractMentionedManagers("Use pnpm instead of npm.")).toEqual([
      "pnpm",
    ]);
  });

  it("returns nothing when every mention is negated", () => {
    expect(extractMentionedManagers("Never use yarn in this repo.")).toEqual([]);
  });
});
