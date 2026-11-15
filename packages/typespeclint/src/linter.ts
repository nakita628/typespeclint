import { defineLinter, type LinterRuleEnableValue, type RuleRef } from '@typespec/compiler'

import { CUSTOM_RULES_HOST, LIBRARY_NAME, PRESET_OPTION } from './constants/index.js'
import { toCustomRulesHost, toLinterRule } from './helper/rule.js'
import { ruleDocs } from './rules/docs.js'
import { ruleSpecs } from './rules/index.js'
import { renderRuleDocs } from './utils/docs.js'

const ruleNames = [...ruleSpecs.map((spec) => spec.name), CUSTOM_RULES_HOST]

const enable = (value: LinterRuleEnableValue): Record<RuleRef, LinterRuleEnableValue> =>
  Object.fromEntries(ruleNames.map((name) => [`${LIBRARY_NAME}/${name}`, value]))

export const $linter = defineLinter({
  rules: [
    ...ruleSpecs.map((spec) => toLinterRule(spec, undefined, renderRuleDocs(ruleDocs[spec.name]))),
    toCustomRulesHost(new Set(ruleSpecs.map((spec) => spec.name))),
  ],
  ruleSets: {
    // Every rule is registered; `typespeclint.config.*` and each rule's `recommended`
    // flag decide which ones actually run (see `resolveRule`).
    recommended: { enable: enable({ [PRESET_OPTION]: 'recommended' }) },
    all: { enable: enable(true) },
  },
})
