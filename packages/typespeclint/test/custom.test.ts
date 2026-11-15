import { describe, expect, it } from 'vite-plus/test'

import { defineConfig } from '../src/helper/config.js'
import {
  defineRule,
  toCustomRulesHost,
  toLinterRule,
  type TypespeclintLinterRule,
} from '../src/helper/rule.js'
import * as models from '../src/rules/models.js'
import type { TypespeclintConfig } from '../src/types/index.js'
import { isSuppressed } from '../src/utils/suppress.js'
import { ruleTester, SERVICE, Tester } from './helper.js'

const noLegacy = defineRule<{ prefix: string }>()({
  name: 'no-legacy',
  description: 'Models must not be named Legacy*.',
  category: 'models',
  defaults: { prefix: 'Legacy' },
  run({ analysis, options, report }) {
    for (const model of analysis.models) {
      if (model.name.startsWith(options.prefix)) report(model, `'${model.name}' is legacy.`)
    }
  },
})

const builtin = new Set(['model-naming'])

/**
 * Run a linter rule the way the compiler does and return what reaches the program.
 * (The compiler's rule tester only accepts findings sent through the linter's own channel.)
 */
async function lint(rule: TypespeclintLinterRule, code: string) {
  const { program } = await Tester.compile(code)
  const found: { code: string; severity: string; message: string }[] = []
  const listener = rule.create({
    program,
    options: {},
    reportDiagnostic(diagnostic) {
      found.push({
        code: `typespeclint/${rule.name}`,
        severity: 'warning',
        message: 'format' in diagnostic ? String(Object.values(diagnostic.format ?? {})[0]) : '',
      })
    },
  })
  await listener.exit?.(program)
  for (const d of program.diagnostics) {
    found.push({ code: d.code, severity: d.severity, message: d.message })
  }
  return found
}

function host(config: TypespeclintConfig, code: string) {
  return lint(
    toCustomRulesHost(builtin, async () => config),
    code,
  )
}

const CODE = `model LegacyAccount { id: string } model OldAccount { id: string }`

describe('custom rules', () => {
  it('a rule listed in customRules runs as a warning under its own code', async () => {
    expect(await host(defineConfig({ customRules: [noLegacy] }), CODE)).toStrictEqual([
      {
        code: 'typespeclint/no-legacy',
        severity: 'warning',
        message: "'LegacyAccount' is legacy.",
      },
    ])
  })

  it('is configured by name in rules: severity and options', async () => {
    const config = defineConfig({
      customRules: [noLegacy],
      rules: { 'no-legacy': ['error', { prefix: 'Old' }] },
    })
    expect(await host(config, CODE)).toStrictEqual([
      { code: 'typespeclint/no-legacy', severity: 'error', message: "'OldAccount' is legacy." },
    ])
  })

  it('can be switched off by name or by category', async () => {
    const byName = defineConfig({ customRules: [noLegacy], rules: { 'no-legacy': 'off' } })
    expect(await host(byName, CODE)).toStrictEqual([])
    const byCategory = defineConfig({ customRules: [noLegacy], categories: { models: 'off' } })
    expect(await host(byCategory, CODE)).toStrictEqual([])
  })

  it('a warning can be suppressed like any TypeSpec warning', async () => {
    const code = `#suppress "typespeclint/no-legacy" "kept for partners"\nmodel LegacyAccount { id: string }`
    expect(await host(defineConfig({ customRules: [noLegacy] }), code)).toStrictEqual([])
  })

  it('rejects a custom rule named like a built-in rule', async () => {
    const clash = defineRule()({
      name: 'model-naming',
      description: 'x',
      defaults: {},
      run() {},
    })
    await expect(host(defineConfig({ customRules: [clash] }), CODE)).rejects.toThrow(
      /name of a built-in rule/,
    )
  })
})

function suppress(code: string) {
  return {
    target: { sv: 'suppress' },
    arguments: [{ value: code }, { value: 'reason' }],
  }
}

describe('#suppress', () => {
  it('finds a directive on the node or on a parent', () => {
    const parent = { directives: [suppress('typespeclint/a')] }
    expect(isSuppressed({ parent }, 'typespeclint/a')).toBe(true)
    expect(isSuppressed({ directives: [suppress('typespeclint/a')] }, 'typespeclint/a')).toBe(true)
    expect(isSuppressed({ parent }, 'typespeclint/b')).toBe(false)
    expect(isSuppressed(undefined, 'typespeclint/a')).toBe(false)
  })

  it('applies to a rule raised to an error', async () => {
    const config = { rules: { 'model-documented': 'error' } } as TypespeclintConfig
    const rule = toLinterRule(models.modelDocumented, async () => config)
    const code = `#suppress "typespeclint/model-documented" "internal"
      model Hidden { id: string }
      model Shown { id: string }`
    expect(await lint(rule, code)).toStrictEqual([
      {
        code: 'typespeclint/model-documented',
        severity: 'error',
        message: "Model 'Shown' has no description.",
      },
    ])
  })
})

describe('model-used', () => {
  it('counts operations an interface inherits from a template', async () => {
    const t = await ruleTester(models.modelUsed)
    await t
      .expect(
        `${SERVICE}
         model Account { id: string }
         interface Reads<T> { @get read(): T; }
         @route("/accounts") interface Accounts extends Reads<Account> {}`,
      )
      .toBeValid()
  })
})
