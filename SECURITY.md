# Security Policy

## Supported Versions

KASANE is pre-1.0. Security fixes are made against the latest published
`0.x` release; older `0.x` versions are not backported.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for a suspected security
vulnerability.

Instead, report it privately using GitHub's "Report a vulnerability"
feature (Security tab → "Report a vulnerability") on
https://github.com/Maaa2005/KASANE, which opens a private security
advisory visible only to maintainers.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce, or a minimal repository/config that triggers it
- The KASANE version and OS/Node.js version used

You should expect an initial response within a few days.

## What's in scope

KASANE is a local, offline static-analysis CLI: it reads files from a
target repository and never sends data over the network, calls an LLM, or
persists data outside the process. Relevant security concerns include:

- Path traversal or unintended file access outside the analyzed repository
- A crafted config file causing KASANE to execute code (KASANE never
  executes shell commands found in analyzed files — this would be a
  vulnerability)
- Secret values (see `src/utils/secrets.ts`) being printed in full instead
  of masked, in any reporter or log output
- Denial-of-service via a maliciously crafted config file (e.g. unbounded
  recursion/allocation while parsing)

## What's out of scope

- Vulnerabilities in the AI agents themselves (Codex, Claude Code, Cursor,
  Gemini CLI, Copilot) — KASANE only reads their config files, it does not
  run them
- Issues that require the attacker to already control files inside the
  repository being analyzed with local write access
