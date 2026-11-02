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

describe("extractMentionedManagers: npm in a pnpm or yarn repository", () => {
  it.each([
    "publish",
    "view",
    "audit",
    "pack",
    "version",
    "login",
    "whoami",
    "dist-tag",
    "deprecate",
    "logout",
    "token",
    "owner",
    "access",
    "adduser",
    "profile",
    "star",
  ])("ignores the npm-only subcommand `npm %s`", (subcommand) => {
    const text = `Run \`npm ${subcommand} foo\` when needed.`;

    expect(extractMentionedManagers(text, "pnpm")).toEqual([]);
    expect(extractMentionedManagers(text, "yarn")).toEqual([]);
  });

  it.each([
    "Release with `npm --registry=https://registry.npmjs.org publish`.",
    "Release with `npm --registry https://registry.npmjs.org publish`.",
    "Release with `npm --prefix packages/app --otp=123456 publish`.",
    "Release with `npm -w app publish`.",
    "Release with `npm --userconfig .npmrc --silent token list`.",
    "Run `npm --no-git-tag-version version patch`.",
    "Run `npm --registry=https://registry.npmjs.org token list`.",
  ])("skips options before an npm-only subcommand: %j", (text) => {
    expect(extractMentionedManagers(text, "pnpm")).toEqual([]);
  });

  it.each([
    "Run `npm --registry=https://registry.npmjs.org install`.",
    "Run `npm --prefix app run build`.",
  ])("still reports options before a regular npm command: %j", (text) => {
    expect(extractMentionedManagers(text, "pnpm")).toEqual(["npm"]);
  });

  it("ignores npm-only subcommands next to the manager in use", () => {
    expect(
      extractMentionedManagers("Install with `pnpm install`, then `npm publish`.", "pnpm"),
    ).toEqual(["pnpm"]);
  });

  it.each([
    "Run `npm install -g pnpm`.",
    "Run `npm i -g yarn` first.",
    "Install it with `npm install --global pnpm`.",
    "npm install pnpm -g",
    "Run `npm install pnpm --global=true`.",
    "Run `npm install --location=global pnpm`.",
    "Run `npm install --location global pnpm`.",
  ])("ignores a global install through npm: %j", (text) => {
    expect(extractMentionedManagers(text, "yarn")).toEqual([]);
  });

  it.each([
    "Run `npm install --global=false`.",
    "Run `npm install pkg --global-style`.",
    "Run `npm install --location=project`.",
    "Run `npm install --location=globalx`.",
  ])("does not treat a non-global install as global: %j", (text) => {
    expect(extractMentionedManagers(text, "yarn")).toEqual(["npm"]);
  });

  it.each([
    ["Requires Node 20 and npm 10.", []],
    ["Requires Node.js >= 20 and npm >= 10 for the build.", []],
    ["Needs npm 10 or newer.", []],
    ["Node 20 / npm 10 are required.", []],
    ["Requires Node 20 and npm 10, and use pnpm.", ["pnpm"]],
  ])("ignores an npm version requirement: %j", (text, expected) => {
    expect(extractMentionedManagers(text, "pnpm")).toEqual(expected);
  });

  it.each([
    ["Run `npm install` to set up.", ["npm"]],
    ["Use `npm run build`.", ["npm"]],
    ["Run `npm install` (non-global) then `npm publish`.", ["npm"]],
    ["Run `npm install -g pnpm`, then `npm test`.", ["npm"]],
  ])("still reports real npm usage: %j", (text, expected) => {
    expect(extractMentionedManagers(text, "pnpm")).toEqual(expected);
  });

  it("keeps npm-only subcommands as npm when no expected manager is given", () => {
    expect(extractMentionedManagers("Run `npm publish`.")).toEqual(["npm"]);
  });
});

describe("very long lines", () => {
  it("scans a 120 KB line of repeated `npm ` quickly", () => {
    const line = "npm ".repeat(30_000);
    const started = performance.now();

    extractPackageManagerCommands(line);
    extractPackageManagerCommands(`\`${line}\``);
    extractMentionedManagers(line, "pnpm");

    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("still reads a command at the start of a very long line", () => {
    const text = `Run \`pnpm run build\` ${"npm ".repeat(30_000)}`;

    expect(scripts(text)).toContain("build");
  });

  it("ignores commands beyond the scanned part of a line", () => {
    const text = `${"x".repeat(5000)} \`pnpm run late\`\n\`pnpm run early\``;

    expect(scripts(text)).toEqual(["early"]);
  });
});
