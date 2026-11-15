import { getDoc, getFormat, type Type } from '@typespec/compiler'
import type { HttpVerb } from '@typespec/http'

import { DEFAULT_TYPE_CONVENTIONS } from '../constants/index.js'
import { DEFAULT_BANNED_WORDS } from '../constants/index.js'
import { violatedConvention } from '../helper/convention.js'
import { defineRule } from '../helper/rule.js'
import type { CaseSpec, TypeConvention } from '../types/index.js'
import { describeOperation } from '../utils/http.js'
import { matchesCase, splitWords, toRegExp } from '../utils/naming.js'
import { unwrapType } from '../utils/typespec.js'

const CATEGORY = 'parameters'

export interface ParameterNamingOptions {
  /** Convention per location; `false` skips the location. */
  query: CaseSpec | false
  path: CaseSpec | false
  header: CaseSpec | false
  cookie: CaseSpec | false
  /** Words (abbreviations) that may not appear in a parameter name. */
  bannedWords: string[]
}

/**
 * Purpose: Parameter names follow the convention of their location (camelCase for query and path,
 * hyphenated header names) and avoid cryptic abbreviations.
 *
 * NG:
 * ```tsp
 * @route("/orders") @get op listOrders(@query page_size?: int32, @header("x_trace_id") traceId?: string): string[];
 * ```
 *
 * OK:
 * ```tsp
 * @route("/orders") @get op listOrders(@query pageSize?: int32, @header("X-Trace-Id") traceId?: string): string[];
 * ```
 */
export const parameterNaming = defineRule<ParameterNamingOptions>()({
  name: 'parameter-naming',
  description: 'Parameter names must follow the guideline convention for their location.',
  category: CATEGORY,
  recommended: true,
  // DEFAULT (may change): camelCase for query and path, hyphenated words for headers, cookies unchecked. Chosen by us.
  defaults: {
    query: 'camelCase',
    path: 'camelCase',
    header: 'http-header',
    cookie: false,
    bannedWords: DEFAULT_BANNED_WORDS,
  },
  run({ analysis, options, report }) {
    for (const op of analysis.httpOperations) {
      for (const parameter of op.parameters.parameters) {
        const spec = options[parameter.type]
        if (spec !== false && !matchesCase(parameter.name, spec)) {
          report(
            parameter.param,
            `${parameter.type} parameter '${parameter.name}' must be ${spec}.`,
          )
        }
        const banned = splitWords(parameter.name).find((w) => options.bannedWords.includes(w))
        if (banned) {
          report(
            parameter.param,
            `${parameter.type} parameter '${parameter.name}' uses the abbreviation '${banned}'; use a clear name.`,
          )
        }
      }
    }
  },
})

export interface ParameterRequiredOptions {
  /** Methods whose body should not consist of optional properties only. */
  bodyMethods: HttpVerb[]
}

/**
 * Purpose: A create / replace request whose body properties are all optional accepts `{}`, which
 * is probably a mistake. Path parameters are always required.
 *
 * NG:
 * ```tsp
 * @route("/mails") @post op sendMail(@body mail: { email?: string; message?: string }): void;
 * ```
 *
 * OK:
 * ```tsp
 * @route("/mails") @post op sendMail(@body mail: { email: string; message: string }): void;
 * ```
 */
export const parameterRequired = defineRule<ParameterRequiredOptions>()({
  name: 'parameter-required',
  description: 'Required status of parameters must be consistent with their location.',
  category: CATEGORY,
  recommended: true,
  // DEFAULT (may change): create (POST) and replace (PUT) are the methods where an all-optional body is suspicious. Our choice.
  defaults: { bodyMethods: ['post', 'put'] },
  run({ analysis, options, report }) {
    for (const op of analysis.httpOperations) {
      for (const parameter of op.parameters.parameters) {
        if (parameter.type === 'path' && parameter.param.optional) {
          report(parameter.param, `path parameter '${parameter.name}' must be required.`)
        }
      }
      const body = op.parameters.body
      if (body && body.bodyKind === 'single' && options.bodyMethods.includes(op.verb)) {
        const type = unwrapType(body.type)
        if (type.kind === 'Model' && type.properties.size > 0) {
          const all = [...type.properties.values()]
          if (all.every((p) => p.optional)) {
            report(
              op.operation,
              `${describeOperation(op)}: every property of the request body is optional, which is probably a mistake.`,
            )
          }
        }
      }
    }
  },
})

export interface ParameterTypeOptions {
  /** Allow object (model) typed query / path / header parameters. */
  allowObjects: boolean
  /** Expected types by parameter name. */
  conventions: TypeConvention[]
}

/**
 * Purpose: Query, path and header parameters are simple values, not objects, and their type fits
 * what the name promises (same conventions as `property-type`).
 *
 * NG:
 * ```tsp
 * model OrderFilter { status: string; }
 *
 * @route("/orders") @get op listOrders(@query filter?: OrderFilter, @query createdAt?: int64): string[];
 * ```
 *
 * OK:
 * ```tsp
 * @route("/orders") @get op listOrders(@query status?: string, @query createdAt?: utcDateTime): string[];
 * ```
 */
export const parameterType = defineRule<ParameterTypeOptions>()({
  name: 'parameter-type',
  description: 'Parameter types and formats must be valid for their name and location.',
  category: CATEGORY,
  recommended: true,
  // DEFAULT (may change): no objects in query, path or header parameters, plus the same name-to-type heuristics as `property-type`.
  defaults: { allowObjects: false, conventions: DEFAULT_TYPE_CONVENTIONS },
  run({ program, analysis, options, report }) {
    for (const op of analysis.httpOperations) {
      for (const parameter of op.parameters.parameters) {
        const raw = parameter.param.type
        const type = unwrapType(raw)
        const isObject = type.kind === 'Model' && !(type.indexer && type.name === 'Array')
        if (!options.allowObjects && isObject) {
          report(
            parameter.param,
            `${parameter.type} parameter '${parameter.name}' must not be an object.`,
          )
        }
        if (parameter.type === 'path' && type !== raw && raw.kind === 'Model') {
          report(parameter.param, `path parameter '${parameter.name}' must not be an array.`)
        }
        const convention = violatedConvention(
          parameter.param.name,
          raw,
          options.conventions,
          getFormat(program, parameter.param),
        )
        if (convention) {
          report(
            parameter.param,
            `${parameter.type} parameter '${parameter.name}' should be of type ${convention.types.join(' | ')} (name matches /${convention.pattern}/).`,
          )
        }
      }
    }
  },
})

/**
 * Purpose: Every parameter is described.
 *
 * NG:
 * ```tsp
 * @route("/orders") @get op listOrders(@query pageSize?: int32): string[];
 * ```
 *
 * OK:
 * ```tsp
 * @route("/orders") @get op listOrders(
 *   /** Maximum number of orders to return. *\/
 *   @query pageSize?: int32,
 * ): string[];
 * ```
 */
export const parameterDocumented = defineRule()({
  name: 'parameter-documented',
  description: 'Parameters must have a human-readable description.',
  category: CATEGORY,
  recommended: true,
  defaults: {},
  run({ program, analysis, report }) {
    for (const op of analysis.httpOperations) {
      for (const parameter of op.parameters.parameters) {
        if (!getDoc(program, parameter.param)?.trim()) {
          report(
            parameter.param,
            `${parameter.type} parameter '${parameter.name}' has no description.`,
          )
        }
      }
    }
  },
})

export interface ParameterLocationOptions {
  /** Methods that may not carry a request body. */
  noBodyMethods: HttpVerb[]
  /** Words marking sensitive data that may not travel in the URL (path / query). */
  sensitiveWords: string[]
}

/**
 * Purpose: Parameters travel in a location that suits the method and the data: no body on GET /
 * HEAD / DELETE, and nothing sensitive in the URL, where it ends up in logs and browser history.
 *
 * NG:
 * ```tsp
 * @route("/sessions") @delete op deleteSession(@query accessToken: string, @body reason: string): void;
 * ```
 *
 * OK:
 * ```tsp
 * @route("/sessions") @delete op deleteSession(@header authorization: string, @query reason?: string): void;
 * ```
 */
export const parameterLocation = defineRule<ParameterLocationOptions>()({
  name: 'parameter-location',
  description:
    'Parameters must be sent in a location valid for the HTTP method and their sensitivity.',
  category: CATEGORY,
  recommended: true,
  // DEFAULT (may change): no body on GET, HEAD and DELETE follows common HTTP practice. The list of sensitive names is ours and incomplete by nature.
  defaults: {
    noBodyMethods: ['get', 'head', 'delete'],
    // Credentials by name. Not a bare `token`: `pageToken` is a pagination cursor.
    sensitiveWords: [
      'password',
      'passwd',
      'secret',
      'apikey',
      'credential',
      'ssn',
      'accesstoken',
      'refreshtoken',
      'idtoken',
      'authtoken',
      'sessiontoken',
    ],
  },
  run({ analysis, options, report }) {
    for (const op of analysis.httpOperations) {
      if (op.parameters.body && options.noBodyMethods.includes(op.verb)) {
        report(
          op.parameters.body.property ?? op.operation,
          `${describeOperation(op)}: ${op.verb.toUpperCase()} requests must not have a body.`,
        )
      }
      for (const parameter of op.parameters.parameters) {
        if (parameter.type !== 'path' && parameter.type !== 'query') continue
        const words = splitWords(parameter.name)
        const joined = words.join('')
        const hit = options.sensitiveWords.find((w) => words.includes(w) || joined.includes(w))
        if (hit) {
          report(
            parameter.param,
            `${parameter.type} parameter '${parameter.name}' looks sensitive ('${hit}') and must not be sent in the URL.`,
          )
        }
      }
    }
  },
})

export interface ParameterProvidableOptions {
  /** Regular expression source of the parameter names to check: identifiers by default. */
  pattern: string
  /** Names consumers know without asking the API, e.g. `tenantId`. */
  known: string[]
}

/** Names a response type gives a consumer: its property names, and `<model>Id` for a model with an `id`. */
function providedNames(type: Type, names: Set<string>, seen: Set<Type>): void {
  if (seen.has(type)) return
  seen.add(type)
  if (type.kind === 'Union') {
    for (const variant of type.variants.values()) providedNames(variant.type, names, seen)
    return
  }
  if (type.kind !== 'Model') return
  if (type.indexer) providedNames(type.indexer.value, names, seen)
  if (type.name && type.properties.has('id')) {
    names.add(`${type.name.charAt(0).toLowerCase()}${type.name.slice(1)}Id`)
  }
  for (const property of type.properties.values()) {
    names.add(property.name)
    providedNames(property.type, names, seen)
  }
}

/**
 * Purpose: A consumer can only call a goal if it can supply its parameters: it knows the value, or
 * another goal returns it. The rule checks identifiers (`*Id` by default): some operation must
 * return the value without requiring it. Names consumers know anyway go in `known`. The rule
 * reasons from names: `orderId` is providable when an operation returns an `Order` with an `id`,
 * or a property named `orderId`.
 *
 * NG:
 * ```tsp
 * model Order { id: string; total: decimal; }
 *
 * // Nothing returns an order id: where would a consumer get one?
 * @route("/orders/{orderId}") @get op readOrder(@path orderId: string): Order;
 * ```
 *
 * OK:
 * ```tsp
 * model Order { id: string; total: decimal; }
 *
 * @route("/orders") @get op listOrders(): Order[];
 * @route("/orders/{orderId}") @get op readOrder(@path orderId: string): Order;
 * ```
 */
export const parameterProvidable = defineRule<ParameterProvidableOptions>()({
  name: 'parameter-providable',
  description: 'Consumers must be able to obtain every identifier an operation requires.',
  category: CATEGORY,
  recommended: true,
  // DEFAULT (may change): identifiers are recognized by the `Id` suffix. A naming assumption of ours.
  defaults: { pattern: 'Id$', known: [] },
  run({ analysis, options, report }) {
    const pattern = toRegExp(options.pattern)
    // What each operation requires and what its responses give back.
    const operations = analysis.httpOperations.map((op) => {
      const provides = new Set<string>()
      for (const response of op.responses) {
        for (const content of response.responses) {
          if (content.body) providedNames(content.body.type, provides, new Set())
        }
      }
      const required = op.parameters.parameters.filter((p) => !p.param.optional)
      return { required, requires: new Set(required.map((p) => p.param.name)), provides }
    })
    // One finding per identifier, at its first use: the cause is one missing operation.
    const reported = new Set<string>()
    for (const { required } of operations) {
      for (const parameter of required) {
        const name = parameter.param.name
        if (!pattern.test(name) || options.known.includes(name) || reported.has(name)) continue
        reported.add(name)
        // Some other goal must return the value without asking for it first.
        const providable = operations.some((op) => op.provides.has(name) && !op.requires.has(name))
        if (!providable) {
          report(
            parameter.param,
            `Consumers cannot obtain '${name}': no operation returns it without requiring it. Return it from another operation (a list or a create), or add it to 'known'.`,
          )
        }
      }
    }
  },
})
