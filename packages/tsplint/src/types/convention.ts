// Naming conventions and name-based conventions, as they appear in rule options.
/** Built-in naming conventions. Any other string is treated as a regular expression source. */
export type CaseName =
  | 'camelCase'
  | 'PascalCase'
  | 'snake_case'
  | 'SCREAMING_SNAKE_CASE'
  | 'kebab-case'
  | 'Train-Case'
  | 'http-header'

/** A built-in case name, or a regular expression source such as `"^[a-z]+$"`. */
export type CaseSpec = CaseName | (string & {})

/** "Names matching `pattern` must have one of `types`". */
export interface TypeConvention {
  /** Regular expression source tested against the property / parameter name. */
  pattern: string
  /**
   * Accepted type names. A scalar matches when it is, or extends, one of them.
   * `@format:<name>` accepts a value declared with that `@format`, e.g. `@format:uri`.
   */
  types: string[]
}

export interface StandardSpec {
  /** Name of the standard shown in the message, e.g. `"ISO 4217"`. */
  standard: string
  /** Regular expression source tested against the property / parameter name. */
  pattern: string
}
