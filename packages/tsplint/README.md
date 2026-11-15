# TspLint

A configurable API design linter for [TypeSpec](https://typespec.io/).

typespeclint automates the mechanical part of an API lint checklist — security definitions, goal
flows, models, model properties, goals (operations), goal parameters and goal responses — as
TypeSpec [linter rules](https://typespec.io/docs/extending-typespec/linters/). Guidelines differ
between organizations, so presets, severities and rule options are set in a `typespeclint.config.ts`,
in the style of ESLint and oxlint.

- [The API lint checklist](https://github.com/nakita628/tsplint/blob/main/docs/en/api-lint-checklist.md) typespeclint automates, and how to write a custom rule ([日本語](https://github.com/nakita628/tsplint/blob/main/docs/ja/api-lint-checklist.md)).

## Usage

```sh
pnpm add -D typespeclint @typespec/compiler @typespec/http
```

Enable the linter in `tspconfig.yaml`:

```yaml
linter:
  extends:
    - typespeclint/recommended
```

That is all that is needed. `tsp compile .` now reports the recommended rules as warnings, and
the TypeSpec editor extension shows them while you type.

One recommended rule needs a baseline to compare with. `breaking-change` reports that none
exists until you record the published API once, and again after each release:

```sh
TYPESPECLINT_UPDATE_BASELINE=1 tsp compile . --no-emit   # writes typespeclint.baseline.json; commit it
```

To adapt the linter to your guidelines, add a `typespeclint.config.ts`. It is optional, and written
the way you configure ESLint or oxlint:

```ts
import { defineConfig } from 'typespeclint'

export default defineConfig({
  // Start from a preset: "recommended" (default) or "all".
  extends: ['recommended'],

  // Set the severity of a whole checklist section.
  categories: {
    security: 'error',
    parameters: 'off',
  },

  // Set the severity and the options of single rules.
  rules: {
    'operation-method': 'off',
    'model-naming': 'error',
    'example-required': 'warn', // opt-in: require @example on payload models
    'response-problem-details': 'error', // opt-in: enforce RFC 9457 error bodies
    'standard-format': ['warn', { phone: false }], // opt-in: ISO 4217, ISO 3166-1, ... but not E.164
    'property-naming': ['error', { case: 'snake_case' }],
  },
})
```

Then run `tsp compile .` as usual. `"warn"` findings are warnings (`--warn-as-error` turns them
into failures); `"error"` findings fail the compilation. The TypeSpec editor extension shows both
while you type.

### Configuration reference

Settings are applied in this order; later ones win.

| Key           | Values                                       | Effect                                                                                                                                            |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extends`     | `["recommended"]` (default), `["all"]`, `[]` | Preset to start from: the recommended rules, every rule, or nothing, as warnings.                                                                 |
| `categories`  | `{ <category>: "off" \| "warn" \| "error" }` | Severity of every rule of a checklist section: `evolution`, `security`, `flows`, `models`, `properties`, `operations`, `parameters`, `responses`. |
| `customRules` | `[rule, ...]`                                | Your own rules, see [Custom rules](#custom-rules).                                                                                                |
| `rules`       | `{ <rule>: <setting> }`                      | Setting of one rule, see below.                                                                                                                   |

| Rule setting                              | Effect                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `"off"` / `false`                         | The rule does not run.                                                        |
| `"warn"` / `true`                         | The rule reports warnings, with its default options.                          |
| `"error"`                                 | The rule reports errors, with its default options.                            |
| `["warn", { ... }]`, `["error", { ... }]` | Severity plus options, merged over the rule's defaults.                       |
| `{ ... }`                                 | Options only. The rule keeps its severity, or becomes `"warn"` if it was off. |

- TypeSpec's own mechanisms keep working: `linter.enable` / `linter.disable` in `tspconfig.yaml`,
  and `#suppress "typespeclint/<rule>" "reason"` on a declaration. It also applies to findings
  raised to `"error"`. Options written under `linter.enable` win over `typespeclint.config.*`.
- `typespeclint/recommended` in `tspconfig.yaml` hands control to `typespeclint.config.*` as described
  above. `typespeclint/all` runs every rule whatever `extends` says.
- The config file is the nearest `typespeclint.config.{ts,mts,js,mjs}`, searched from the directory of
  `tspconfig.yaml` upwards. `TYPESPECLINT_CONFIG` overrides the path. A `.ts` config is loaded with
  Node.js type stripping, which needs Node.js 22.18 or later.
- Naming options (`case`, `segmentCase`, ...) take `camelCase`, `PascalCase`, `snake_case`,
  `SCREAMING_SNAKE_CASE`, `kebab-case`, `Train-Case`, `http-header`, or a regular expression source.

## Custom rules

Guidelines always have rules of their own. Declare one with `defineRule`, list it in
`customRules`, and configure it in `rules` by its name, like a built-in rule:

```ts
import { defineConfig, defineRule } from 'typespeclint'

const noFloatAmount = defineRule<{ names: string[] }>()({
  name: 'no-float-amount',
  description: 'Amounts must not be floating-point numbers.',
  category: 'properties', // optional: lets `categories` apply to the rule
  defaults: { names: ['amount', 'price', 'total'] },
  run({ analysis, options, report }) {
    for (const model of analysis.models) {
      for (const property of model.properties.values()) {
        const type = property.type
        if (
          options.names.includes(property.name) &&
          type.kind === 'Scalar' &&
          type.name.startsWith('float')
        ) {
          report(property, `'${property.name}' is an amount: use decimal, not ${type.name}.`)
        }
      }
    }
  },
})

export default defineConfig({
  customRules: [noFloatAmount],
  rules: {
    'no-float-amount': ['error', { names: ['amount', 'balance'] }],
  },
})
```

- A rule listed in `customRules` runs as a warning. `rules` and `categories` change its severity
  or switch it off. Its options are type-checked from the `defineRule` declaration.
- Findings are reported as `typespeclint/<name>`, so `#suppress "typespeclint/no-float-amount" "reason"`
  works. A name already used by a built-in rule is rejected.
- A rule without options is `defineRule()({ ..., defaults: {} })`.
- `run` receives:

  | Property                  | What it is                                                                                     |
  | ------------------------- | ---------------------------------------------------------------------------------------------- |
  | `analysis.models`         | The named models declared in your project.                                                     |
  | `analysis.operations`     | The operations declared in your project.                                                       |
  | `analysis.httpOperations` | The same operations as HTTP operations: verb, path, parameters, responses.                     |
  | `analysis.services`       | The HTTP services, with their authentication.                                                  |
  | `options`                 | The rule's `defaults` merged with what the config gives.                                       |
  | `program`                 | The TypeSpec program, for anything the compiler API can answer (`getDoc(program, type)`, ...). |
  | `report(target, message)` | Report a finding on a type or a syntax node. Findings outside your project are dropped.        |

- typespeclint also exports what its own rules are written with: `matchesCase`, `splitWords`,
  `describeOperation`, `statusClass`, `formatStatus`, `isUserType`, `ownDataProperties`.

## Rules

Examples are fragments of a service: they assume `using Http;` and, unless they declare their
own namespace, `@service @useAuth(BearerAuth) namespace Shop;`. Every NG / OK example below is
compiled by the test suite, which checks that NG is reported and OK is not.

<!-- rules:start -->

| Rule                                                    | Category     | Checklist section        | `recommended` | Description                                                                            |
| ------------------------------------------------------- | ------------ | ------------------------ | ------------- | -------------------------------------------------------------------------------------- |
| [`breaking-change`](#breaking-change)                   | `evolution`  | Evolution                | warn          | The API must not break consumers of its published version.                             |
| [`security-scheme-used`](#security-scheme-used)         | `security`   | API security definitions | warn          | Every declared security scheme must be used by the API.                                |
| [`security-scheme-valid`](#security-scheme-valid)       | `security`   | API security definitions | warn          | Security schemes must carry valid, guideline-compliant machine-readable information.   |
| [`security-scope-valid`](#security-scope-valid)         | `security`   | API security definitions | warn          | OAuth2 scopes must be named consistently.                                              |
| [`operation-documented`](#operation-documented)         | `flows`      | API goal flows           | warn          | Operations must explain their use case with a doc comment or @doc.                     |
| [`model-used`](#model-used)                             | `models`     | Models                   | warn          | Every declared model must be used by an operation.                                     |
| [`model-naming`](#model-naming)                         | `models`     | Models                   | warn          | Model names must follow the guideline convention and be easy to understand.            |
| [`model-structure`](#model-structure)                   | `models`     | Models                   | warn          | Model composition and depth must stay within the guideline limits.                     |
| [`model-documented`](#model-documented)                 | `models`     | Models                   | warn          | Models must have a human-readable description.                                         |
| [`example-required`](#example-required)                 | `models`     | Models                   | off           | Payload models (and optionally operations) must carry an example.                      |
| [`property-naming`](#property-naming)                   | `properties` | Model properties         | warn          | Property names must follow the guideline convention and be easy to understand.         |
| [`property-required`](#property-required)               | `properties` | Model properties         | warn          | A model whose properties are all optional is probably a mistake.                       |
| [`property-type`](#property-type)                       | `properties` | Model properties         | warn          | Property types and formats must be valid for what the name says.                       |
| [`property-documented`](#property-documented)           | `properties` | Model properties         | warn          | Model properties must have a human-readable description.                               |
| [`standard-format`](#standard-format)                   | `properties` | Model properties         | off           | Data covered by a standard (ISO 4217, E.164, ...) must not be a free-form value.       |
| [`operation-tagged`](#operation-tagged)                 | `operations` | Goals                    | warn          | Operations should be categorized with @tag.                                            |
| [`operation-path`](#operation-path)                     | `operations` | Goals                    | warn          | Operation paths must follow the guideline format.                                      |
| [`operation-method`](#operation-method)                 | `operations` | Goals                    | warn          | HTTP methods must be allowed by the guidelines and fit what the operation does.        |
| [`operation-responses`](#operation-responses)           | `operations` | Goals                    | warn          | Operations must declare both success and error responses.                              |
| [`operation-secured`](#operation-secured)               | `operations` | Goals                    | warn          | Every operation must be covered by a security mechanism.                               |
| [`parameter-naming`](#parameter-naming)                 | `parameters` | Goal parameters          | warn          | Parameter names must follow the guideline convention for their location.               |
| [`parameter-required`](#parameter-required)             | `parameters` | Goal parameters          | warn          | Required status of parameters must be consistent with their location.                  |
| [`parameter-type`](#parameter-type)                     | `parameters` | Goal parameters          | warn          | Parameter types and formats must be valid for their name and location.                 |
| [`parameter-documented`](#parameter-documented)         | `parameters` | Goal parameters          | warn          | Parameters must have a human-readable description.                                     |
| [`parameter-location`](#parameter-location)             | `parameters` | Goal parameters          | warn          | Parameters must be sent in a location valid for the HTTP method and their sensitivity. |
| [`parameter-providable`](#parameter-providable)         | `parameters` | Goal parameters          | warn          | Consumers must be able to obtain every identifier an operation requires.               |
| [`response-status-code`](#response-status-code)         | `responses`  | Goal responses           | warn          | Response status codes must be allowed by the guidelines and fit the HTTP method.       |
| [`response-error-body`](#response-error-body)           | `responses`  | Goal responses           | warn          | Error responses must use the standard error model.                                     |
| [`response-problem-details`](#response-problem-details) | `responses`  | Goal responses           | off           | Error responses must be RFC 9457 problem details.                                      |
| [`response-header-naming`](#response-header-naming)     | `responses`  | Goal responses           | warn          | Response header names must follow the guideline convention.                            |
| [`response-documented`](#response-documented)           | `responses`  | Goal responses           | warn          | Responses must be described.                                                           |

### Evolution (`evolution`)

#### `breaking-change`

In `recommended`. The API must not break consumers of its published version.

Purpose: A change that breaks consumers must be a decision, not an accident. The rule compares the API with a baseline recorded when a version was published (`TYPESPECLINT_UPDATE_BASELINE=1 tsp compile .` writes `typespeclint.baseline.json`) and reports what a consumer of that version can no longer do: a removed operation, parameter or response property, a changed type, a parameter that became required. Additions a consumer can ignore are fine. Until a baseline is recorded, the rule reports that one is missing.

Published version (the baseline):

```tsp
@service
@useAuth(BearerAuth)
namespace Shop;

model Order { id: string; total: decimal; note?: string; }

@route("/orders") @get op listOrders(@query status?: string): Order[];
```

NG:

```tsp
@service
@useAuth(BearerAuth)
namespace Shop;

// 'total' is gone, and 'status' is now required.
model Order { id: string; note?: string; }

@route("/orders") @get op listOrders(@query status: string): Order[];
```

OK:

```tsp
@service
@useAuth(BearerAuth)
namespace Shop;

// A new property and a new optional parameter: existing consumers keep working.
model Order { id: string; total: decimal; note?: string; currency?: string; }

@route("/orders") @get op listOrders(@query status?: string, @query pageSize?: int32): Order[];
```

Default options:

```ts
{
  baseline: "typespeclint.baseline.json",
}
```

### API security definitions (`security`)

#### `security-scheme-used`

In `recommended`. Every declared security scheme must be used by the API.

Purpose: A security scheme that is declared but never applied is either dead code or a forgotten `@useAuth`. Apply it or delete it.

NG:

```tsp
model LegacyKey is ApiKeyAuth<ApiKeyLocation.header, "X-Legacy-Key">;

@service
@useAuth(BearerAuth)
namespace Shop {
  @route("/orders") @get op listOrders(): string[];
}
```

OK:

```tsp
model PartnerKey is ApiKeyAuth<ApiKeyLocation.header, "X-Partner-Key">;

@service
@useAuth(BearerAuth | PartnerKey)
namespace Shop {
  @route("/orders") @get op listOrders(): string[];
}
```

#### `security-scheme-valid`

In `recommended`. Security schemes must carry valid, guideline-compliant machine-readable information.

Purpose: Security schemes must carry correct machine-readable information: absolute https URLs, no API key in the query string, and none of the flows the guidelines forbid (`implicit` and `password` by default).

NG:

```tsp
model Implicit {
  type: OAuth2FlowType.implicit;
  authorizationUrl: "http://auth.example.com/authorize";
  scopes: ["orders:read"];
}

@service
@useAuth(OAuth2Auth<[Implicit]>)
namespace Shop {
  @route("/orders") @get op listOrders(): string[];
}
```

OK:

```tsp
model AuthorizationCode {
  type: OAuth2FlowType.authorizationCode;
  authorizationUrl: "https://auth.example.com/authorize";
  tokenUrl: "https://auth.example.com/token";
  scopes: ["orders:read"];
}

@service
@useAuth(OAuth2Auth<[AuthorizationCode]>)
namespace Shop {
  @route("/orders") @get op listOrders(): string[];
}
```

Default options:

```ts
{
  requireHttps: true,
  allowApiKeyInQuery: false,
  disallow: ["implicit","password"],
}
```

#### `security-scope-valid`

In `recommended`. OAuth2 scopes must be named consistently.

Purpose: Scopes are part of the contract consumers must understand. Name them with one pattern (lowercase words joined by `:` or `.` by default).

NG:

```tsp
model ClientCredentials {
  type: OAuth2FlowType.clientCredentials;
  tokenUrl: "https://auth.example.com/token";
  scopes: ["ReadOrders"];
}

@service
@useAuth(OAuth2Auth<[ClientCredentials]>)
namespace Shop {
  @route("/orders") @get op listOrders(): string[];
}
```

OK:

```tsp
model ClientCredentials {
  type: OAuth2FlowType.clientCredentials;
  tokenUrl: "https://auth.example.com/token";
  scopes: ["orders:read"];
}

@service
@useAuth(OAuth2Auth<[ClientCredentials]>)
namespace Shop {
  @route("/orders") @get op listOrders(): string[];
}
```

Default options:

```ts
{
  pattern: "^[a-z][a-z0-9]*([:.][a-z][a-z0-9]*)*$",
}
```

### API goal flows (`flows`)

#### `operation-documented`

In `recommended`. Operations must explain their use case with a doc comment or @doc.

Purpose: The description is where the use case of an operation is explained. Without it, reviewers and consumers have to guess what the goal is for.

NG:

```tsp
@route("/orders") @get op listOrders(): string[];
```

OK:

```tsp
/** List the orders of the signed-in customer, newest first. */
@route("/orders") @get op listOrders(): string[];
```

Default options:

```ts
{
  minLength: 1,
}
```

### Models (`models`)

#### `model-used`

In `recommended`. Every declared model must be used by an operation.

Purpose: A model no operation refers to is either left over or shows that an operation was forgotten. Use it or delete it.

NG:

```tsp
model Order { id: string; }
model Invoice { id: string; }

@route("/orders") @get op listOrders(): Order[];
```

OK:

```tsp
model Order { id: string; }

@route("/orders") @get op listOrders(): Order[];
```

Default options:

```ts
{
  ignore: [],
}
```

#### `model-naming`

In `recommended`. Model names must follow the guideline convention and be easy to understand.

Purpose: Model names should say what the data is, in one convention. Technical affixes such as `DTO` leak the provider's implementation.

NG:

```tsp
model account_dto { id: string; }
model AccountDTO { id: string; }
```

OK:

```tsp
model Account { id: string; }
```

Default options:

```ts
{
  case: "PascalCase",
  bannedSuffixes: ["DTO","Dto"],
  bannedPrefixes: [],
  minLength: 3,
}
```

#### `model-structure`

In `recommended`. Model composition and depth must stay within the guideline limits.

Purpose: Deeply nested or very wide models are hard to understand and to evolve. Keep depth and property count within limits. The defaults are generous; set `maxDepth` and `maxProperties` to what your guidelines say.

The examples assume `{"maxDepth":2}`.

NG:

```tsp
model Order { customer: Customer; }
model Customer { address: Address; }
model Address { city: string; }
```

OK:

```tsp
model Order { customerId: string; shippingAddress: Address; }
model Address { city: string; }
```

Default options:

```ts
{
  maxDepth: 5,
  maxProperties: 30,
}
```

#### `model-documented`

In `recommended`. Models must have a human-readable description.

Purpose: A model without a description forces readers to infer its meaning from its name alone.

NG:

```tsp
model Order { id: string; }
```

OK:

```tsp
/** A purchase made by a customer. */
model Order { id: string; }
```

#### `example-required`

Not in `recommended` (opt-in). Payload models (and optionally operations) must carry an example.

Purpose: Examples make the generated documentation show a real payload instead of a bare schema. Opt-in; set `operations: true` to also require `@opExample`.

NG:

```tsp
model Order { id: string; total: decimal; }
```

OK:

```tsp
@example(#{ id: "ord_123", total: 42.5 })
model Order { id: string; total: decimal; }
```

Default options:

```ts
{
  models: true,
  operations: false,
  ignore: [],
}
```

### Model properties (`properties`)

#### `property-naming`

In `recommended`. Property names must follow the guideline convention and be easy to understand.

Purpose: Property names follow one convention and avoid cryptic abbreviations: `message`, not `msg`; `errorMessage`, not `err_msg`.

NG:

```tsp
model Mail { err_msg: string; msg: string; }
```

OK:

```tsp
model Mail { errorMessage: string; message: string; }
```

Default options:

```ts
{
  case: "camelCase",
  bannedWords: ["msg","err","tmp","cnt"],
}
```

#### `property-required`

In `recommended`. A model whose properties are all optional is probably a mistake.

Purpose: A model whose properties are all optional accepts `{}`. That is rarely intended (models named `*Patch`, `*Filter`, ... are ignored by default).

NG:

```tsp
model Mail { email?: string; message?: string; }
```

OK:

```tsp
model Mail { email: string; message: string; replyTo?: string; }
```

Default options:

```ts
{
  minProperties: 2,
  ignore: ["Patch|Update|Query|Filter|Options|Params|Criteria"],
}
```

#### `property-type`

In `recommended`. Property types and formats must be valid for what the name says.

Purpose: The type must fit what the name promises: dates are date types (ISO 8601 / RFC 3339 on the wire), `is*` flags are booleans, `*Url` is a `url`, `*Count` is an integer.

NG:

```tsp
model Order { createdAt: string; isPaid: int32; itemCount: string; }
```

OK:

```tsp
model Order { createdAt: utcDateTime; isPaid: boolean; itemCount: int32; }
```

Default options:

```ts
{
  conventions: [{"pattern":"(At|Date|Timestamp)$","types":["utcDateTime","offsetDateTime","plainDate","plainTime","duration"]},{"pattern":"^is[A-Z]","types":["boolean"]},{"pattern":"(Url|Uri|URL|URI)$","types":["url","@format:uri","@format:url"]},{"pattern":"Count$","types":["integer"]}],
}
```

#### `property-documented`

In `recommended`. Model properties must have a human-readable description.

Purpose: Every property is described, so consumers do not have to guess units, formats or meaning.

NG:

```tsp
model Order { total: decimal; }
```

OK:

```tsp
model Order {
  /** Amount charged, taxes included. */
  total: decimal;
}
```

#### `standard-format`

Not in `recommended` (opt-in). Data covered by a standard (ISO 4217, E.164, ...) must not be a free-form value.

Purpose: When a standard exists for a piece of data (ISO 4217 currencies, ISO 3166-1 countries, BCP 47 languages, E.164 phone numbers, RFC 5322 e-mail, RFC 9562 UUIDs), use it instead of a free-form string. Opt-in; each standard can be switched off and `custom` adds your own.

NG:

```tsp
model Price { amount: decimal; currency: string; }
```

OK:

```tsp
/** ISO 4217 currency code. */
@pattern("^[A-Z]{3}$")
scalar CurrencyCode extends string;

model Price { amount: decimal; currency: CurrencyCode; }
```

Default options:

```ts
{
  currency: true,
  country: true,
  language: true,
  phone: true,
  email: true,
  uuid: true,
  custom: [],
}
```

### Goals (`operations`)

#### `operation-tagged`

In `recommended`. Operations should be categorized with @tag.

Purpose: Categorized operations are easier to find in the documentation.

NG:

```tsp
@route("/orders") @get op listOrders(): string[];
```

OK:

```tsp
@tag("orders")
@route("/orders") @get op listOrders(): string[];
```

#### `operation-path`

In `recommended`. Operation paths must follow the guideline format.

Purpose: Paths follow one format: kebab-case segments, camelCase path parameters and no trailing slash.

NG:

```tsp
@route("/order_items/{item_id}/") @get op readOrderItem(@path item_id: string): string;
```

OK:

```tsp
@route("/order-items/{itemId}") @get op readOrderItem(@path itemId: string): string;
```

Default options:

```ts
{
  segmentCase: "kebab-case",
  parameterCase: "camelCase",
  allowTrailingSlash: false,
  forbiddenSegments: [],
}
```

#### `operation-method`

In `recommended`. HTTP methods must be allowed by the guidelines and fit what the operation does.

Purpose: The HTTP method must fit what the operation does. By default it is inferred from the operation name (`get*` / `list*` are GET, `create*` is POST, `delete*` is DELETE, ...).

NG:

```tsp
@route("/orders/{orderId}") @post op deleteOrder(@path orderId: string): void;
```

OK:

```tsp
@route("/orders/{orderId}") @delete op deleteOrder(@path orderId: string): void;
```

Default options:

```ts
{
  allowed: ["get","post","put","patch","delete","head"],
  conventions: [{"pattern":"^(get|list|read|find|fetch)([A-Z_]|$)","methods":["get","head"]},{"pattern":"^search([A-Z_]|$)","methods":["get","post"]},{"pattern":"^(create|add)([A-Z_]|$)","methods":["post","put"]},{"pattern":"^(update|modify|patch)([A-Z_]|$)","methods":["put","patch"]},{"pattern":"^replace([A-Z_]|$)","methods":["put"]},{"pattern":"^(delete|remove)([A-Z_]|$)","methods":["delete"]}],
}
```

#### `operation-responses`

In `recommended`. Operations must declare both success and error responses.

Purpose: An operation declares every response it can return: at least one success and at least one error.

NG:

```tsp
@route("/orders") @get op listOrders(): string[];
```

OK:

```tsp
@error model ApiError { code: string; message: string; }

@route("/orders") @get op listOrders(): string[] | ApiError;
```

Default options:

```ts
{
  requireSuccess: true,
  requireError: true,
}
```

#### `operation-secured`

In `recommended`. Every operation must be covered by a security mechanism.

Purpose: Every operation is covered by a security scheme. A deliberately public operation says so with `@useAuth(NoAuth)`.

NG:

```tsp
@service
namespace Shop;

@route("/orders") @get op listOrders(): string[];
```

OK:

```tsp
@service
@useAuth(BearerAuth)
namespace Shop;

@route("/orders") @get op listOrders(): string[];

@useAuth(NoAuth)
@route("/health") @get op readHealth(): string;
```

Default options:

```ts
{
  allowNoAuth: true,
}
```

### Goal parameters (`parameters`)

#### `parameter-naming`

In `recommended`. Parameter names must follow the guideline convention for their location.

Purpose: Parameter names follow the convention of their location (camelCase for query and path, hyphenated header names) and avoid cryptic abbreviations.

NG:

```tsp
@route("/orders") @get op listOrders(@query page_size?: int32, @header("x_trace_id") traceId?: string): string[];
```

OK:

```tsp
@route("/orders") @get op listOrders(@query pageSize?: int32, @header("X-Trace-Id") traceId?: string): string[];
```

Default options:

```ts
{
  query: "camelCase",
  path: "camelCase",
  header: "http-header",
  cookie: false,
  bannedWords: ["msg","err","tmp","cnt"],
}
```

#### `parameter-required`

In `recommended`. Required status of parameters must be consistent with their location.

Purpose: A create / replace request whose body properties are all optional accepts `{}`, which is probably a mistake. Path parameters are always required.

NG:

```tsp
@route("/mails") @post op sendMail(@body mail: { email?: string; message?: string }): void;
```

OK:

```tsp
@route("/mails") @post op sendMail(@body mail: { email: string; message: string }): void;
```

Default options:

```ts
{
  bodyMethods: ["post","put"],
}
```

#### `parameter-type`

In `recommended`. Parameter types and formats must be valid for their name and location.

Purpose: Query, path and header parameters are simple values, not objects, and their type fits what the name promises (same conventions as `property-type`).

NG:

```tsp
model OrderFilter { status: string; }

@route("/orders") @get op listOrders(@query filter?: OrderFilter, @query createdAt?: int64): string[];
```

OK:

```tsp
@route("/orders") @get op listOrders(@query status?: string, @query createdAt?: utcDateTime): string[];
```

Default options:

```ts
{
  allowObjects: false,
  conventions: [{"pattern":"(At|Date|Timestamp)$","types":["utcDateTime","offsetDateTime","plainDate","plainTime","duration"]},{"pattern":"^is[A-Z]","types":["boolean"]},{"pattern":"(Url|Uri|URL|URI)$","types":["url","@format:uri","@format:url"]},{"pattern":"Count$","types":["integer"]}],
}
```

#### `parameter-documented`

In `recommended`. Parameters must have a human-readable description.

Purpose: Every parameter is described.

NG:

```tsp
@route("/orders") @get op listOrders(@query pageSize?: int32): string[];
```

OK:

```tsp
@route("/orders") @get op listOrders(
  /** Maximum number of orders to return. */
  @query pageSize?: int32,
): string[];
```

#### `parameter-location`

In `recommended`. Parameters must be sent in a location valid for the HTTP method and their sensitivity.

Purpose: Parameters travel in a location that suits the method and the data: no body on GET / HEAD / DELETE, and nothing sensitive in the URL, where it ends up in logs and browser history.

NG:

```tsp
@route("/sessions") @delete op deleteSession(@query accessToken: string, @body reason: string): void;
```

OK:

```tsp
@route("/sessions") @delete op deleteSession(@header authorization: string, @query reason?: string): void;
```

Default options:

```ts
{
  noBodyMethods: ["get","head","delete"],
  sensitiveWords: ["password","passwd","secret","apikey","credential","ssn","accesstoken","refreshtoken","idtoken","authtoken","sessiontoken"],
}
```

#### `parameter-providable`

In `recommended`. Consumers must be able to obtain every identifier an operation requires.

Purpose: A consumer can only call a goal if it can supply its parameters: it knows the value, or another goal returns it. The rule checks identifiers (`*Id` by default): some operation must return the value without requiring it. Names consumers know anyway go in `known`. The rule reasons from names: `orderId` is providable when an operation returns an `Order` with an `id`, or a property named `orderId`.

NG:

```tsp
model Order { id: string; total: decimal; }

// Nothing returns an order id: where would a consumer get one?
@route("/orders/{orderId}") @get op readOrder(@path orderId: string): Order;
```

OK:

```tsp
model Order { id: string; total: decimal; }

@route("/orders") @get op listOrders(): Order[];
@route("/orders/{orderId}") @get op readOrder(@path orderId: string): Order;
```

Default options:

```ts
{
  pattern: "Id$",
  known: [],
}
```

### Goal responses (`responses`)

#### `response-status-code`

In `recommended`. Response status codes must be allowed by the guidelines and fit the HTTP method.

Purpose: Only the status codes the guidelines allow are used, and the success code fits the method (for example GET does not return 201).

NG:

```tsp
model Teapot { @statusCode statusCode: 418; }
model Created { @statusCode statusCode: 201; @body body: string; }

@route("/orders/{orderId}") @get op readOrder(@path orderId: string): Created | Teapot;
```

OK:

```tsp
@route("/orders/{orderId}") @get op readOrder(@path orderId: string): string | NotFoundResponse;
```

Default options:

```ts
{
  allowed: [200,201,202,204,206,301,302,303,304,307,308,400,401,403,404,405,406,408,409,410,412,413,415,422,429,500,501,502,503,504],
  allowDefault: true,
  successByMethod: {"get":[200,206],"head":[200,204],"post":[200,201,202,204],"put":[200,201,202,204],"patch":[200,202,204],"delete":[200,202,204]},
}
```

#### `response-error-body`

In `recommended`. Error responses must use the standard error model.

Purpose: Every error response returns the standard error model: a model decorated with `@error`, or one of the models named in `models`. Consumers then handle all errors one way.

NG:

```tsp
model Failure { @statusCode statusCode: 400; message: string; }

@route("/orders") @get op listOrders(): string[] | Failure | NotFoundResponse;
```

OK:

```tsp
@error model ApiError { code: string; message: string; }

@route("/orders") @get op listOrders(): string[] | ApiError;
```

Default options:

```ts
{
  requireBody: false,
  requireErrorDecorator: true,
}
```

#### `response-problem-details`

Not in `recommended` (opt-in). Error responses must be RFC 9457 problem details.

Purpose: Error bodies follow RFC 9457 problem details (`type`, `title`, `status`, `detail`, `instance`) and are sent as `application/problem+json`. Opt-in; `requiredMembers`, `requireContentType` and `typePattern` adapt it to your guidelines.

NG:

```tsp
@error model NotFound { @statusCode statusCode: 404; message: string; }

@route("/orders/{orderId}") @get op readOrder(@path orderId: string): string | NotFound;
```

OK:

```tsp
model NotFoundProblem {
  type: "/problems/not-found";
  title: string;
  status: 404;
  detail: string;
  instance: string;
}

@error model NotFoundProblemResponse {
  @statusCode statusCode: 404;
  @header contentType: "application/problem+json";
  @body body: NotFoundProblem;
}

@route("/orders/{orderId}") @get op readOrder(@path orderId: string): string | NotFoundProblemResponse;
```

Default options:

```ts
{
  requiredMembers: ["type","title","status","detail","instance"],
  requireContentType: true,
  requireMatchingStatus: true,
}
```

#### `response-header-naming`

In `recommended`. Response header names must follow the guideline convention.

Purpose: Response header names follow one convention (hyphen-separated words by default).

NG:

```tsp
model OrderList { @header("x_total_count") totalCount: int32; @body body: string[]; }

@route("/orders") @get op listOrders(): OrderList;
```

OK:

```tsp
model OrderList { @header("X-Total-Count") totalCount: int32; @body body: string[]; }

@route("/orders") @get op listOrders(): OrderList;
```

Default options:

```ts
{
  case: "http-header",
}
```

#### `response-documented`

In `recommended`. Responses must be described.

Purpose: A response says what happened and, for errors, what to do about it. Without a description of its own it only carries the generic text of its status code.

NG:

```tsp
@route("/orders") @get op listOrders(): string[];
```

OK:

```tsp
@returnsDoc("The identifiers of the orders of the signed-in customer.")
@route("/orders") @get op listOrders(): string[];
```

<!-- rules:end -->

## What is not automated

These checklist items need a reviewer:

- Whether a goal flow is valid: it behaves as the guidelines say and consistently with existing
  flows.
- Whether the data a response returns is actually used by consumers.
- Whether a description is accurate. Only its presence is checked.
- Consistency with other APIs beyond what naming and type conventions in the config can express.

Three rules reach further than a single declaration, with limits to know about:

- `breaking-change` compares the API with a baseline you record when a version is published. It
  sees what an operation takes and returns, not changes of behavior.
- `parameter-providable` reasons from names: `orderId` is providable when an operation returns an
  `Order` with an `id`, or a property named `orderId`.
- `security-scope-valid` checks scope names only: TypeSpec has no syntax to describe a scope.

## License

[MIT](https://github.com/nakita628/tsplint/blob/main/LICENSE)

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm check         # format check, lint with type information, type check
pnpm readme        # regenerate the rule reference above and the header comment of each rule
pnpm bench         # time the linter on a generated API (pass a size: pnpm bench 600)
```

The repository-wide checks (prose lint, generated files) are described in
[CONTRIBUTING.md](https://github.com/nakita628/tsplint/blob/main/CONTRIBUTING.md).

To add a rule: write it with `defineRule` in `src/rules/`, add it to `ruleSpecs` in
`src/rules/index.ts`, and add its purpose and NG / OK example to `src/rules/docs.ts` (a missing
entry is a type error, a wrong example fails `test/docs.test.ts`). `pnpm readme` copies them into
this README and into the header comment above the rule.
