// The fixed values shared across modules. Imports only types.
import type { CaseName, StandardSpec, TypeConvention } from '../types/index.js'

/** Name of the TypeSpec library; rule ids are `<LIBRARY_NAME>/<rule>`. */
export const LIBRARY_NAME = 'typespeclint'

/** Sections of the API lint checklist. Every rule belongs to one. */
export const CATEGORIES = {
  evolution: 'Evolution',
  security: 'API security definitions',
  flows: 'API goal flows',
  models: 'Models',
  properties: 'Model properties',
  operations: 'Goals',
  parameters: 'Goal parameters',
  responses: 'Goal responses',
} as const

export type Category = keyof typeof CATEGORIES

/** Baseline file `breaking-change` compares the API with, relative to the project root. */
export const BASELINE_FILE = 'typespeclint.baseline.json'

/** Environment variable that makes `breaking-change` write the baseline instead of comparing. */
export const UPDATE_BASELINE_ENV = 'TYPESPECLINT_UPDATE_BASELINE'

/** Name of the built-in rule that runs the `customRules` of a config. */
export const CUSTOM_RULES_HOST = 'custom-rules'

/** Config file names, in the order they are looked up in a directory. */
export const CONFIG_FILE_NAMES = [
  'typespeclint.config.ts',
  'typespeclint.config.mts',
  'typespeclint.config.js',
  'typespeclint.config.mjs',
] as const

/**
 * Marker option the `recommended` ruleset passes to every rule. A rule enabled
 * this way is driven by `typespeclint.config.*` alone (`extends`, `categories`, `rules`).
 * Rules enabled any other way (the `all` ruleset, `linter.enable` in tspconfig.yaml)
 * start as warnings whatever `extends` says; the config can still change or stop them.
 */
export const PRESET_OPTION = 'preset'

/** Regular expression of each built-in naming convention. */
export const CASES: Record<CaseName, RegExp> = {
  camelCase: /^[a-z][a-zA-Z0-9]*$/,
  PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
  snake_case: /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/,
  SCREAMING_SNAKE_CASE: /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/,
  'kebab-case': /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
  'Train-Case': /^[A-Z][a-zA-Z0-9]*(-[A-Z][a-zA-Z0-9]*)*$/,
  // Header names are case-insensitive: accept hyphen separated alphanumerics.
  'http-header': /^[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)*$/,
}

/** Name-to-type conventions `property-type` and `parameter-type` start from. */
// DEFAULT (may change): heuristics of ours. Each one was narrowed after it misfired on valid code.
export const DEFAULT_TYPE_CONVENTIONS: TypeConvention[] = [
  {
    // Not `*Time`: `responseTime` is a duration in some unit, usually a number.
    pattern: '(At|Date|Timestamp)$',
    types: ['utcDateTime', 'offsetDateTime', 'plainDate', 'plainTime', 'duration'],
  },
  // Not `has*` / `can*`: `hasChildren` may well be the children.
  { pattern: '^is[A-Z]', types: ['boolean'] },
  { pattern: '(Url|Uri|URL|URI)$', types: ['url', '@format:uri', '@format:url'] },
  { pattern: 'Count$', types: ['integer'] },
]

/** Abbreviations `property-naming` and `parameter-naming` ban by default. */
// DEFAULT (may change): a short list of ours; add the abbreviations your guidelines ban.
export const DEFAULT_BANNED_WORDS = ['msg', 'err', 'tmp', 'cnt']

/** Standards `standard-format` knows, with the names of the properties each one covers. */
// DEFAULT (may change): the standards are real; the name patterns that select them are ours.
export const STANDARDS = {
  currency: { standard: 'ISO 4217', pattern: '^currency(Code)?$|Currency(Code)?$' },
  country: { standard: 'ISO 3166-1', pattern: '^country(Code)?$|Country(Code)?$' },
  language: {
    standard: 'BCP 47 (RFC 5646)',
    pattern: '^(language|locale)(Code|Tag)?$|(Language|Locale)(Code|Tag)?$',
  },
  phone: {
    standard: 'E.164',
    pattern: '^(phone|tel|mobile|fax)(Number)?$|(Phone|Tel|Mobile|Fax)(Number)?$',
  },
  email: { standard: 'RFC 5322', pattern: '^email(Address)?$|Email(Address)?$' },
  uuid: { standard: 'RFC 9562', pattern: '^uuid$|Uuid$' },
} as const satisfies Record<string, StandardSpec>

/** The standards of `STANDARDS`, in the order they are documented. */
export const STANDARD_KEYS = ['currency', 'country', 'language', 'phone', 'email', 'uuid'] as const

/** Media type of RFC 9457 problem details. */
export const PROBLEM_JSON = 'application/problem+json'

/** Enums of `TypeSpec.Http` whose members type the `type` property of a security definition. */
export const AUTH_SCHEME_ENUM = 'AuthType'
export const OAUTH2_FLOW_ENUM = 'OAuth2FlowType'

/** Source the examples are placed in unless they are `standalone`. */
export const EXAMPLE_PRELUDE = '@service\n@useAuth(BearerAuth)\nnamespace Shop;\n'
