// What a rule is made of, and what it is given when it runs.
import type { DiagnosticTarget, Model, Operation, Program } from '@typespec/compiler'
import type { HttpOperation, HttpService } from '@typespec/http'

import type { Category } from '../constants/index.js'
import type { Severity } from './config.js'

/** Documentation of one rule: why it exists, a violating example and a compliant one. */
export interface RuleDoc {
  /** Why the rule exists. */
  purpose: string
  /** TypeSpec that violates the rule. */
  ng: string
  /** TypeSpec that satisfies the rule. */
  ok: string
  /** Options the examples assume, when they differ from the defaults. */
  options?: Record<string, unknown>
  /** The previous version of the API, for rules that compare with a baseline. A complete file. */
  before?: string
  /**
   * By default the examples are fragments of a service:
   * `@service @useAuth(BearerAuth) namespace Shop;` with `using Http;`.
   * Standalone examples are complete files (apart from the import and `using`).
   */
  standalone?: boolean
}

export interface Analysis {
  /** Named models declared in the user project (template instances excluded). */
  models: Model[]
  /** Operations declared in the user project. */
  operations: Operation[]
  services: HttpService[]
  /** HTTP operations declared in the user project. */
  httpOperations: HttpOperation[]
  /** Syntax nodes of every type reachable from an operation signature. */
  reachableNodes: Set<object>
}

export interface RuleRunContext<O> {
  readonly program: Program
  readonly options: O
  readonly analysis: Analysis
  /** Report a finding. Findings outside the user project are dropped by the compiler. */
  readonly report: (target: DiagnosticTarget, message: string) => void
}

export interface RuleSpec<N extends string, O extends object> {
  name: N
  description: string
  /**
   * Checklist section the rule belongs to; `categories` in the config then applies to it.
   * Every built-in rule has one. A custom rule may leave it out.
   */
  category?: Category
  /**
   * Whether the `recommended` preset runs the rule. Defaults to `true` for custom rules:
   * a rule listed in `customRules` runs unless the config switches it off.
   */
  recommended?: boolean
  defaults: O
  /** Options without a default, with an example value (shown commented out in generated configs). */
  unset?: Partial<O>
  run(context: RuleRunContext<O>): void
}

/** A rule whatever its name and options. */
export type AnyRuleSpec = RuleSpec<string, object>

/** Options of a rule that has none. */
export type NoOptions = Record<string, never>

export interface ResolvedRule<O> {
  severity: Exclude<Severity, 'off'>
  options: O
}
