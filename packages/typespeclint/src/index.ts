export { CATEGORIES, type Category } from './constants/index.js'
// For custom rules: what the built-in rules are written with.
export { isUserType, ownDataProperties } from './helper/analysis.js'
export { defineConfig, loadConfig } from './helper/config.js'
export { defineRule } from './helper/rule.js'
export { $lib } from './lib.js'
export { $linter } from './linter.js'
export { ruleDocs } from './rules/docs.js'
export { ruleSpecs, type MethodConvention, type RuleOptionsMap } from './rules/index.js'
export type {
  Analysis,
  AnyRuleSpec,
  CaseName,
  CaseSpec,
  NoOptions,
  Preset,
  RuleDoc,
  RuleName,
  RuleRunContext,
  RuleSetting,
  RuleSpec,
  Severity,
  StandardSpec,
  TypespeclintConfig,
  TypeConvention,
} from './types/index.js'
export { renderRuleDocs } from './utils/docs.js'
export { describeOperation, formatStatus, statusClass } from './utils/http.js'
export { matchesCase, splitWords } from './utils/naming.js'
