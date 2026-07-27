/**
 * Single source of truth for the version KASANE reports, both from
 * `kasane --version` and in the `version` field of `--format json` output.
 *
 * package.json is the canonical value; tests/unit/version.test.ts fails the
 * build if these two ever drift, and .github/workflows/publish.yml refuses to
 * publish when the release tag does not match package.json.
 */
export const KASANE_VERSION = "0.2.0";
