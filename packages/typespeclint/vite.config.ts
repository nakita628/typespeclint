import { defineConfig } from 'vite-plus'

export default defineConfig({
  // The build: one ESM entry with its declarations. tsconfig.json only type-checks.
  pack: {
    entry: { index: './src/index.ts' },
    format: 'esm',
    dts: true,
    outDir: 'dist',
    clean: true,
    target: 'node22',
    // `main` and `exports` point at `.js` / `.d.ts`, not tsdown's `.mjs` default.
    fixedExtension: false,
  },
  // Compiling TypeSpec in a rule test is slower than a plain unit test.
  test: { include: ['test/**/*.test.ts'], testTimeout: 30_000 },
  lint: {
    // Node-only package: declaring the runtime lets rules that resolve globals tell `process`
    // apart from a typo.
    env: { node: true, es2024: true },
    ignorePatterns: ['**/node_modules/**', '**/dist/**'],
    // Setting `plugins` replaces oxlint's default list: restate the defaults, then add import,
    // promise and node.
    plugins: ['typescript', 'unicorn', 'oxc', 'import', 'promise', 'node'],
    options: {
      typeAware: true,
      typeCheck: true,
      // A rule that stops firing must have its `oxlint-disable` comment deleted with it.
      reportUnusedDisableDirectives: 'deny',
      // Nothing here is configured as a warning; this keeps a rule that defaults to `warn`
      // from slipping through `vp check` unnoticed.
      denyWarnings: true,
    },
    categories: {
      correctness: 'error',
      suspicious: 'error',
      perf: 'error',
    },
    // Rules of the categories above are already errors; this list adds rules no category enables.
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-param-reassign': ['error', { props: true }],
      // The linter reports through the TypeSpec compiler; nothing in `src` prints.
      'no-console': 'error',
      'typescript/consistent-type-imports': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/no-non-null-assertion': 'error',
      // A `default` branch covers the TypeSpec type kinds a rule has nothing to say about.
      'typescript/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
      'unicorn/no-abusive-eslint-disable': 'error',
    },
    overrides: [
      // The layers of `src`, one way only: constants <- utils <- helper <- rules.
      // constants: fixed values, importing nothing but types.
      {
        files: ['src/constants/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  group: ['../**', '@typespec/**', 'node:*'],
                  allowTypeImports: true,
                  message: 'constants hold fixed values and import only types.',
                },
              ],
            },
          ],
        },
      },
      // utils: pure functions. No program state, no file system, nothing from the layers above.
      {
        files: ['src/utils/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  group: ['**/helper/**', '**/rules/**', 'node:*'],
                  allowTypeImports: true,
                  message: 'utils are pure functions: composition belongs in helper.',
                },
              ],
            },
          ],
        },
      },
      // helper: composition of utils with the compiler and the file system. Rules build on it.
      {
        files: ['src/helper/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  group: ['**/rules/**'],
                  allowTypeImports: true,
                  message: 'helper does not depend on the rules.',
                },
              ],
            },
          ],
        },
      },
      // The generators and the benchmark are command-line scripts: their report goes to the terminal.
      { files: ['scripts/**', 'bench/**'], rules: { 'no-console': 'off' } },
      // Tests build partial configs and hand rules to a tester typed for option-less rules.
      { files: ['test/**'], rules: { 'typescript/no-unsafe-type-assertion': 'off' } },
    ],
  },
})
