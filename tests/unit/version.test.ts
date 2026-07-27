import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { KASANE_VERSION } from "../../src/version.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("KASANE_VERSION", () => {
  it("matches the version published from package.json", () => {
    const raw = fs.readFileSync(
      path.join(__dirname, "..", "..", "package.json"),
      "utf8",
    );
    const { version } = JSON.parse(raw) as { version: string };

    expect(KASANE_VERSION).toBe(version);
  });
});
