import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAnalysisContext } from "../../src/core/analyze.js";
import { renderJson } from "../../src/reporters/json.js";
import {
  findPossibleSecrets,
  maskSecretMatch,
  redactSecrets,
} from "../../src/utils/secrets.js";

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

const NOTION = fake("ntn_", "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6");
const SUPABASE = fake("sbp_", "0123456789abcdef0123456789abcdef01234567");
const URL_PASSWORD = fake("s3cr3t", "P4ssw0rd9");

describe("URL credentials", () => {
  it("flags only the password of scheme://user:password@host", () => {
    const text = `DATABASE_URL=postgres://app:${URL_PASSWORD}@db.example.com:5432/app`;
    const [match] = findPossibleSecrets(text);

    expect(match).toEqual({ pattern: "URL credentials", value: URL_PASSWORD });
    expect(maskSecretMatch(match)).toBe("***");
    expect(redactSecrets(text)).toBe(
      "DATABASE_URL=postgres://app:***@db.example.com:5432/app",
    );
  });

  it("flags a password with an empty user (redis://:password@host)", () => {
    expect(patterns(`redis://:${URL_PASSWORD}@cache.example.com`)).toEqual([
      "URL credentials",
    ]);
  });

  it.each([
    "https://user@example.com/path",
    "git clone ssh://git@github.com:22/org/repo.git",
    "git@github.com:org/repo.git",
    "See https://example.com:8080/docs for details.",
    "http://localhost:3000/api",
    "postgres://user:${DB_PASSWORD}@localhost/app",
    "postgres://user:<password>@localhost/app",
    "postgres://user:YOUR_PASSWORD@localhost/app",
    "postgres://user:password@localhost/app",
    "postgres://postgres:postgres@localhost/app",
    "mysql://user:********@localhost/app",
    "https://user:pass@example.com",
  ])("does not flag %j", (text) => {
    expect(findPossibleSecrets(text)).toEqual([]);
  });
});

describe("JWT, Notion and Supabase tokens", () => {
  it("flags a JWT and masks it", () => {
    expect(patterns(`token ${JWT}`)).toEqual(["JWT"]);
    expect(redactSecrets(`token ${JWT}`)).not.toContain("dozjgNryP4J3jVmNHl0w5N");
  });

  it("reports a bearer JWT once, as the bearer match", () => {
    expect(patterns(`Authorization: Bearer ${JWT}`)).toEqual(["Bearer"]);
  });

  it("flags Notion ntn_ tokens", () => {
    expect(patterns(`NOTION_TOKEN=${NOTION}`)).toEqual(["ntn_"]);
    expect(redactSecrets(`NOTION_TOKEN=${NOTION}`)).not.toContain("a1B2c3D4e5F6");
  });

  it("flags Supabase sbp_ tokens", () => {
    expect(patterns(`SUPABASE_ACCESS_TOKEN=${SUPABASE}`)).toEqual(["sbp_"]);
    expect(redactSecrets(`SUPABASE_ACCESS_TOKEN=${SUPABASE}`)).not.toContain(
      "0123456789abcdef0123",
    );
  });

  it.each([
    "A JWT starts with eyJhbGciOi... and has three parts.",
    "Tokens look like eyJ.eyJ.sig in this example.",
    "Use the ntn_ prefix for Notion tokens.",
    "The sbp_ prefix marks Supabase tokens, e.g. sbp_xxx.",
    "my_ntn_integration and the-sbp_tokens-list",
  ])("does not flag %j", (text) => {
    expect(findPossibleSecrets(text)).toEqual([]);
  });
});
