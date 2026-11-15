# Contributing to typespeclint

Requirements: Node.js 22.18 or later and pnpm.

```sh
pnpm install
pnpm test     # build, then the unit tests and the checks of the examples
pnpm check    # formatting, code lint and type check, prose lint, generated files up to date
pnpm fix      # format and apply the lint fixes that are safe
pnpm readme   # regenerate what is generated from the rule definitions
```

`pnpm check` runs these in turn:

| Command             | What it checks                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp fmt --check`    | Formatting of code, JSON and Markdown (oxfmt, configured in `vite.config.ts`).                                                                  |
| `vp run -r check`   | Code lint with type information and type check (oxlint, configured in `packages/tsplint/vite.config.ts`).                                       |
| `pnpm lint:md`      | markdownlint over the repository's Markdown.                                                                                                    |
| `pnpm lint:text`    | textlint: the spelling of product names (TypeSpec, Node.js, OpenAPI, ...).                                                                      |
| `pnpm lint:spell`   | cspell, American English plus `.cspell/words.txt`. Add a real word there; fix a typo.                                                           |
| `pnpm lint:links`   | Every relative link in the Markdown points at a file that exists.                                                                               |
| `pnpm readme:check` | The rule reference in the README, the header comment of each rule and `examples/config/typespeclint.config.full.ts` match the rule definitions. |

The documents in `docs/en` and `docs/ja` say the same thing. Change them together.

The `CI` workflow (`.github/workflows/ci.yml`) runs `pnpm test` and `pnpm check` on every pull
request and on `main`.

## Default values

The default options of the rules are values chosen for this project, not taken from a standard.
Each one is marked in the code with a `DEFAULT (may change)` comment that says where it comes
from:

```sh
grep -rn "DEFAULT (may change)" packages/tsplint/src
```

When a default changes, `pnpm readme` updates the rule reference and
`examples/config/typespeclint.config.full.ts`, and `test/defaults.test.ts` checks that the recommended
rules still report nothing on correctly written APIs.

## Layout

- [`packages/tsplint`](./packages/tsplint): the linter. Its README is the project README (the root `README.md` is a symbolic link to it), so links in it to files of the repository are written as GitHub URLs.
- [`docs`](./docs): the API lint checklist, in English and Japanese.
- [`examples`](./examples): projects linted in `pnpm test`.

How to add a rule is described in the
[Development section of the README](./packages/tsplint/README.md#development).
