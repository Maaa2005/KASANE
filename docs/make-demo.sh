#!/usr/bin/env bash
# Regenerates docs/demo.gif from the current source tree.
#
# Requires vhs (https://github.com/charmbracelet/vhs): brew install vhs
#
# The example repository is deliberately broken in four ways, one per rule
# the demo is meant to show: a duplicated instruction, a reference to a file
# that does not exist, a script that is not in package.json, and a package
# manager that disagrees with the lockfile.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
demo=/tmp/acme-web

cd "$repo_root"
pnpm build

rm -rf "$demo"
mkdir -p "$demo/.cursor/rules" "$demo/src" "$demo/.github"

cat > "$demo/package.json" <<'EOF'
{
  "name": "acme-web",
  "private": true,
  "scripts": { "dev": "next dev", "build": "next build", "test": "vitest run" }
}
EOF
touch "$demo/pnpm-lock.yaml"

cat > "$demo/AGENTS.md" <<'EOF'
# acme-web

Run `pnpm test` before every commit.

Write tests for new features.

Use npm for installing dependencies.

See [the architecture notes](docs/architecture.md) before large changes.
EOF

cat > "$demo/CLAUDE.md" <<'EOF'
# acme-web

Write tests for new features.

Use pnpm for installing dependencies.

Run `pnpm lint:fix` after editing.
EOF

cat > "$demo/src/CLAUDE.md" <<'EOF'
Prefer named exports in this directory.
EOF

cat > "$demo/.cursor/rules/typescript.mdc" <<'EOF'
---
globs: "src/**/*.ts"
---

Use strict TypeScript types. Avoid `any`.
EOF

cat > "$demo/.github/copilot-instructions.md" <<'EOF'
Write tests for new features.
EOF

cat > "$demo/.mcp.json" <<'EOF'
{
  "mcpServers": {
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] }
  }
}
EOF

# The tape types `kasane`, so expose the tree we just built under that name.
shim="$(mktemp -d)"
printf '#!/bin/sh\nexec node %s/dist/index.js "$@"\n' "$repo_root" > "$shim/kasane"
chmod +x "$shim/kasane"

PATH="$shim:$PATH" vhs docs/demo.tape

rm -rf "$shim"
echo "Wrote docs/demo.gif"
