import { expect, it } from 'vite-plus/test'

import { PRESET_OPTION } from '../src/constants/index.js'
import { resolveRule } from '../src/helper/rule.js'
import * as extras from '../src/rules/extras.js'
import { ruleTester, SERVICE } from './helper.js'

const recommended = {
  name: 'r',
  category: 'models',
  recommended: true,
  defaults: { a: 1, b: 1 },
} as const
const optIn = { ...recommended, recommended: false } as const
const viaPreset = { [PRESET_OPTION]: 'recommended' }
const msg = (...messages: RegExp[]) => messages.map((message) => ({ message }))
const rules = (r: unknown) => ({ rules: { r } }) as never
const defaults = { a: 1, b: 1 }

it('presets: recommended is the default, all turns everything on, [] starts empty', () => {
  expect(resolveRule(recommended, {}, viaPreset)).toEqual({ severity: 'warn', options: defaults })
  expect(resolveRule(optIn, {}, viaPreset)).toBeUndefined()
  expect(resolveRule(optIn, { extends: ['all'] }, viaPreset)?.severity).toBe('warn')
  expect(resolveRule(recommended, { extends: [] }, viaPreset)).toBeUndefined()
})

it('categories set the severity of a whole checklist section', () => {
  expect(resolveRule(optIn, { categories: { models: 'error' } }, viaPreset)?.severity).toBe('error')
  expect(resolveRule(recommended, { categories: { models: 'off' } }, viaPreset)).toBeUndefined()
  expect(resolveRule(recommended, { categories: { security: 'off' } }, viaPreset)?.severity).toBe(
    'warn',
  )
})

it('rules: severity strings, tuples, options and booleans', () => {
  expect(resolveRule(optIn, rules('error'), viaPreset)).toEqual({
    severity: 'error',
    options: defaults,
  })
  expect(resolveRule(optIn, rules(['error', { a: 2 }]), viaPreset)).toEqual({
    severity: 'error',
    options: { a: 2, b: 1 },
  })
  expect(resolveRule(optIn, rules(['warn']), viaPreset)?.severity).toBe('warn')
  expect(resolveRule(optIn, rules({ a: 2 }), viaPreset)).toEqual({
    severity: 'warn',
    options: { a: 2, b: 1 },
  })
  expect(resolveRule(optIn, rules(true), viaPreset)?.severity).toBe('warn')
  expect(resolveRule(recommended, rules('off'), viaPreset)).toBeUndefined()
  expect(resolveRule(recommended, rules(false), viaPreset)).toBeUndefined()
  expect(resolveRule(recommended, rules(['off', { a: 2 }]), viaPreset)).toBeUndefined()
})

it('rules win over categories; options keep the category severity', () => {
  const config = { categories: { models: 'error' }, rules: { r: { a: 2 } } } as never
  expect(resolveRule(optIn, config, viaPreset)).toEqual({
    severity: 'error',
    options: { a: 2, b: 1 },
  })
  const off = { categories: { models: 'error' }, rules: { r: 'off' } } as never
  expect(resolveRule(optIn, off, viaPreset)).toBeUndefined()
})

it('rules enabled in tspconfig.yaml run; their options win over the config file', () => {
  expect(resolveRule(optIn, { extends: [] }, {})?.severity).toBe('warn')
  expect(resolveRule(optIn, rules({ a: 2, b: 2 }), { a: 3 })?.options).toEqual({ a: 3, b: 2 })
  expect(resolveRule(optIn, rules('off'), {})).toBeUndefined()
})

it('example-required: operations', async () => {
  const t = await ruleTester(extras.exampleRequired, { models: false, operations: true })
  await t
    .expect(
      `${SERVICE} model Order { id: string } @route("/orders") @get op listOrders(): Order[];`,
    )
    .toEmitDiagnostics(msg(/GET \/orders has no @opExample/))
})

it('response-problem-details: options', async () => {
  const code = `${SERVICE}
    model Problem { type: "about:blank"; title: string; status: 400; }
    @error model ProblemResponse { @statusCode statusCode: 404; @body body: Problem; }
    @route("/orders") @get op listOrders(): string[] | ProblemResponse;`
  const strict = await ruleTester(extras.responseProblemDetails, { typePattern: '^/problems/' })
  await strict
    .expect(code)
    .toEmitDiagnostics(
      msg(
        /missing detail, instance/,
        /application\/problem\+json/,
        /says status 400 but the response is 404/,
        /'about:blank'.*does not match/,
      ),
    )
  const loose = await ruleTester(extras.responseProblemDetails, {
    requiredMembers: ['type', 'title'],
    requireContentType: false,
    requireMatchingStatus: false,
  })
  await loose.expect(code).toBeValid()
})

it('standard-format: toggles and custom standards', async () => {
  const code = `model Customer { phoneNumber: string; email: string; iban: string; countryCode: "JP" | "US"; @format("uuid") uuid: string; }`
  const all = await ruleTester(extras.standardFormat)
  await all
    .expect(code)
    .toEmitDiagnostics(msg(/'phoneNumber' should follow E\.164/, /'email' should follow RFC 5322/))
  const custom = await ruleTester(extras.standardFormat, {
    phone: false,
    email: false,
    custom: [{ standard: 'ISO 13616', pattern: '^iban$' }],
  })
  await custom.expect(code).toEmitDiagnostics(msg(/'iban' should follow ISO 13616/))
})
