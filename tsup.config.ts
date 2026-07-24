import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/cli/index.ts" },
  format: ["esm"],
  target: "node20",
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
