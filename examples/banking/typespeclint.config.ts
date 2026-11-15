import { defineConfig, defineRule, describeOperation } from 'typespeclint'

// A rule of our own guidelines: money is never a floating-point number.
const noFloatAmount = defineRule<{ names: string[] }>()({
  name: 'no-float-amount',
  description: 'Amounts must not be floating-point numbers.',
  category: 'properties',
  defaults: { names: ['amount', 'price', 'total', 'balance'] },
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

// Another one, on operations: no options, so `defineRule()` is enough.
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

export default defineConfig({
  extends: ['recommended'],

  // Our own rules. Listed here, they run as warnings; `rules` below configures them by name.
  customRules: [noFloatAmount, noRpcPath],

  // Security findings fail the build.
  categories: {
    security: 'error',
  },

  rules: {
    'operation-method': 'off',
    'operation-secured': 'error',
    'example-required': 'warn',
    'response-problem-details': 'warn',
    'standard-format': 'warn',
    'model-structure': ['warn', { maxDepth: 3 }],
    'property-naming': ['error', { bannedWords: ['msg', 'err'] }],
    'no-float-amount': ['error', { names: ['amount', 'msg'] }],
  },
})
