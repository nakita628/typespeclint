import { getDoc, getTags, type Operation, type Program } from '@typespec/compiler'
import type { HttpVerb } from '@typespec/http'

import { defineRule } from '../helper/rule.js'
import type { CaseSpec } from '../types/index.js'
import { describeOperation, statusClass } from '../utils/http.js'
import { matchesCase, toRegExp } from '../utils/naming.js'

const CATEGORY = 'operations'

function hasTag(program: Program, operation: Operation): boolean {
  if (getTags(program, operation).length > 0) return true
  if (operation.interface && getTags(program, operation.interface).length > 0) return true
  for (let ns = operation.namespace ?? operation.interface?.namespace; ns; ns = ns.namespace) {
    if (getTags(program, ns).length > 0) return true
  }
  return false
}

/**
 * Purpose: Categorized operations are easier to find in the documentation.
 *
 * NG:
 * ```tsp
 * @route("/orders") @get op listOrders(): string[];
 * ```
 *
 * OK:
 * ```tsp
 * @tag("orders")
 * @route("/orders") @get op listOrders(): string[];
 * ```
 */
export const operationTagged = defineRule()({
  name: 'operation-tagged',
  description: 'Operations should be categorized with @tag.',
  category: CATEGORY,
  recommended: true,
  defaults: {},
  run({ program, analysis, report }) {
    for (const op of analysis.httpOperations) {
      if (!hasTag(program, op.operation)) {
        report(
          op.operation,
          `${describeOperation(op)} is not categorized. Add @tag to the operation, interface or namespace.`,
        )
      }
    }
  },
})

export interface OperationDocumentedOptions {
  /** Minimum length of the description. */
  minLength: number
}

/**
 * Purpose: The description is where the use case of an operation is explained. Without it,
 * reviewers and consumers have to guess what the goal is for.
 *
 * NG:
 * ```tsp
 * @route("/orders") @get op listOrders(): string[];
 * ```
 *
 * OK:
 * ```tsp
 * /** List the orders of the signed-in customer, newest first. *\/
 * @route("/orders") @get op listOrders(): string[];
 * ```
 */
export const operationDocumented = defineRule<OperationDocumentedOptions>()({
  name: 'operation-documented',
  description: 'Operations must explain their use case with a doc comment or @doc.',
  category: 'flows',
  recommended: true,
  defaults: { minLength: 1 },
  run({ program, analysis, options, report }) {
    for (const op of analysis.httpOperations) {
      const doc = getDoc(program, op.operation)?.trim() ?? ''
      if (doc.length < options.minLength) {
        report(
          op.operation,
          `${describeOperation(op)} has no description. Document what the operation is for.`,
        )
      }
    }
  },
})

export interface OperationPathOptions {
  /** Naming convention for static path segments. */
  segmentCase: CaseSpec
  /** Naming convention for path parameter names. */
  parameterCase: CaseSpec
  allowTrailingSlash: boolean
  /** Maximum number of segments, parameters included. */
  maxSegments?: number
  /** Static segments that may not appear, e.g. verbs such as `"get"` or `"create"`. */
  forbiddenSegments: string[]
}

/**
 * Purpose: Paths follow one format: kebab-case segments, camelCase path parameters and no trailing
 * slash.
 *
 * NG:
 * ```tsp
 * @route("/order_items/{item_id}/") @get op readOrderItem(@path item_id: string): string;
 * ```
 *
 * OK:
 * ```tsp
 * @route("/order-items/{itemId}") @get op readOrderItem(@path itemId: string): string;
 * ```
 */
export const operationPath = defineRule<OperationPathOptions>()({
  name: 'operation-path',
  description: 'Operation paths must follow the guideline format.',
  category: CATEGORY,
  recommended: true,
  // DEFAULT (may change): kebab-case segments and camelCase path parameters. Chosen by us; snake_case paths are just as common.
  defaults: {
    segmentCase: 'kebab-case',
    parameterCase: 'camelCase',
    allowTrailingSlash: false,
    forbiddenSegments: [],
  },
  unset: { maxSegments: 6 },
  run({ analysis, options, report }) {
    for (const op of analysis.httpOperations) {
      const where = describeOperation(op)
      if (!options.allowTrailingSlash && op.path.length > 1 && op.path.endsWith('/')) {
        report(op.operation, `${where}: path must not end with a slash.`)
      }
      const segments = op.path.split('/').filter(Boolean)
      if (options.maxSegments !== undefined && segments.length > options.maxSegments) {
        report(
          op.operation,
          `${where}: path has ${segments.length} segments, more than the ${options.maxSegments} allowed.`,
        )
      }
      for (const segment of segments) {
        if (segment.includes('{')) {
          for (const match of segment.matchAll(/\{[^A-Za-z0-9_]*([^}*:]+)[^}]*\}/g)) {
            const name = match[1] ?? ''
            if (!matchesCase(name, options.parameterCase)) {
              report(
                op.operation,
                `${where}: path parameter '${name}' must be ${options.parameterCase}.`,
              )
            }
          }
          continue
        }
        if (!matchesCase(segment, options.segmentCase)) {
          report(
            op.operation,
            `${where}: path segment '${segment}' must be ${options.segmentCase}.`,
          )
        }
        if (options.forbiddenSegments.includes(segment.toLowerCase())) {
          report(
            op.operation,
            `${where}: path segment '${segment}' is not allowed by the guidelines.`,
          )
        }
      }
    }
  },
})

export interface MethodConvention {
  /** Regular expression source tested against the operation name. */
  pattern: string
  /** HTTP methods an operation with such a name may use. */
  methods: HttpVerb[]
}

export interface OperationMethodOptions {
  /** HTTP methods the API may use. */
  allowed: HttpVerb[]
  /** Expected methods by operation name. */
  conventions: MethodConvention[]
}

/**
 * Purpose: The HTTP method must fit what the operation does. By default it is inferred from the
 * operation name (`get*` / `list*` are GET, `create*` is POST, `delete*` is DELETE, ...).
 *
 * NG:
 * ```tsp
 * @route("/orders/{orderId}") @post op deleteOrder(@path orderId: string): void;
 * ```
 *
 * OK:
 * ```tsp
 * @route("/orders/{orderId}") @delete op deleteOrder(@path orderId: string): void;
 * ```
 */
export const operationMethod = defineRule<OperationMethodOptions>()({
  name: 'operation-method',
  description: 'HTTP methods must be allowed by the guidelines and fit what the operation does.',
  category: CATEGORY,
  recommended: true,
  // DEFAULT (may change): the method expected from the operation name. A heuristic of ours; the verb list is not exhaustive.
  defaults: {
    allowed: ['get', 'post', 'put', 'patch', 'delete', 'head'],
    conventions: [
      { pattern: '^(get|list|read|find|fetch)([A-Z_]|$)', methods: ['get', 'head'] },
      { pattern: '^search([A-Z_]|$)', methods: ['get', 'post'] },
      { pattern: '^(create|add)([A-Z_]|$)', methods: ['post', 'put'] },
      { pattern: '^(update|modify|patch)([A-Z_]|$)', methods: ['put', 'patch'] },
      { pattern: '^replace([A-Z_]|$)', methods: ['put'] },
      { pattern: '^(delete|remove)([A-Z_]|$)', methods: ['delete'] },
    ],
  },
  run({ analysis, options, report }) {
    for (const op of analysis.httpOperations) {
      const where = describeOperation(op)
      if (!options.allowed.includes(op.verb)) {
        report(
          op.operation,
          `${where}: HTTP method ${op.verb.toUpperCase()} is not allowed by the guidelines.`,
        )
        continue
      }
      const name = op.operation.name
      const convention = options.conventions.find((c) => toRegExp(c.pattern).test(name))
      if (convention && !convention.methods.includes(op.verb)) {
        const expected = convention.methods.map((m) => m.toUpperCase()).join(' or ')
        report(
          op.operation,
          `${where}: operation '${name}' should use ${expected}, not ${op.verb.toUpperCase()}.`,
        )
      }
    }
  },
})

export interface OperationResponsesOptions {
  requireSuccess: boolean
  requireError: boolean
}

/**
 * Purpose: An operation declares every response it can return: at least one success and at least
 * one error.
 *
 * NG:
 * ```tsp
 * @route("/orders") @get op listOrders(): string[];
 * ```
 *
 * OK:
 * ```tsp
 * @error model ApiError { code: string; message: string; }
 *
 * @route("/orders") @get op listOrders(): string[] | ApiError;
 * ```
 */
export const operationResponses = defineRule<OperationResponsesOptions>()({
  name: 'operation-responses',
  description: 'Operations must declare both success and error responses.',
  category: CATEGORY,
  recommended: true,
  defaults: { requireSuccess: true, requireError: true },
  run({ analysis, options, report }) {
    for (const op of analysis.httpOperations) {
      const classes = new Set(op.responses.map((r) => statusClass(r.statusCodes)))
      if (options.requireSuccess && !classes.has('success')) {
        report(op.operation, `${describeOperation(op)} declares no success (2xx/3xx) response.`)
      }
      if (options.requireError && !classes.has('error')) {
        report(
          op.operation,
          `${describeOperation(op)} declares no error (4xx/5xx/default) response.`,
        )
      }
    }
  },
})
