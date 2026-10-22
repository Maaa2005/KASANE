import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAnalysisContext } from "../../src/core/analyze.js";
import { renderJson } from "../../src/reporters/json.js";
import { findPossibleSecrets, redactSecrets } from "../../src/utils/secrets.js";

// None of these are real credentials: each only has the shape of one. They
// are assembled at runtime so secret scanners do not flag this file.
const fake = (...parts: string[]) => parts.join("");
const OPENAI = fake("sk-", "abcdefghijklmnop1234567890");
const AWS = fake("AKIA", "IOSFODNN7EXAMPLE");
const JWT = fake(
  "eyJhbGciOiJIUzI1NiJ9.",
  "eyJzdWIiOiIxMjM0NTY3ODkwIn0.",
  "dozjgNryP4J3jVmNHl0w5N",
);
const GITHUB = fake("gho_", "16C7e42F292c6912E7710c838347Ae178B4a");
const SLACK = fake("xo", "xb-", "123456789012-1234567890123-AbCdEfGhIjKlMnOp");

const patterns = (text: string) => findPossibleSecrets(text).map((m) => m.pattern);

describe("findPossibleSecrets false positives", () => {
  it.each([
    "Use flask-sqlalchemy for the ORM.",
    "See the task-management-system service.",
    "We use scikit-learn: sk-learn-tutorial-examples.",
    "Send a Bearer token in the Authorization header.",
    "Authorization: Bearer YOUR_API_KEY.",
    "Authorization: Bearer ${API_TOKEN}",
  ])("does not flag %j", (text) => {
    expect(findPossibleSecrets(text)).toEqual([]);
  });
});

describe("findPossibleSecrets detection", () => {
  it("flags an OpenAI-style key", () => {
    expect(patterns(`OPENAI_API_KEY=${OPENAI}`)).toEqual(["sk-"]);
  });

  it("flags a bearer token regardless of case", () => {
    expect(patterns(`authorization: bearer ${JWT}`)).toEqual(["Bearer"]);
  });

  it.each([
    ["gho_", GITHUB],
    ["AKIA", AWS],
    ["xox", SLACK],
    ["PRIVATE KEY", fake("-----BEGIN RSA ", "PRIVATE KEY-----")],
  ])("flags a %s value", (name, value) => {
    expect(patterns(`token: ${value}`)).toEqual([name]);
  });
});

describe("redactSecrets", () => {
  it("masks overlapping matches as one span", () => {
    const output = redactSecrets(`Authorization: Bearer ${OPENAI}`);

    expect(output).not.toContain("1234567890");
    expect(output).toBe("Authorization: Beare...890");
  });

  it("masks a key that JSON would escape the separator of", () => {
    const output = renderJson(
      { sources: [{ sourceType: "agents", content: `key:\t${OPENAI}\n` }] },
      { includeContent: true },
    );

    expect(output).not.toContain(OPENAI);
    expect(output).not.toContain("1234567890");
  });

  it("masks a bearer token separated by a tab", () => {
    const output = renderJson({ instructions: [{ content: `Bearer\t${JWT}` }] });

    expect(output).not.toContain(JWT);
  });
});

describe("redaction of derived instruction fields", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it("does not leak a key through the lowercased duplicate-detection text", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "kasane-secrets-"));
    fs.writeFileSync(
      path.join(root, "AGENTS.md"),
      `- Deploy with ${AWS} and ${GITHUB}\n`,
    );

    const context = await buildAnalysisContext(root);
    const output = renderJson({ instructions: context.instructions }).toLowerCase();

    expect(output).not.toContain(AWS.toLowerCase());
    expect(output).not.toContain("16c7e42f292c6912e7710c838347ae178b4a");
  });
});
