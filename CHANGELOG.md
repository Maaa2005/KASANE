# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/) once
it reaches 1.0.0. Before 1.0.0, minor versions may include breaking changes.

## [Unreleased]

### Security

- Frontmatter is parsed with a safe YAML loader. The previous parser
  evaluated `---js` frontmatter as JavaScript, so running `kasane` on an
  untrusted checkout could execute code from a config file.
- Secret masking could be bypassed. A key followed by a tab or another
  character that JSON escapes was printed unmasked in `--format json`, and
  the lowercased text used for duplicate detection (`normalizedContent`)
  carried keys no pattern recognized. Masking now runs on every string
  before serialization and before normalization.
- `.gitignore`, `.git/info/exclude`, `package.json` and config files are
  only read when they resolve to a regular file inside the repository. A
  symlink to a file outside it, or to a device such as `/dev/zero`, could
  print that file's contents or hang the analysis.
- Token counting stalled for minutes on long runs of text without spaces
  and crashed on special-token markers such as `<|endoftext|>`. Long runs
  are now counted in slices, very large files are extrapolated from a
  sample, and markers are counted as ordinary text.

### Fixed

- Nested git checkouts were analyzed as part of the parent repository.
  A worktree under `.claude/worktrees/` (or any directory with its own
  `.git` file or directory, such as a submodule) doubled every config file
  and flooded the report with duplicate-instruction warnings. Such
  subtrees are now skipped, and `.git/info/exclude` is honored alongside
  the root `.gitignore`.
- KASANE002 cut the prefix off home-relative and absolute paths and
  checked the remainder against the repository: `~/.claude/CLAUDE.md`
  was reported as a missing `.claude/CLAUDE.md`, and `/home/user/x.md` as
  a missing `home/user/x.md`. Those paths are no longer treated as
  repository references; absolute paths are still reported by KASANE006,
  which now also covers `/root/...`.
- KASANE002 reported template paths such as `notes/YYYY-MM-DD-topic.md`
  or `docs/ADR-XXXX.md` as broken references.
- KASANE007 flagged hyphenated words (`flask-sqlalchemy`, `sk-learn`)
  and prose or placeholder bearer tokens (`Bearer YOUR_API_KEY`). It now
  also detects GitHub OAuth/app tokens, GitLab, AWS session, Google API,
  Slack, Stripe, npm and Hugging Face tokens, and private key blocks.
- A config file symlinked to another (`ln -s AGENTS.md CLAUDE.md`) was
  reported as a duplicate of it and its tokens were counted twice.
  Symlinked config files are now discovered and analyzed once.
- `CLAUDE.local.md` was skipped when gitignored, although that is how it
  is meant to be used and Claude Code still loads it.
- Malformed frontmatter aborted parsing, and a file starting with a `---`
  horizontal rule lost the text up to the next `---`.
- `explain` dropped a duplicate-instruction diagnostic when only the other
  copy was in the agent's context.

## [0.2.0] - 2026-07-28

First published release. Fixes found by a cross-model review of the 0.1.0
tree; several change output shape, which is why this is a minor bump.

Published to npm as `kasane-cli` — `kasane` was already taken by an
unrelated package. The installed command is still `kasane`.

### Security

- `--format json` no longer emits each config file's full text by default.
  KASANE007 masked the secret it reported, but the same value was printed
  verbatim in the accompanying `sources[].content`, which typically lands
  in CI logs. Use `--include-content` to opt back in. All renderers now
  mask secret-looking strings in their final output, so no command or
  format can route an unmasked value to stdout.
- KASANE007 scans whole files instead of extracted Markdown instructions,
  so tokens in headings, fenced code blocks and MCP JSON are detected.

### Fixed

- `diff` with three or more agents dropped every instruction that some but
  not all of them share — it appeared in neither `common` nor `onlyIn`.
  Such instructions are now reported under `sharedBy`.
- Cursor rules in a nested `.cursor/rules` directory were never discovered,
  despite being documented as supported.
- Cursor `globs` written as a single string was ignored, and a list was
  joined with `|` and re-split, which corrupted extglob patterns such as
  `@(a|b)`. Patterns are now kept individually.
- A Cursor rule with no `globs` was scoped to the `.cursor/rules` directory
  itself, so it applied to nothing. It is now scoped to the subtree that
  owns it, which is also how `alwaysApply: true` is handled.
- KASANE002 missed references written as Markdown links
  (`[guide](docs/guide.md)`) or inside inline code — the most common ways
  to point at a file.
- A nested list item's text was spliced into its parent item, double
  counting tokens and mixing text for duplicate detection.
- KASANE004 counted a package manager named only to forbid it, so
  "Use pnpm instead of npm" was reported as an npm mismatch.
- KASANE006 missed `C:/…`-style Windows paths, UNC paths, and `/opt`,
  `/var`, `/tmp`, `/mnt`, `/srv`.
- Discovery order was filesystem-dependent, making JSON output differ
  between machines for the same repository.
- Windows CI failed because tests built expected paths with `path.join`
  while the analyzer always reports posix separators.

### Changed

- The version reported by `kasane --version` and by `--format json` comes
  from a single constant, checked against `package.json` by a test and by
  the publish workflow, instead of being hardcoded in three places.
- `instructions[].scope.value` (string) is now `scope.patterns` (array).
- Removed `--verbose`, which was accepted by every command but never
  changed the output.
- `typecheck` now covers `tests/` as well as `src/`.
- The publish workflow refuses to publish when the tag and `package.json`
  version disagree, and publishes with npm provenance.

## [0.1.0] - Unreleased

Never published to npm.

### Added

- `kasane inspect` — analyze a repository's AI agent config files and
  report diagnostics (text and JSON output, `--fail-on`)
- `kasane explain --agent <agent> [--path <file>]` — show the effective
  context applied to one agent
- `kasane diff --agents <a,b,...> [--path <file>]` — compare the effective
  context between two or more agents, including common instructions,
  agent-specific instructions, and package-manager conflicts
- Discovery and parsing of `AGENTS.md`, `CLAUDE.md`/`CLAUDE.local.md`,
  `GEMINI.md`, `.github/copilot-instructions.md`, Cursor rules
  (`.cursor/rules/**/*.md`, `.cursor/rules/**/*.mdc`, `.cursorrules`), and
  detection (not parsing) of MCP configuration files
- Directory- and glob-based scope resolution for instructions (nested
  `CLAUDE.md`, Cursor `globs` frontmatter)
- Estimated token counting via `js-tiktoken`
- Diagnostic rules KASANE001–KASANE007: duplicated instructions, broken
  file references, missing package.json scripts, package manager
  conflicts, context size warnings, absolute paths, and possible secrets
  (masked in output)

[Unreleased]: https://github.com/Maaa2005/KASANE/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Maaa2005/KASANE/releases/tag/v0.2.0
[0.1.0]: https://github.com/Maaa2005/KASANE/releases/tag/v0.1.0
