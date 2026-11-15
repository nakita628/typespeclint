import { defineConfig } from 'vite-plus'

export default defineConfig({
  // Single source of truth for formatting style. `vp fmt` and `vp check` use this block whether
  // they run here or in a workspace, as long as no workspace config has a `fmt` block of its own.
  fmt: {
    printWidth: 100,
    singleQuote: true,
    semi: false,
    sortPackageJson: true,
    sortImports: {},
    ignorePatterns: ['**/node_modules/**', '**/dist/**', '**/tsp-output/**', 'pnpm-lock.yaml'],
  },
})
