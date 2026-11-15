# example-config

A project configured with `typespeclint.config.ts`, and nothing else.

- [`tspconfig.yaml`](./tspconfig.yaml) enables `typespeclint/recommended`.
- [`typespeclint.config.ts`](./typespeclint.config.ts) decides which rules run, how severe they are and
  with which options: a preset, a category, rules switched off and on, and options adapted to an
  API that names its properties in snake_case.
- [`main.tsp`](./main.tsp) is an API that passes with this config.
- [`typespeclint.baseline.json`](./typespeclint.baseline.json) is the published API that `breaking-change`
  compares with. `TYPESPECLINT_UPDATE_BASELINE=1 pnpm lint` records it again after a release.

```sh
pnpm lint
```

[`typespeclint.config.full.ts`](./typespeclint.config.full.ts) is a reference: every rule with every option
at its default value. It is not loaded; copy from it into `typespeclint.config.ts`.

Rename `typespeclint.config.ts` and run it again to see what the defaults report for the same API.
