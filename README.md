# KASANE

[![CI](https://github.com/Maaa2005/KASANE/actions/workflows/ci.yml/badge.svg)](https://github.com/Maaa2005/KASANE/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/kasane-cli.svg)](https://www.npmjs.com/package/kasane-cli)
[![license](https://img.shields.io/npm/l/kasane-cli.svg)](./LICENSE)

> Debug the context your AI coding agents actually receive.

KASANE analyzes AGENTS.md, CLAUDE.md, Cursor rules, GEMINI.md, Copilot
instructions, and MCP configuration. It detects duplicated instructions,
broken references, context bloat, and differences between coding agents.

日本語版READMEは [README.ja.md](./README.ja.md) を参照してください。

![kasane inspect, diff and explain running against an example repository](https://raw.githubusercontent.com/Maaa2005/KASANE/main/docs/demo.gif)

## 30-second example

A repository with an `AGENTS.md`, a `CLAUDE.md`, a nested `src/CLAUDE.md`,
a Cursor rule, Copilot instructions and an MCP config:

```bash
npx kasane-cli inspect
```

```text
KASANE

Repository:
  /private/tmp/acme-web

Detected:
  ✓ .cursor/rules/typescript.mdc (Cursor rule)
  ✓ .github/copilot-instructions.md (Copilot instructions)
  ✓ .mcp.json (MCP server config)
  ✓ AGENTS.md (AGENTS.md)
  ✓ CLAUDE.md (CLAUDE.md)
  ✓ src/CLAUDE.md (CLAUDE.md)

Context:
  6 files
  143 estimated tokens
  10 instructions

Issues:
  2 error(s), 2 warning(s), 0 info

  [warning] KASANE001 .github/copilot-instructions.md:1 — Duplicated instruction
    The same instruction appears in 3 files: "Write tests for new features."
  [error] KASANE002 AGENTS.md:9 — Broken file reference
    docs/architecture.md does not exist
  [error] KASANE003 CLAUDE.md:7 — Missing package.json script
    "pnpm run lint:fix" is referenced but package.json has no "lint:fix" script
  [warning] KASANE004 AGENTS.md:7 — Package manager mismatch
    Instruction mentions "npm" but the repository lockfile indicates "pnpm"
```

Then ask why one agent behaves differently from another:

```bash
kasane diff --agents codex,claude
```

```text
Context difference

Codex only:
  + Run `pnpm test` before every commit.
  + Use npm for installing dependencies.
  + See the architecture notes before large changes.

Claude Code only:
  + Use pnpm for installing dependencies.
  + Run `pnpm lint:fix` after editing.
  + Prefer named exports in this directory.

Common:
  Write tests for new features.
```

Both listings are verbatim output. `docs/make-demo.sh` builds that example
repository and re-records the GIF above.

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
explains where these problems come from, rather than listing which files
exist.

### Compared to other tools

Linting agent context files is not a new idea, and two of these tools do
parts of it better than KASANE does.

| Tool | What it does | Overlap with KASANE |
| --- | --- | --- |
| [agentlinter](https://github.com/seojoonkim/agentlinter) | "ESLint for AI Agents". Scores and auto-fixes `AGENTS.md`/`CLAUDE.md`, warns about rules buried mid-file where models attend less, checks token efficiency and secrets. | Large. Its rule set is broader than KASANE's seven, and it fixes what it finds. |
| [ai-context-kit](https://github.com/ofershap/ai-context-kit) | Measures per-file token cost against a budget, detects conflicts and duplicates, and picks the rules relevant to one task. | Large, and its `select()` has no KASANE equivalent. |
| [cursor-doctor](https://github.com/nedcodes-ok/cursor-doctor) | 100+ checks for Cursor rules specifically, with editor quick-fixes. | Cursor only. Deeper than KASANE there. |

What none of them do is answer **"why does this one agent behave
differently from the others?"**. They validate files. KASANE resolves each
file down to the instructions a single agent actually ends up with for a
single target path, then diffs that between agents — which is what
`kasane diff` and `kasane explain --path` are for.

If you want autofix or a per-task context budget, use one of the tools
above. Reach for KASANE when agents disagree and you need to see why.

(Checked against each repository in July 2026. Star counts and activity
move; go look before believing a comparison table.)

## Install

```bash
npx kasane-cli inspect
# or
npm install -g kasane-cli
```

The published package is `kasane-cli`; the command it installs is `kasane`.

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
`--format text|json`, `--include-content`.

JSON output omits the full text of each config file by default, so a
secret sitting in a context file is not copied into CI logs alongside the
diagnostic that reports it. Pass `--include-content` when you want the
file bodies; secret-looking strings stay masked either way.
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

Cursor rules are resolved from a `.cursor/rules` directory at any depth,
and `globs` is accepted as a list, a single string, or a comma-separated
string. A rule with no `globs` is scoped to the subtree that owns it.

### Known limitations (not reproduced in v0.2.0)

KASANE only reconstructs context that can be resolved by **static
analysis**. The following are intentionally out of scope for now:

- Whether an agent actually loads a description-matched rule at runtime
  (an Agent-Requested rule is reported as reaching its whole subtree,
  which is an upper bound, not a prediction)
- In-agent-only reference syntax, such as Claude Code's `@path` imports
- Behavior differences caused by agent version or platform
- `.gitignore` files below the repository root — only the root one is
  applied when filtering discovered files
- Workspace-local `package.json` scripts: KASANE003 checks every
  instruction against the **root** `package.json`, so a command that is
  valid inside a workspace package is reported as missing

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

## Release checklist

Kept here as a record of how v0.2.0 was released. Only step 7 is still open.

1. Done: pushed to https://github.com/Maaa2005/KASANE (default branch `main`)
2. Done: `kasane` was already taken on npm, so the package is published as
   `kasane-cli` (`package.json` `name`), with the binary still named `kasane`
3. Done: `docs/make-demo.sh` records `docs/demo.gif`, embedded at the top of
   this README
4. Done: "Why KASANE" carries a comparison against agentlinter,
   ai-context-kit and cursor-doctor
5. Done: published as `kasane-cli@0.2.0` by tag-pushing `v0.2.0`
6. Done: https://github.com/Maaa2005/KASANE/releases/tag/v0.2.0
7. Post the initial announcement per the launch plan (計画書.md §26)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

MIT — see [LICENSE](./LICENSE).
