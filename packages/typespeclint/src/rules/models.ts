import { getDoc, getFormat, isTemplateDeclaration, type Model, type Type } from '@typespec/compiler'

import { DEFAULT_BANNED_WORDS, DEFAULT_TYPE_CONVENTIONS } from '../constants/index.js'
import { ownDataProperties } from '../helper/analysis.js'
import { violatedConvention } from '../helper/convention.js'
import { defineRule } from '../helper/rule.js'
import type { CaseSpec, TypeConvention } from '../types/index.js'
import { matchesCase, splitWords, toRegExp } from '../utils/naming.js'
import { isAuthModel, unwrapType } from '../utils/typespec.js'

const MODEL = 'models'
const PROPERTY = 'properties'

export interface ModelUsedOptions {
  /** Regular expression sources of model names to leave alone. */
  ignore: string[]
}

/**
 * Purpose: A model no operation refers to is either left over or shows that an operation was
 * forgotten. Use it or delete it.
 *
 * NG:
 * ```tsp
 * model Order { id: string; }
 * model Invoice { id: string; }
 *
 * @route("/orders") @get op listOrders(): Order[];
 * ```
 *
 * OK:
 * ```tsp
 * model Order { id: string; }
 *
 * @route("/orders") @get op listOrders(): Order[];
 * ```
 */
export const modelUsed = defineRule<ModelUsedOptions>()({
  name: 'model-used',
  description: 'Every declared model must be used by an operation.',
  category: MODEL,
  recommended: true,
  defaults: { ignore: [] },
  run({ analysis, options, report }) {
    // Without any operation there is nothing a model could be used by (e.g. a shared types library).
    if (analysis.operations.length === 0) return
    for (const model of analysis.models) {
      if (isAuthModel(model) || !model.node) continue
      if (options.ignore.some((p) => toRegExp(p).test(model.name))) continue
      if (!analysis.reachableNodes.has(model.node)) {
        report(model, `Model '${model.name}' is not used by any operation. Use it or remove it.`)
      }
    }
  },
})

export interface ModelNamingOptions {
  case: CaseSpec
  /** Suffixes that may not end a model name, e.g. `DTO`. */
  bannedSuffixes: string[]
  bannedPrefixes: string[]
  minLength: number
}

/**
 * Purpose: Model names should say what the data is, in one convention. Technical affixes such as
 * `DTO` leak the provider's implementation.
 *
 * NG:
 * ```tsp
 * model account_dto { id: string; }
 * model AccountDTO { id: string; }
 * ```
 *
 * OK:
 * ```tsp
 * model Account { id: string; }
 * ```
 */
export const modelNaming = defineRule<ModelNamingOptions>()({
  name: 'model-naming',
  description: 'Model names must follow the guideline convention and be easy to understand.',
  category: MODEL,
  recommended: true,
  // DEFAULT (may change): PascalCase follows the TypeSpec style guide. The banned suffixes and the minimum length of 3 are our choice.
  defaults: {
    case: 'PascalCase',
    // Technical suffixes only: `LegalEntity` is a domain name.
    bannedSuffixes: ['DTO', 'Dto'],
    bannedPrefixes: [],
    minLength: 3,
  },
  run({ analysis, options, report }) {
    for (const model of analysis.models) {
      const name = model.name
      if (!matchesCase(name, options.case)) {
        report(model, `Model name '${name}' must be ${options.case}.`)
      }
      if (name.length < options.minLength) {
        report(model, `Model name '${name}' is too short to be understood.`)
      }
      const suffix = options.bannedSuffixes.find((s) => name.endsWith(s))
      if (suffix) report(model, `Model name '${name}' must not end with '${suffix}'.`)
      const prefix = options.bannedPrefixes.find((s) => name.startsWith(s))
      if (prefix) report(model, `Model name '${name}' must not start with '${prefix}'.`)
    }
  },
})

export interface ModelStructureOptions {
  /** Maximum nesting depth of objects (a flat model has depth 1). */
  maxDepth: number
  /** Maximum number of properties, inherited ones included. */
  maxProperties: number
}

function nestedModels(type: Type): Model[] {
  const target = unwrapType(type)
  if (target.kind === 'Model') {
    if (target.indexer && target.properties.size === 0) return nestedModels(target.indexer.value)
    return [target]
  }
  if (target.kind === 'Union') {
    return [...target.variants.values()].flatMap((v) => nestedModels(v.type))
  }
  return []
}

function allProperties(model: Model) {
  const props = []
  for (let m: Model | undefined = model; m; m = m.baseModel) props.push(...m.properties.values())
  return props
}

function depthOf(model: Model, stack: Set<Model>, memo: Map<Model, number>): number {
  const known = memo.get(model)
  if (known !== undefined) return known
  if (stack.has(model)) return 0 // recursive reference: do not count twice
  stack.add(model)
  let deepest = 0
  for (const prop of allProperties(model)) {
    for (const nested of nestedModels(prop.type)) {
      deepest = Math.max(deepest, depthOf(nested, stack, memo))
    }
  }
  stack.delete(model)
  const depth = deepest + 1
  if (stack.size === 0) memo.set(model, depth)
  return depth
}

/**
 * Purpose: Deeply nested or very wide models are hard to understand and to evolve. Keep depth and
 * property count within limits. The defaults are generous; set `maxDepth` and `maxProperties` to
 * what your guidelines say.
 *
 * The examples assume `{"maxDepth":2}`.
 *
 * NG:
 * ```tsp
 * model Order { customer: Customer; }
 * model Customer { address: Address; }
 * model Address { city: string; }
 * ```
 *
 * OK:
 * ```tsp
 * model Order { customerId: string; shippingAddress: Address; }
 * model Address { city: string; }
 * ```
 */
export const modelStructure = defineRule<ModelStructureOptions>()({
  name: 'model-structure',
  description: 'Model composition and depth must stay within the guideline limits.',
  category: MODEL,
  // Generous limits: they catch runaway models, and guidelines usually set stricter ones.
  recommended: true,
  // DEFAULT (may change): 5 levels and 30 properties are generous guesses with no source behind them. Tune or replace.
  defaults: { maxDepth: 5, maxProperties: 30 },
  run({ analysis, options, report }) {
    const memo = new Map<Model, number>()
    for (const model of analysis.models) {
      if (isTemplateDeclaration(model)) continue
      const count = allProperties(model).length
      if (count > options.maxProperties) {
        report(
          model,
          `Model '${model.name}' has ${count} properties, more than the ${options.maxProperties} allowed. Split it.`,
        )
      }
      const depth = depthOf(model, new Set(), memo)
      if (depth > options.maxDepth) {
        report(
          model,
          `Model '${model.name}' is nested ${depth} levels deep, more than the ${options.maxDepth} allowed.`,
        )
      }
    }
  },
})

/**
 * Purpose: A model without a description forces readers to infer its meaning from its name alone.
 *
 * NG:
 * ```tsp
 * model Order { id: string; }
 * ```
 *
 * OK:
 * ```tsp
 * /** A purchase made by a customer. *\/
 * model Order { id: string; }
 * ```
 */
export const modelDocumented = defineRule()({
  name: 'model-documented',
  description: 'Models must have a human-readable description.',
  category: MODEL,
  recommended: true,
  defaults: {},
  run({ program, analysis, report }) {
    for (const model of analysis.models) {
      if (isAuthModel(model)) continue
      if (!getDoc(program, model)?.trim()) {
        report(model, `Model '${model.name}' has no description.`)
      }
    }
  },
})

export interface PropertyNamingOptions {
  case: CaseSpec
  /** Words (abbreviations) that may not appear in a property name. */
  bannedWords: string[]
}

/**
 * Purpose: Property names follow one convention and avoid cryptic abbreviations: `message`, not
 * `msg`; `errorMessage`, not `err_msg`.
 *
 * NG:
 * ```tsp
 * model Mail { err_msg: string; msg: string; }
 * ```
 *
 * OK:
 * ```tsp
 * model Mail { errorMessage: string; message: string; }
 * ```
 */
export const propertyNaming = defineRule<PropertyNamingOptions>()({
  name: 'property-naming',
  description: 'Property names must follow the guideline convention and be easy to understand.',
  category: PROPERTY,
  recommended: true,
  // DEFAULT (may change): camelCase follows the TypeSpec style guide. The banned abbreviations (DEFAULT_BANNED_WORDS) are our choice.
  defaults: { case: 'camelCase', bannedWords: DEFAULT_BANNED_WORDS },
  run({ program, analysis, options, report }) {
    for (const model of analysis.models) {
      if (isAuthModel(model)) continue
      for (const prop of ownDataProperties(program, model)) {
        if (!matchesCase(prop.name, options.case)) {
          report(prop, `Property '${prop.name}' must be ${options.case}.`)
        }
        const banned = splitWords(prop.name).find((w) => options.bannedWords.includes(w))
        if (banned) {
          report(
            prop,
            `Property '${prop.name}' uses the abbreviation '${banned}'; use a clear name.`,
          )
        }
      }
    }
  },
})

export interface PropertyRequiredOptions {
  /** Only models with at least this many properties are checked. */
  minProperties: number
  /** Regular expression sources of model names where all-optional is expected. */
  ignore: string[]
}

/**
 * Purpose: A model whose properties are all optional accepts `{}`. That is rarely intended (models
 * named `*Patch`, `*Filter`, ... are ignored by default).
 *
 * NG:
 * ```tsp
 * model Mail { email?: string; message?: string; }
 * ```
 *
 * OK:
 * ```tsp
 * model Mail { email: string; message: string; replyTo?: string; }
 * ```
 */
export const propertyRequired = defineRule<PropertyRequiredOptions>()({
  name: 'property-required',
  description: 'A model whose properties are all optional is probably a mistake.',
  category: PROPERTY,
  recommended: true,
  // DEFAULT (may change): checking from 2 properties up, and the name fragments that mark an all-optional model as intended, are our choice.
  defaults: {
    minProperties: 2,
    // Anywhere in the name: `UpdateUserRequest` is an update as much as `UserUpdate`.
    ignore: ['Patch|Update|Query|Filter|Options|Params|Criteria'],
  },
  run({ analysis, options, report }) {
    for (const model of analysis.models) {
      if (isAuthModel(model)) continue
      if (options.ignore.some((p) => toRegExp(p).test(model.name))) continue
      const props = allProperties(model)
      if (props.length >= options.minProperties && props.every((p) => p.optional)) {
        report(
          model,
          `Every property of model '${model.name}' is optional, which is probably a mistake.`,
        )
      }
    }
  },
})

export interface PropertyTypeOptions {
  /** Expected types by property name. */
  conventions: TypeConvention[]
}

/**
 * Purpose: The type must fit what the name promises: dates are date types (ISO 8601 / RFC 3339 on
 * the wire), `is*` flags are booleans, `*Url` is a `url`, `*Count` is an integer.
 *
 * NG:
 * ```tsp
 * model Order { createdAt: string; isPaid: int32; itemCount: string; }
 * ```
 *
 * OK:
 * ```tsp
 * model Order { createdAt: utcDateTime; isPaid: boolean; itemCount: int32; }
 * ```
 */
export const propertyType = defineRule<PropertyTypeOptions>()({
  name: 'property-type',
  description: 'Property types and formats must be valid for what the name says.',
  category: PROPERTY,
  recommended: true,
  // DEFAULT (may change): the name-to-type conventions (DEFAULT_TYPE_CONVENTIONS) are heuristics of ours.
  defaults: { conventions: DEFAULT_TYPE_CONVENTIONS },
  run({ program, analysis, options, report }) {
    for (const model of analysis.models) {
      if (isAuthModel(model)) continue
      for (const prop of ownDataProperties(program, model)) {
        const convention = violatedConvention(
          prop.name,
          prop.type,
          options.conventions,
          getFormat(program, prop),
        )
        if (convention) {
          report(
            prop,
            `Property '${prop.name}' should be of type ${convention.types.join(' | ')} (name matches /${convention.pattern}/).`,
          )
        }
      }
    }
  },
})

/**
 * Purpose: Every property is described, so consumers do not have to guess units, formats or
 * meaning.
 *
 * NG:
 * ```tsp
 * model Order { total: decimal; }
 * ```
 *
 * OK:
 * ```tsp
 * model Order {
 *   /** Amount charged, taxes included. *\/
 *   total: decimal;
 * }
 * ```
 */
export const propertyDocumented = defineRule()({
  name: 'property-documented',
  description: 'Model properties must have a human-readable description.',
  category: PROPERTY,
  recommended: true,
  defaults: {},
  run({ program, analysis, report }) {
    for (const model of analysis.models) {
      if (isAuthModel(model)) continue
      for (const prop of ownDataProperties(program, model)) {
        if (!getDoc(program, prop)?.trim()) {
          report(prop, `Property '${prop.name}' has no description.`)
        }
      }
    }
  },
})
