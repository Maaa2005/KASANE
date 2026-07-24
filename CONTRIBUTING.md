# Contributing to KASANE

Thanks for your interest in KASANE. This project is a local, static-analysis
CLI — no web UI, no database, no LLM calls, no telemetry. Please keep
contributions in that spirit (see 計画書.md §3.2 and §23 for what is
explicitly out of scope).

## Ways to contribute

- **Bug reports** — use the "Bug report" issue template.
- **Feature requests** — use the "Feature request" issue template. Please
  check §3.2 and §23 of `計画書.md` first; features listed there
  (Web UI, auto-fix, LLM-based semantic analysis, telemetry, etc.) will not
  be accepted for v0.1.x.
- **Unsupported config file reports** — if your AI agent reads a config
  file format KASANE doesn't detect yet, use the "Unsupported config file"
  issue template. These are labeled `good first issue` and are the easiest
  way to make a first contribution (see §1.6 of `計画書.md`).

## Development setup

```bash
pnpm install
pnpm dev -- inspect        # run the CLI from source
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Node.js >= 20 and pnpm are required.

## Before opening a pull request

- Add or update tests under `tests/unit` or `tests/integration` for any
  behavior change — untested changes will not be merged (計画書.md §23).
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` locally;
  all must pass.
- Keep rules and parsers independent modules (`src/rules/`, `src/parsers/`)
  — one rule/parser per file, matching the existing pattern.
- Never make a diagnostic rule rewrite or auto-fix a file under analysis;
  KASANE only reads target repositories, it never writes to them.
- Never log or print a secret value in full — see `src/utils/secrets.ts`
  and `tests/unit/rules/possible-secret.test.ts` for the masking contract
  new code must preserve.
- Small, focused PRs are easier to review than large ones.

## Adding support for a new config file format

1. Add a discovery pattern in `src/core/discover.ts`.
2. If it's markdown-based, reuse `src/parsers/markdown.ts`; otherwise add a
   dedicated parser under `src/parsers/`.
3. Wire scope resolution in `computeScope()` (`src/core/analyze.ts`) if the
   format has its own scoping convention (like Cursor's `globs`
   frontmatter).
4. Add fixtures under `tests/fixtures/` and integration tests under
   `tests/integration/`.

## Code of Conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Reporting a security issue

Please do not open a public issue for a security vulnerability — see
[SECURITY.md](./SECURITY.md).
