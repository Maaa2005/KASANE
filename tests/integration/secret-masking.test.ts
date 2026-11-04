import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..", "..");

// None of these are real credentials; each only has the shape of one. They
// are assembled at runtime so secret scanners do not flag this file.
const fake = (...parts: string[]) => parts.join("");
const URL_PASSWORD = fake("s3cr3t", "P4ssw0rd9");
const SECRETS = {
  "URL credentials": {
    line: `Database: postgres://app:${URL_PASSWORD}@db.example.com/app`,
    raw: URL_PASSWORD,
  },
  JWT: {
    line: "Session token: " +
      fake("eyJhbGciOiJIUzI1NiJ9.", "eyJzdWIiOiIxMjM0NTY3ODkwIn0.", "dozjgNryP4J3jVmNHl0w5N"),
    raw: "eyJzdWIiOiIxMjM0NTY3ODkwIn0",
  },
  ntn_: {
    line: `Notion: ${fake("ntn_", "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6")}`,
    raw: "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6",
  },
  sbp_: {
    line: `Supabase: ${fake("sbp_", "0123456789abcdef0123456789abcdef01234567")}`,
    raw: "0123456789abcdef0123456789abcdef01234567",
  },
} as const;

function kasane(root: string, ...args: string[]): string {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", path.join(projectRoot, "src", "cli", "index.ts"), ...args, "--root", root],
    { cwd: projectRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return result.stdout;
}

describe("new secret patterns are masked in every output", () => {
  let root: string;
  let explainJson: string;
  let diffText: string;
  let inspectContent: string;
  let inspectJson: { diagnostics: Array<{ ruleId: string; message: string }> };

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "kasane-masking-"));
    const lines = Object.values(SECRETS).map((secret) => `- ${secret.line}`);
    fs.writeFileSync(path.join(root, "AGENTS.md"), `# Rules\n\n${lines.join("\n")}\n`);
    fs.writeFileSync(path.join(root, "CLAUDE.md"), "# Rules\n\n- Write tests.\n");

    explainJson = kasane(root, "explain", "--agent", "codex", "--format", "json");
    diffText = kasane(root, "diff", "--agents", "codex,claude");
    inspectContent = kasane(root, "inspect", "--format", "json", "--include-content");
    inspectJson = JSON.parse(kasane(root, "inspect", "--format", "json"));
  }, 120_000);

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const outputs = (): Array<[string, () => string]> => [
    ["explain --format json", () => explainJson],
    ["diff", () => diffText],
    ["inspect --include-content", () => inspectContent],
  ];

  it.each(Object.keys(SECRETS))("masks %s in explain, diff and inspect output", (name) => {
    const { raw } = SECRETS[name as keyof typeof SECRETS];
    for (const [label, output] of outputs()) {
      expect(output().length, `${label} produced output`).toBeGreaterThan(0);
      expect(output(), label).not.toContain(raw);
    }
  });

  it("still shows the surrounding text, so the masking is not just empty output", () => {
    expect(diffText).toContain("Database: postgres://app:***@db.example.com/app");
    expect(explainJson).toContain("Notion: ntn_a...");
  });

  it.each(Object.keys(SECRETS))("reports %s as a KASANE007 diagnostic", (name) => {
    const found = inspectJson.diagnostics.filter(
      (d) => d.ruleId === "KASANE007" && d.message.includes(`"${name}"`),
    );
    expect(found).toHaveLength(1);
    expect(found[0].message).not.toContain(SECRETS[name as keyof typeof SECRETS].raw);
  });
}, 180_000);
