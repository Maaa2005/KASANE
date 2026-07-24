# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/) once
it reaches 1.0.0. Before 1.0.0, minor versions may include breaking changes.

## [Unreleased]

Phase 5 (public release preparation): README (English + Japanese), LICENSE,
CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates, CI/publish
GitHub Actions workflows, and npm publish metadata. Not yet published.

## [0.1.0] - Unreleased

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

[Unreleased]: https://github.com/Maaa2005/KASANE/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Maaa2005/KASANE/releases/tag/v0.1.0
