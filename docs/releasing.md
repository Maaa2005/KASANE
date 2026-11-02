# Releasing

How KASANE is released. This is maintainer documentation; contributors do not
need it.

## Steps

1. Update `CHANGELOG.md`: move the `Unreleased` entries under a new version
   heading.
2. Bump `version` in `package.json` and `KASANE_VERSION` in `src/version.ts`
   so both match the tag you are about to push.
3. Run the same checks CI runs:

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

4. Push a tag named `v<version>` (for example `v0.3.1`). The `Publish`
   workflow (`.github/workflows/publish.yml`) checks that the tag matches
   `package.json`, reruns lint, typecheck, test and build, then publishes to
   npm through trusted publishing (OIDC) with provenance. No npm token is
   stored.
5. Create the GitHub release for the tag.

## History

Kept as a record of how `kasane-cli@0.2.0` was first released.

1. Pushed to https://github.com/Maaa2005/KASANE (default branch `main`).
2. `kasane` was already taken on npm, so the package is published as
   `kasane-cli` (`package.json` `name`), with the binary still named `kasane`.
3. `docs/make-demo.sh` records `docs/demo.gif`, embedded at the top of the
   README.
4. "Why KASANE" in the README carries a comparison against agentlinter,
   ai-context-kit and cursor-doctor.
5. Published as `kasane-cli@0.2.0` by tag-pushing `v0.2.0`.
6. https://github.com/Maaa2005/KASANE/releases/tag/v0.2.0
