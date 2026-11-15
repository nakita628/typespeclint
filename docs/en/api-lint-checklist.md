# The API lint checklist

[日本語](../ja/api-lint-checklist.md)

typespeclint automates an API lint checklist for TypeSpec. This page summarizes that checklist: what
each check asks, which typespeclint rule covers it, and what is left to a reviewer.

## Where linting fits

An API is reviewed several times before it is implemented. Each review answers a different
question.

| Step                         | Question                                                 | Who           |
| ---------------------------- | -------------------------------------------------------- | ------------- |
| 1. Validate the needs        | Is an API the right solution, and for which need?        | People        |
| 2. Lint the design           | Does the interface contract follow the design rules?     | Mostly a tool |
| 3. Review as the provider    | Is it secure, implementable and able to evolve?          | People        |
| 4. Review as a consumer      | Is it understandable and easy to use?                    | People        |
| 5. Verify the implementation | Does the implementation expose the contract as designed? | Tests         |

Linting has two tasks: finding bugs in the design (a wrong property type), and verifying that
the design follows the guidelines and stays consistent with what exists. Security and
documentation are linted too: everything in the description file is in scope.

Linting checks the form of the contract, not its content. A design that passes every rule can
still answer the wrong need, or be unusable. Automating step 2 is worth it for one reason: the
reviewers of steps 3 and 4 can then spend their time on what only people can judge.

## The checklist

Each table lists the checks of one section. The last column says how far typespeclint goes:

- **Automated**: a rule decides.
- **Partly**: a rule checks what can be decided mechanically (for example that a description
  exists), and a reviewer judges the rest (that it is accurate).
- **Review**: no rule. A person has to look.

The section names are also the `categories` of `typespeclint.config.ts`.

### Evolution (`evolution`)

Applies to every topic below.

| Check            | What to verify                                                                                  | typespeclint                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Breaking changes | A change that breaks consumers is really necessary. If it is, the versioning policy is applied. | Partly: `breaking-change` compares the API with a recorded baseline and reports what breaks. Whether the change is necessary is a person's call. |

### API security definitions (`security`)

| Check     | What to verify                                                                                    | typespeclint                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Used      | Every security definition is used. An unused one is either a forgotten `@useAuth` or dead code.   | Automated: `security-scheme-used`                                                                     |
| Valid     | Each definition carries the machine-readable information its type needs, as the guidelines allow. | Automated: `security-scheme-valid`                                                                    |
| Described | Every scope has a suitable description.                                                           | Partly: `security-scope-valid` checks the scope names. TypeSpec has no syntax for scope descriptions. |

### API goal flows (`flows`)

A goal is something a consumer achieves with the API: one operation. A flow is the sequence of
goals of a use case.

| Check     | What to verify                                                            | typespeclint                                           |
| --------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| Valid     | Flows behave as the guidelines say and consistently with existing ones.   | Review                                                 |
| Described | Each use case is explained in the description of the API or of its goals. | Partly: `operation-documented` requires a description. |

### Models (`models`)

| Check          | What to verify                                                         | typespeclint                                                      |
| -------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Used           | Every model is used by a goal.                                         | Automated: `model-used`                                           |
| Name           | The name follows the guidelines and is consistent with existing names. | Automated: `model-naming`                                         |
| Data structure | Composition and depth follow the guidelines.                           | Partly: `model-structure` limits depth and property count.        |
| Described      | A human-readable description is there, and it is accurate.             | Partly: `model-documented` and `example-required` check presence. |

### Model properties (`properties`)

| Check           | What to verify                                                                                                 | typespeclint                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Name            | The name follows the guidelines: `errorMessage`, not `err_msg`.                                                | Automated: `property-naming`                                                |
| Required status | Optional and required properties are as intended. A model whose properties are all optional is probably wrong. | Partly: `property-required` finds all-optional models.                      |
| Type and format | Type and format fit the name, the value and the description: an ISO 8601 date is a date type, not a string.    | Partly: `property-type` and `standard-format` apply name-based conventions. |
| Described       | The human-readable description and the machine-readable constraints (`minimum`, ...) are valid.                | Partly: `property-documented` checks presence.                              |

### Goals (`operations`)

| Check              | What to verify                                                                                                             | typespeclint                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Categorized        | Goals are grouped. Not mandatory, but it makes the API easier to read.                                                     | Automated: `operation-tagged`                                                          |
| Path               | The path format follows the guidelines and suits the type of the success response. Path parameters that are defined exist. | Automated: `operation-path`. TypeSpec itself checks that path parameters are declared. |
| HTTP method        | The method follows the guidelines and suits what the goal does.                                                            | Partly: `operation-method` infers the expected method from the operation name.         |
| Success and errors | The goal returns every response needed for success and for failure.                                                        | Partly: `operation-responses` requires at least one of each.                           |
| Secure             | A security mechanism covers the goal.                                                                                      | Automated: `operation-secured`                                                         |

### Goal parameters (`parameters`)

| Check           | What to verify                                                                                                                   | typespeclint                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Name            | The name follows the guidelines for its location.                                                                                | Automated: `parameter-naming`                                                      |
| Required status | Path parameters are required. A create or replace body whose properties are all optional is probably wrong.                      | Automated: `parameter-required`                                                    |
| Type and format | Type and format are valid for the location: no object in a query parameter, no character forbidden in a URL in a path parameter. | Partly: `parameter-type` and `standard-format`                                     |
| Described       | Description and constraints are valid.                                                                                           | Partly: `parameter-documented` checks presence.                                    |
| Location        | The location suits the HTTP method: no body on a delete request. Nothing sensitive in the URL.                                   | Automated: `parameter-location`                                                    |
| Providable      | The consumer can supply each parameter: it knows the value or gets it from another goal.                                         | Partly: `parameter-providable` checks that some operation returns each identifier. |

### Goal responses (`responses`)

| Check             | What to verify                                                              | typespeclint                                                                                                                |
| ----------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| HTTP status       | The status follows the guidelines and suits the kind of response.           | Automated: `response-status-code`                                                                                           |
| Body              | Body type and format suit the status: errors use the standard error model.  | Automated: `response-error-body`, `response-problem-details` (opt-in, RFC 9457)                                             |
| Headers           | Header names, types and formats follow the guidelines.                      | Partly: `response-header-naming` checks the names.                                                                          |
| Used              | The data a response returns is actually used.                               | Review                                                                                                                      |
| Success described | Description and model of success responses are valid and accurate.          | Partly: `response-documented` requires a description.                                                                       |
| Errors described  | Errors give useful detail, human-readable and if possible machine-readable. | Partly: `response-documented` requires a description; `response-error-body` and `response-problem-details` check the shape. |

## What `recommended` covers

The lint checklist above has 31 checks. With `typespeclint/recommended` and no further configuration:

| Coverage                | Checks | Which                                         |
| ----------------------- | ------ | --------------------------------------------- |
| A recommended rule runs | 29     | Every check marked Automated or Partly above. |
| No rule can exist       | 2      | Goal flows: valid. Goal responses: used.      |

The two uncovered checks need information a TypeSpec description does not contain: how a flow
behaves, and whether consumers use the data they receive. A reviewer checks them.

A rule running is not the same as a guarantee. The 29 checks are covered to different depths:

| Depth                | What the rule decides                                                                      | Checks                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Form                 | The rule judges the declaration fully.                                                     | Naming, path format, status codes, unused models and security definitions, security coverage, parameter location, required status.       |
| Presence             | Something is there. Whether it is accurate is a reviewer's call.                           | Every "described" check: models, properties, parameters, operations, responses.                                                          |
| Inference from names | The rule expects something from a name. A different naming style can escape it or trip it. | HTTP method (from the operation name), type and format (from the property name), providable parameters (from `*Id`).                     |
| Part of the check    | Only what TypeSpec exposes.                                                                | Scopes (names only: no syntax for descriptions), headers (names only), breaking changes (what operations take and return, not behavior). |

Three rules are not in `recommended` because they go beyond the checklist: `example-required`,
`standard-format` and `response-problem-details`. Switch them on in `typespeclint.config.ts`.

Two things to know when adopting `recommended` on an existing API:

- The "described" rules report every property, parameter and response without a
  description. On an API
  that was not written with them, expect many findings, all true.
- `breaking-change` reports that no baseline exists until you record one:
  `TYPESPECLINT_UPDATE_BASELINE=1 tsp compile . --no-emit`.

## Three checks that need care

Most checks are simple and binary. Three kinds are not.

**Documentation.** A fully documented contract makes the provider and consumer reviews much
easier. A tool can require that a description exists. Whether it is right is a person's call.

**Flows.** Checking that a consumer can actually go through a use case is simple, and it is what
proves the API works. A consumer that cannot supply a parameter cannot use the goal.

**Consistency with what exists.** This is the hardest check and the most important. Names, data
models and behavior must match the rest of the API, the other APIs of the organization, and
standards. Skip it and the same thing ends up represented three ways. Nobody can know the whole
API surface of an organization, so use the documentation of the APIs, and make it searchable. Check for an existing
standard before inventing a format: ISO 8601 for dates, ISO 4217 for currencies, E.164 for phone
numbers. When you find one, add it to the guidelines; the catalog of standards the API needs builds up
quickly. When an existing API evolves, also check for breaking changes. With typespeclint, that means a `conventions` or
`custom` entry in `typespeclint.config.ts`.

## Validating the needs

Do this before thinking about URLs and HTTP methods, and as early as possible. The need first
imagined and the real need are often different. For example, a team designs an API that
sends an e-mail with any content to any address. Asking why it is needed shows the real need:
tell customers that their profile changed. The safe solution is an event the notification system
subscribes to, not a REST API.

There is no single right method. These questions are a starting point.

| Topic                  | Questions                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The need               | What is to be done, and in which context? How will the solution be used? Who are the target consumers and the end users? Ask "why" about each answer, about five times, to reach the root need. Once the real need is roughly clear, fill in the API goals canvas.                                                                                                                                                                                   |
| The consumer's context | Who are the consumers and end users (this sets direction: industry standards, internationalization, security)? Do consumers have constraints, such as XML only or no PATCH? Is there an industry standard the consumers already use? Prefer it to a new format. What is the network environment? It may call for an experience API or a backend for frontend.                                                                                        |
| The provider's context | Which existing systems, APIs, teams or partners are needed? Find dependencies early. Are there technical limits (not available around the clock, asynchronous only, slow, not scalable)? Are there functional limits, such as business rules of existing systems that do not fit the need? Are people involved in the processing? Which kind of communication and which kind of API are needed? Is an API the solution at all, or only a part of it? |
| Security               | Does the API handle sensitive data or actions? The answer shapes the design and the implementation.                                                                                                                                                                                                                                                                                                                                                  |

This is iterative and involves the people who define the need, implement it and secure it. It
applies the same way to a new goal in an existing API, to a new API, and to something that is
not an API.

## Reviewing as the provider

A linted design is not yet a good one from the provider's side. The whole team checks that it
meets the needs, is secure, can be implemented and can evolve. The same few criteria come back
for every topic:

| Criterion         | Where it applies                                                                                                                                             | What to verify                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matches the needs | Flows and goals (purpose), models (data structure), properties and parameters (required status, type and format, values), responses (success and error data) | The design represents the expected concepts and nothing else. Success responses are complete. Error responses cover control, functional, security and technical errors.                                                                                                   |
| Secure            | Security definitions (scopes), properties (values), goals (path, coverage), parameters (data, location), responses (success and error data)                  | Scopes match the security partitioning. No sensitive data is exposed or requested without reason, and where it is needed it has a safe representation and a safe location. Sensitive data never goes in the URL. Goals are covered by the intended scopes and mechanisms. |
| Exists            | Property values, success and error data                                                                                                                      | The implementation can really provide the data, directly or through its dependencies. Data used as a parameter can be requested.                                                                                                                                          |
| Implementable     | Goals                                                                                                                                                        | The goal can be implemented, directly or through dependencies.                                                                                                                                                                                                            |
| Performance       | Flows (cumulated), goals                                                                                                                                     | Estimated performance matches the needs.                                                                                                                                                                                                                                  |
| Extensible        | Every topic                                                                                                                                                  | The design leaves reasonable room for future evolution.                                                                                                                                                                                                                   |

typespeclint covers only the mechanical part: `operation-secured` for coverage, `parameter-location`
for sensitive values in the URL, `operation-responses` for the presence of success and error
responses.

## Reviewing as a consumer

Become a consumer who knows nothing about the API. Check that each goal, parameter and response,
errors above all, makes sense to that consumer and does not expose how the provider works inside.

| Topic                | What to verify                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security definitions | Scopes mean something to the consumer.                                                                                                                                                                                                                                                                                                                      |
| Goal flows           | Goals prevent errors (for example a goal that lists valid destination accounts before a transfer). The number of steps is as small as possible. Estimated performance suits the consumer. Each step makes sense.                                                                                                                                            |
| Models               | Structure, depth and granularity are easy to understand and use. A parameter model has the minimum of properties. Names are easy to understand: `Account`, not `aDTO`.                                                                                                                                                                                      |
| Model properties     | Only what is really needed is required. Names are clear: `source`, not `ts`. Types and formats are easy to understand and use: an ISO 8601 date rather than a Unix timestamp, `"CHECKING"` rather than `"2"`. Values are ready to use: an age next to a birth date, a localized label next to a code, an account number rather than a technical identifier. |
| Goals                | The structure and names of the path and its parameters are easy to understand. The goal means something to the consumer. Estimated performance suits the consumer.                                                                                                                                                                                          |
| Goal parameters      | The same as for properties: minimal, clearly named, easy types and formats, usable values. The consumer can provide each one.                                                                                                                                                                                                                               |
| Goal responses       | Success returns everything needed, with informative data: what was done, what to do next. Errors give complete, informative feedback that actually helps solve the problem.                                                                                                                                                                                 |

Check performance for both simple and complex use cases. Do not hesitate to have people outside
the team review the design, ideally future consumers.

typespeclint helps with the naming and type examples above (`model-naming`, `property-naming`,
`property-type`). The rest is a person's judgment.

## Verifying the implementation

Once every review is done, the API can be implemented. The designer may still have to help check
that the implementation exposes the contract as designed. How to test an implementation is out
of scope here; these are a few pitfalls.

- **Do not skip security tests.** Access control has two levels: only registered consumers can
  call the API and only within their scopes; and a consumer acting for an end user only reaches
  what that end user is allowed to. Sensitive data must not be returned without reason, and must
  be protected when it is needed.
- **Be careful when comparing with generated documentation.** A description file generated from
  code only proves what does not depend on annotations added to generate it. An annotation saying
  a property has two values does not guarantee the code returns only those.
- **Check the contract at run time.** A contract that says a missing required property returns
  400 is a claim until a test shows it.
- **Check property specifications in responses.** A property declared required must always be
  returned. The same goes for minimum, maximum and item counts.
- **Test the whole network chain.** Firewalls, proxies and API gateways can block a method,
  replace a status or return an error in another format.

typespeclint does not test implementations.

## Communicating and sharing

An API designer does not work alone, and a design has to be shared.

- Use a standard API description format, and keep the files in source control.
- Make the guidelines easy to understand, and make sure every designer knows they exist.
- Make existing APIs and data models easy to find, and searchable if possible: source control, a
  wiki, an API catalog or a developer portal. Consistency checks depend on this.
- Have your design reviewed by colleagues, take part in other reviews, and join or start a
  community of API designers. Above all, have real consumers review the design.

In a review, the designer questions and justifies the design from every side. The aim is to help
the API grow, not to impose an expert's opinion on everyone.

## Using the checklist with typespeclint

```ts
import { defineConfig } from 'typespeclint'

export default defineConfig({
  // The recommended rules, as warnings.
  extends: ['recommended'],

  // A whole section of the checklist at once.
  categories: {
    security: 'error',
  },

  // One rule: severity and options.
  rules: {
    'response-problem-details': 'error',
    'property-naming': ['warn', { case: 'snake_case' }],
  },
})
```

The [typespeclint README](../../packages/tsplint/README.md) documents every rule with a purpose and
an NG / OK example.
[`examples/config`](../../examples/config) is a project configured this way.

## Writing a custom rule

The checklist says, check after check, "follows the guidelines". Some of your guidelines will
not be covered by a built-in rule. Write those as custom rules in `typespeclint.config.ts`.

### 1. Declare the rule

A rule is a name, a description, default options, and a `run` function that looks at the API
and reports findings.

```ts
import { defineRule } from 'typespeclint'

// Our guideline: money is never a floating-point number.
const noFloatAmount = defineRule<{ names: string[] }>()({
  name: 'no-float-amount',
  description: 'Amounts must not be floating-point numbers.',
  category: 'properties',
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
```

| Field         | Meaning                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | The rule's name, in kebab-case. Findings are reported as `typespeclint/<name>`. It must differ from the built-in names.                                                                      |
| `description` | One line saying what the rule requires.                                                                                                                                                      |
| `category`    | Optional. The checklist section the rule belongs to (`evolution`, `security`, `flows`, `models`, `properties`, `operations`, `parameters`, `responses`), so that `categories` applies to it. |
| `defaults`    | The default options. Use `{}` and `defineRule()` for a rule without options.                                                                                                                 |
| `run`         | Called once per compilation. Report every finding with `report(target, message)`.                                                                                                            |

The type given to `defineRule<...>()` is the type of the options. It is what makes the options
type-checked in `rules`.

### 2. Look at the API

`run` receives the API already collected, so a rule rarely has to walk the program itself.

| Property                  | What it is                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `analysis.models`         | The named models declared in your project.                                                    |
| `analysis.operations`     | The operations declared in your project.                                                      |
| `analysis.httpOperations` | The same operations as HTTP operations: `verb`, `path`, `parameters`, `responses`.            |
| `analysis.services`       | The HTTP services, with their authentication.                                                 |
| `options`                 | `defaults` merged with what the config gives.                                                 |
| `program`                 | The TypeSpec program, for anything the compiler API answers, such as `getDoc(program, type)`. |

typespeclint exports the functions its own rules use: `matchesCase` and `splitWords` for names,
`describeOperation`, `statusClass` and `formatStatus` for HTTP operations, `isUserType` and
`ownDataProperties` for types.

A rule on operations looks the same:

```ts
import { defineRule, describeOperation } from 'typespeclint'

const noRpcPath = defineRule()({
  name: 'no-rpc-path',
  description: 'Paths name resources, not actions.',
  category: 'operations',
  defaults: {},
  run({ analysis, report }) {
    for (const operation of analysis.httpOperations) {
      if (/\/(send|create|update|delete|get)[-_/]/.test(`${operation.path}/`)) {
        report(operation.operation, `${describeOperation(operation)}: the path names an action.`)
      }
    }
  },
})
```

### 3. Report findings

`report(target, message)` takes the type the finding is about and a message.

- Report on the most precise target: the property rather than its model, the operation rather
  than its interface. The finding is shown at that declaration.
- Write a message that says what is wrong and how to fix it, with the name of the thing.
- Findings on types declared outside your project (libraries) are dropped. Report on something
  the author of the API can change.

### 4. Register and configure it

```ts
import { defineConfig } from 'typespeclint'

export default defineConfig({
  extends: ['recommended'],
  customRules: [noFloatAmount, noRpcPath],
  rules: {
    'no-float-amount': ['error', { names: ['amount', 'balance'] }],
  },
})
```

A rule listed in `customRules` runs as a warning. In `rules`, it takes the same settings as a
built-in rule: `'off'`, `'warn'`, `'error'`, or `['error', { ... }]` with options. Where a
finding is deliberate, suppress it at the declaration:

```tsp
#suppress "typespeclint/no-float-amount" "exchange rate, not an amount"
model Rate { amount: float64; }
```

### 5. Keep it honest

A rule is part of your guidelines, so document it the way the built-in rules are documented: a
purpose, an example that violates it and one that passes. Then write those two examples as
TypeSpec in your repository and lint them. A rule that no example triggers tends to stop working
without anyone noticing.

[`examples/banking/typespeclint.config.ts`](../../examples/banking/typespeclint.config.ts) declares the
two rules above.
