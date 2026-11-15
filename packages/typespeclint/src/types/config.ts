// The shape of `typespeclint.config.*`.
import type { Category } from '../constants/index.js'
import type { RuleOptionsMap } from '../rules/index.js'
import type { AnyRuleSpec, RuleSpec } from './rule.js'

export type RuleName = keyof RuleOptionsMap

/** `"off"` does not run the rule, `"warn"` reports warnings, `"error"` fails the compilation. */
export type Severity = 'off' | 'warn' | 'error'

/**
 * Per-rule setting, in the style of ESLint / oxlint.
 * - `"off"` / `"warn"` / `"error"`: set the severity, keep the default options.
 * - `["warn", { ... }]`: set the severity and override options (shallow merge over the defaults).
 * - `{ ... }`: override options; the rule runs at its current severity, or `"warn"` if it was off.
 * - `true` / `false`: shorthands for `"warn"` / `"off"`.
 */
export type RuleSetting<O> =
  | Severity
  | boolean
  | Partial<O>
  | readonly [severity: Severity, options?: Partial<O>]

/**
 * Starting point of a config.
 * - `"recommended"`: the rules that are on by default, as warnings.
 * - `"all"`: every rule, as warnings.
 */
export type Preset = 'recommended' | 'all'

/** Options type of a rule spec. */
type OptionsOf<S> = S extends RuleSpec<string, infer O> ? O : never

/** Settings of the rules given in `customRules`, keyed by their names. */
export type CustomRuleSettings<R extends readonly AnyRuleSpec[]> = {
  [S in R[number] as S['name']]?: RuleSetting<OptionsOf<S>>
}

export interface TypespeclintConfig<R extends readonly AnyRuleSpec[] = readonly AnyRuleSpec[]> {
  /** Presets to start from. Defaults to `["recommended"]`; `[]` starts with every rule off. */
  extends?: readonly Preset[]
  /** Severity for every rule of a checklist section, applied after the presets. */
  categories?: { [C in Category]?: Severity }
  /**
   * Your own rules, declared with `defineRule`. A rule listed here runs as a warning unless
   * `rules` or `categories` says otherwise, and is configured in `rules` by its name.
   */
  customRules?: R
  /** Per-rule settings, applied last. */
  rules?: { [K in RuleName]?: RuleSetting<RuleOptionsMap[K]> } & CustomRuleSettings<R>
}
