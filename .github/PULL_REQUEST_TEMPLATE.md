## What does this change do?

<!-- One or two sentences. Link a related issue if there is one. -->

## Why

<!-- What problem does this solve? -->

## Checklist

- [ ] I read [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] Tests were added/updated under `tests/unit` or `tests/integration`
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all pass locally
- [ ] This does not add a Web UI, database, authentication, LLM API call, or
      auto-fix behavior (see 計画書.md §23)
- [ ] This does not rewrite/modify any file under analysis — KASANE only reads
- [ ] No secret values are printed in full anywhere (they must be masked, see `src/utils/secrets.ts`)
