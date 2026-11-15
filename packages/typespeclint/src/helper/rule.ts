import {
  createRule,
  getLocationContext,
  type DiagnosticTarget,
  paramMessage,
  type LinterRuleDefinition,
  type Program,
} from '@typespec/compiler'

import { CUSTOM_RULES_HOST, LIBRARY_NAME, PRESET_OPTION } from '../constants/index.js'
import type {
  AnyRuleSpec,
  NoOptions,
  ResolvedRule,
  RuleSpec,
  Severity,
  TypespeclintConfig,
} from '../types/index.js'
import { parseSetting } from '../utils/setting.js'
import { isSuppressed, type DirectiveHolder } from '../utils/suppress.js'
import { analyze } from './analysis.js'
import { loadConfig } from './config.js'

/**
 * Decide whether a rule runs, at which severity and with which options.
 * Order: presets (`extends`) < `categories` < `rules` < options written in tspconfig.yaml.
 * `undefined` means "do not run".
 */
export function resolveRule<O extends object>(
  spec: Pick<RuleSpec<string, O>, 'name' | 'category' | 'recommended' | 'defaults'>,
  config: TypespeclintConfig,
  enabledWith: Record<string, unknown>,
): ResolvedRule<O> | undefined {
  const { [PRESET_OPTION]: preset, ...explicit } = enabledWith

  let severity: Severity = 'warn'
  if (preset === 'recommended') {
    const presets = config.extends ?? ['recommended']
    const on =
      presets.includes('all') || (presets.includes('recommended') && (spec.recommended ?? true))
    severity = on ? 'warn' : 'off'
  }
  if (spec.category) severity = config.categories?.[spec.category] ?? severity

  const setting = parseSetting((config.rules as Record<string, unknown> | undefined)?.[spec.name])
  if (setting.severity) severity = setting.severity
  // Giving options to a rule that is off switches it on.
  else if (setting.options && severity === 'off') severity = 'warn'

  if (severity === 'off') return undefined
  return { severity, options: { ...spec.defaults, ...setting.options, ...explicit } }
}

/**
 * Run a rule against a compiled program and return its findings as messages.
 * Findings outside the user project are dropped, as the compiler does.
 */
export function runRule<N extends string, O extends object>(
  spec: RuleSpec<N, O>,
  program: Program,
  options: Partial<O> = {},
): string[] {
  const messages: string[] = []
  spec.run({
    program,
    options: { ...spec.defaults, ...options },
    analysis: analyze(program),
    report(target, message) {
      if (typeof target === 'symbol' || getLocationContext(program, target).type !== 'project')
        return
      messages.push(message)
    },
  })
  return messages
}

/**
 * Declare a rule. The options type is given first so that it is exactly the documented
 * interface (not what the default values happen to infer to): `defineRule<MyOptions>()({ ... })`.
 */
export function defineRule<O extends object = NoOptions>() {
  return function define<const N extends string>(spec: RuleSpec<N, O>): RuleSpec<N, O> {
    return spec
  }
}

const configs = new WeakMap<Program, Promise<TypespeclintConfig>>()

/** The config of a program, looked up once per compilation rather than once per rule. */
function configOf(program: Program): Promise<TypespeclintConfig> {
  let config = configs.get(program)
  if (!config) {
    config = loadConfig(program.projectRoot)
    configs.set(program, config)
  }
  return config
}

type AnyMessages = { default: ReturnType<typeof paramMessage<['message']>> }
export type TypespeclintLinterRule = LinterRuleDefinition<
  string,
  AnyMessages,
  Record<string, unknown>
>

/** The syntax node a finding points at: a type's declaration, or the node itself. */
function nodeOf(target: Exclude<DiagnosticTarget, symbol>): DirectiveHolder | undefined {
  if ('node' in target) return target.node
  return 'kind' in target && 'parent' in target ? target : undefined
}

type Sink = (target: DiagnosticTarget, message: string) => void

/** Report through the program, with the code `typespeclint/<rule>`. Used for everything the linter's own channel cannot carry. */
function programSink(program: Program, name: string, severity: 'warning' | 'error'): Sink {
  const code = `${LIBRARY_NAME}/${name}`
  return (target, message) => {
    // Same filter as the linter: only findings in the user project.
    if (typeof target === 'symbol' || getLocationContext(program, target).type !== 'project') return
    // The compiler honors `#suppress` for warnings only; do the same for errors.
    if (severity === 'error' && isSuppressed(nodeOf(target), code)) return
    program.reportDiagnostic({ code, severity, message, target })
  }
}

/** Run a rule, reporting each location once: spread and `is` copies share a syntax node. */
function execute(spec: AnyRuleSpec, program: Program, options: object, sink: Sink): void {
  const seen = new Map<unknown, Set<string>>()
  spec.run({
    program,
    options,
    analysis: analyze(program),
    report(target, message) {
      const key =
        typeof target === 'object' && 'node' in target && target.node ? target.node : target
      let messages = seen.get(key)
      if (!messages) seen.set(key, (messages = new Set()))
      if (messages.has(message)) return
      messages.add(message)
      sink(target, message)
    },
  })
}

/**
 * Turn a rule spec into a TypeSpec linter rule.
 *
 * Options are resolved as: rule defaults < `typespeclint.config.*` < options given in
 * `tspconfig.yaml` (see {@link resolveRule}). The config file is loaded asynchronously, which
 * is why every rule runs in the `exit` callback of an async rule.
 */
export function toLinterRule(
  spec: AnyRuleSpec,
  load: (program: Program) => Promise<TypespeclintConfig> = configOf,
  docs?: string,
): TypespeclintLinterRule {
  return createRule({
    name: spec.name,
    severity: 'warning',
    description: spec.description,
    ...(docs ? { docs } : {}),
    messages: { default: paramMessage`${'message'}` },
    async: true,
    create(context) {
      return {
        exit: async (program) => {
          const resolved = resolveRule(spec, await load(program), context.options)
          if (!resolved) return
          // TypeSpec linter rules can only warn: errors go through the program.
          const sink: Sink =
            resolved.severity === 'warn'
              ? (target, message) => context.reportDiagnostic({ target, format: { message } })
              : programSink(program, spec.name, 'error')
          execute(spec, program, resolved.options, sink)
        },
      }
    },
  })
}

/**
 * The linter rule that runs the `customRules` of a config. TypeSpec only knows the rules a
 * library declares up front, so custom rules run inside this one and report through the
 * program under their own code, `typespeclint/<name>`.
 */
export function toCustomRulesHost(
  builtinNames: ReadonlySet<string>,
  load: (program: Program) => Promise<TypespeclintConfig> = configOf,
): TypespeclintLinterRule {
  return createRule({
    name: CUSTOM_RULES_HOST,
    severity: 'warning',
    description: 'Runs the custom rules declared in typespeclint.config.*.',
    messages: { default: paramMessage`${'message'}` },
    async: true,
    create(context) {
      return {
        exit: async (program) => {
          const config = await load(program)
          const names = new Set<string>()
          for (const spec of config.customRules ?? []) {
            if (builtinNames.has(spec.name) || spec.name === CUSTOM_RULES_HOST) {
              throw new Error(
                `typespeclint: custom rule '${spec.name}' has the name of a built-in rule.`,
              )
            }
            if (names.has(spec.name)) {
              throw new Error(`typespeclint: custom rule '${spec.name}' is declared twice.`)
            }
            names.add(spec.name)
            const resolved = resolveRule(spec, config, context.options)
            if (!resolved) continue
            const severity = resolved.severity === 'warn' ? 'warning' : 'error'
            execute(spec, program, resolved.options, programSink(program, spec.name, severity))
          }
        },
      }
    },
  })
}
