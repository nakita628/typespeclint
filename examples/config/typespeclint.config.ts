import { defineConfig } from 'typespeclint'

export default defineConfig({
  // Start from the recommended rules, as warnings.
  extends: ['recommended'],

  // A whole section of the checklist at once: security findings fail the build.
  categories: {
    security: 'error',
  },

  rules: {
    // Switch a recommended rule off.
    'operation-tagged': 'off',

    // Raise a rule to an error.
    'operation-responses': 'error',

    // Switch an opt-in rule on: currencies, countries, e-mail addresses follow their standard.
    'standard-format': 'warn',

    // Change options: this API names properties and query parameters in snake_case.
    'property-naming': ['warn', { case: 'snake_case' }],
    'parameter-naming': ['warn', { query: 'snake_case' }],
    'property-type': ['warn', { conventions: [{ pattern: '_at$', types: ['utcDateTime'] }] }],
  },
})
