# example-banking

A small API linted with a `typespeclint.config.ts` that also declares custom rules.

- [`main.tsp`](./main.tsp) is a design with problems: a `POST /send_email` operation taking an
  optional `email` and a numeric `msg`.
- [`typespeclint.config.ts`](./typespeclint.config.ts) raises some rules to errors, switches opt-in rules
  on, and adds two rules of its own with `defineRule` and `customRules`.

```sh
pnpm lint
```

The command fails: the config reports some findings as errors.
