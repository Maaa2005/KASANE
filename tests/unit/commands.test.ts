import { describe, expect, it } from "vitest";
import {
  extractMentionedManagers,
  extractPackageManagerCommands,
  isDependencyBinary,
} from "../../src/utils/commands.js";

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

  it.each([
    ["Do not use `npm`; use `pnpm`.", ["pnpm"]],
    ["Use `pnpm` instead of `npm`.", ["pnpm"]],
    ["Don’t use **yarn**.", []],
    ["Install with `pnpm install` (not `npm install`).", ["pnpm"]],
    ["Never run `npm install`.", []],
    ["Use pnpm, not npm or yarn.", ["pnpm"]],
    ["Do not use npm, yarn, or bun.", []],
    ["Avoid npm and yarn.", []],
    ["npm is not allowed; use pnpm.", ["pnpm"]],
    ["npm and yarn are forbidden.", []],
    ["Switch from npm to pnpm.", ["pnpm"]],
  ])("ignores every manager a negation names: %j", (text, expected) => {
    expect(extractMentionedManagers(text)).toEqual(expected);
  });

  it("keeps the manager after a comma that ends the negated list", () => {
    expect(extractMentionedManagers("Don't use npm, pnpm is required.")).toEqual(["pnpm"]);
  });

  it.each([
    ["Publish the package to npm with `pnpm publish`.", ["pnpm"]],
    ["This package is published on npm.", []],
    ["Add an npm script for it and run it with pnpm.", ["pnpm"]],
    ["Released to the npm registry.", []],
  ])("ignores npm as the registry rather than the CLI: %j", (text, expected) => {
    expect(extractMentionedManagers(text)).toEqual(expected);
  });

  it.each([
    ["Run `npm install`.", ["npm"]],
    ["Use **npm**.", ["npm"]],
    ["Move to npm.", ["npm"]],
    ["Publishing to npm: run `npm publish`.", ["npm"]],
  ])("still returns a manager the text tells the agent to run: %j", (text, expected) => {
    expect(extractMentionedManagers(text)).toEqual(expected);
  });
});

const scripts = (text: string) =>
  extractPackageManagerCommands(text).map((command) => command.script);

describe("extractPackageManagerCommands", () => {
  it.each([
    "Run `pnpm run --filter web build`.",
    "Run `pnpm -F web build`.",
    "Run `pnpm --dir web dev`.",
    "Run `npm run build --workspace web`.",
    "Run `npm run lint --if-present`.",
    "Run `cd web && pnpm build`.",
  ])("skips a command that runs another package's script: %j", (text) => {
    expect(scripts(text)).toEqual([]);
  });

  it.each([
    "Run `bun run index.ts`.",
    "Run `bun run ./scripts/seed`.",
  ])("skips a file run with bun: %j", (text) => {
    expect(scripts(text)).toEqual([]);
  });

  it.each([
    "Use npm run for scripts.",
    "Prefer npm run to npx.",
    "Run `npm run <script>`.",
  ])("does not read a word about the command as a script: %j", (text) => {
    expect(scripts(text)).toEqual([]);
  });

  it("drops punctuation that ends the sentence", () => {
    expect(scripts("Before committing, run npm run build.")).toEqual(["build"]);
  });

  it("reads the script after a flag such as --silent", () => {
    expect(scripts("Run `npm --silent run missing`.")).toEqual(["missing"]);
  });

  it("reads npm's test and start aliases but not restart", () => {
    expect(scripts("Run `npm test`, `npm t` and `npm start`; never `npm restart`.")).toEqual([
      "test",
      "test",
      "start",
    ]);
  });

  it("reads every command joined by a shell operator", () => {
    expect(scripts("Run `pnpm install && pnpm lint; pnpm test`.")).toEqual([
      "lint",
      "test",
    ]);
  });

  it("marks which managers fall back to a dependency's binary", () => {
    const runsBinaries = extractPackageManagerCommands(
      "Run `npm run a`, `pnpm run b`, `pnpm c`, `yarn d`, `yarn run e` and `bun run f`.",
    ).map((command) => [command.script, command.runsBinaries]);

    expect(runsBinaries).toEqual([
      ["a", false],
      ["b", false],
      ["c", true],
      ["d", true],
      ["e", true],
      ["f", true],
    ]);
  });
});

describe("isDependencyBinary", () => {
  it("matches a binary named after its package", () => {
    expect(isDependencyBinary("eslint", new Set(["eslint"]))).toBe(true);
  });

  it("matches a binary installed by a differently named package", () => {
    expect(isDependencyBinary("tsc", new Set(["typescript"]))).toBe(true);
  });

  it("does not match a word that is only part of a package name", () => {
    expect(isDependencyBinary("test", new Set(["@playwright/test"]))).toBe(false);
  });
});
