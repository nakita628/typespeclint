<!-- markdownlint-disable-file MD041 -- a pull request body starts at its first section -->
<!--
Title: `type(scope): summary` — imperative mood, no trailing period. Write it for the
person reading the release notes, not for the diff.

  type   feat | fix | perf | refactor | docs | test | build | ci | chore
  scope  a rule (no-float-amount, …) or a rule group (models, operations, security, …)
         | linter | config | docs | examples | ci

  fix(no-float-amount): accept a float that is not a money amount
  feat(security): report an operation with no auth
-->

## Why

<!-- The bug, the missing capability or the request behind this change. Link the issue: `Closes #123`. -->

## What

<!-- What changed, as someone linting a TypeSpec project sees it. One to three sentences. -->

## Where

<!-- Scope: which rule, the linter, the config, the docs or the examples. Name what is deliberately left out. -->

## Who

<!-- Who notices: every user, users of one rule, contributors only. Breaking for anyone (a new diagnostic in `recommended`, a changed default)? -->

## When

<!-- Release impact: `none` | `next release` | `version bumped to x.y.z`. -->

## How

<!--
The approach in a sentence, then the evidence: the TypeSpec it now reports or accepts, and
the diagnostic. Tick only what you ran; paste the output of anything that failed.
-->

- [ ] `pnpm check`
- [ ] `pnpm test`
- [ ] `pnpm readme`, when a rule or its options changed
