# KASANE

[![CI](https://github.com/Maaa2005/KASANE/actions/workflows/ci.yml/badge.svg)](https://github.com/Maaa2005/KASANE/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/kasane.svg)](https://www.npmjs.com/package/kasane)
[![license](https://img.shields.io/npm/l/kasane.svg)](./LICENSE)

> Debug the context your AI coding agents actually receive.

KASANE analyzes AGENTS.md, CLAUDE.md, Cursor rules, GEMINI.md, Copilot
instructions, and MCP configuration. It detects duplicated instructions,
broken references, context bloat, and differences between coding agents.

日本語版READMEは [README.ja.md](./README.ja.md) を参照してください。

<!--
TODO(before launch): replace this with a recorded terminal demo
(GIF or asciinema) showing `kasane inspect` / `explain` / `diff`.
Recording and publishing the demo is a manual, human step — see
"Manual publish checklist" below.
-->

## 30-second example

```bash
npx kasane inspect
```

```text
KASANE

Repository:
  /Users/example/project

Detected:
  ✓ AGENTS.md
  ✓ CLAUDE.md
  ✓ 3 Cursor rules
  ✓ 2 MCP servers

Context:
  7 files
  8,421 estimated tokens
  36 instructions

Issues:
  2 duplicated instructions
  1 broken file reference
  1 package-manager conflict
  1 possible secret

Run `kasane explain --agent claude` for details.
```

## Why KASANE

Running multiple AI coding agents (Codex, Claude Code, Cursor, Gemini CLI,
Copilot) in the same repository causes problems that are hard to see:

- Each agent reads a different instruction file
- The same instruction is duplicated across files
- Instructions contradict each other
- Stale commands or non-existent files are referenced
- Context grows silently until it doesn't fit
- One specific agent behaves differently and nobody knows why

KASANE reconstructs the effective context each agent actually receives and
explains where these problems come from — instead of just listing which
files exist.

## Install

```bash
npx kasane inspect
# or
npm install -g kasane
```

Requires Node.js >= 20.

## Commands

```bash
kasane inspect
kasane explain --agent <codex|claude|cursor|gemini|copilot> [--path <file>]
kasane diff --agents <agent,agent,...> [--path <file>]
```

| Command   | Purpose                                                                 |
| --------- | ------------------------------------------------------------------------ |
| `inspect` | Analyze the whole repository and report detected diagnostics             |
| `explain` | Show the effective context (files + instructions) applied to one agent   |
| `diff`    | Compare the effective context between two or more agents                 |

Common options: `--root <path>` (repository to analyze, default `.`),
`--format text|json`, `--verbose`.
`inspect` also supports `--fail-on warning|error` for CI gating.
`explain`/`diff` also support `--path <file>` to scope the result to a
single target file (directory-scoped and Cursor `globs`-scoped instructions
are resolved accordingly).

## Supported agents / config files

| Agent          | File(s)                                                             |
| -------------- | ---------------------------------------------------------------------- |
| OpenAI Codex   | `AGENTS.md`                                                          |
| Claude Code    | `CLAUDE.md`, `CLAUDE.local.md`                                       |
| Cursor         | `.cursor/rules/**/*.md`, `.cursor/rules/**/*.mdc`, `.cursorrules`    |
| Gemini CLI     | `GEMINI.md`                                                          |
| GitHub Copilot | `.github/copilot-instructions.md`                                    |
| MCP servers    | `.mcp.json`, `mcp.json`, `.cursor/mcp.json`, `.claude/mcp.json` (detected only, not parsed for instructions) |

### Known limitations (not reproduced in v0.1.0)

KASANE only reconstructs context that can be resolved by **static
analysis**. The following are intentionally out of scope for now:

- Rules an agent applies dynamically at runtime based on a description
  (e.g. Cursor's Agent-Requested rules with `alwaysApply: false`)
- In-agent-only reference syntax, such as Claude Code's `@path` imports
- Behavior differences caused by agent version or platform

## It's local, static analysis only

KASANE never sends your files anywhere. There is no network access, no
LLM calls, no telemetry, and no external API key. Everything runs as a
single local process against files on disk.

## About estimated tokens

Token counts are computed with `js-tiktoken` (an OpenAI-family tokenizer)
and are shown as **estimated tokens**. They are not an exact count for
Claude, Gemini, or any other specific model — treat them as a relative,
comparable approximation across agents and files, not an exact API usage
figure.

## Roadmap

- [ ] `.github/instructions/**/*.instructions.md` (GitHub Copilot, new format)
- [ ] Windsurf (`.windsurfrules`) / Cline (`.clinerules`) / Roo (`.roo/rules/**`)
- [ ] Additional editor/agent config formats as they're reported

Known unsupported file formats are tracked as `good first issue` — see
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Contributing

Bug reports, feature requests, and reports of unsupported config file
formats are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) and our
[Code of Conduct](./CODE_OF_CONDUCT.md).

## Security

See [SECURITY.md](./SECURITY.md) for how to report a vulnerability.

## Manual publish checklist

The following steps are **not** performed automatically and require a human
to run them once the repository and npm package are ready:

1. `git init` and push this repository to `https://github.com/Maaa2005/KASANE`
   (default branch `main`)
2. Confirm the `kasane` name is available on npm (`npm view kasane`); if
   taken, update the `name` field in `package.json` (the single place the
   published package name is defined) and the badge URLs above
3. Record a terminal demo (GIF or asciinema) of `inspect` / `explain` /
   `diff` and embed it at the top of this README
4. Update [1.4 競合との違い](./計画書.md) / the "Why KASANE" section with a
   concrete competitor comparison
5. `npm login`, then `npm publish` (or tag-push to trigger
   `.github/workflows/publish.yml`) for the first `v0.1.0` release
6. Create a GitHub Release / tag `v0.1.0`
7. Post the initial announcement per the launch plan (計画書.md §26)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

MIT — see [LICENSE](./LICENSE).
