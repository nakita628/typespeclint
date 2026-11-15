import { getDoc, isErrorModel } from '@typespec/compiler'
import { getStatusCodeDescription, type HttpVerb } from '@typespec/http'

import { isUserType } from '../helper/analysis.js'
import { defineRule } from '../helper/rule.js'
import type { CaseSpec } from '../types/index.js'
import { describeOperation, formatStatus, statusClass } from '../utils/http.js'
import { matchesCase } from '../utils/naming.js'

const CATEGORY = 'responses'

export interface ResponseStatusCodeOptions {
  /** Status codes the API may return. */
  allowed: number[]
  /** Allow status ranges and the default (`*`) response. */
  allowDefault: boolean
  /** Success codes allowed per HTTP method. */
  successByMethod: Partial<Record<HttpVerb, number[]>>
}

/**
 * Purpose: Only the status codes the guidelines allow are used, and the success code fits the
 * method (for example GET does not return 201).
 *
 * NG:
 * ```tsp
 * model Teapot { @statusCode statusCode: 418; }
 * model Created { @statusCode statusCode: 201; @body body: string; }
 *
 * @route("/orders/{orderId}") @get op readOrder(@path orderId: string): Created | Teapot;
 * ```
 *
 * OK:
 * ```tsp
 * @route("/orders/{orderId}") @get op readOrder(@path orderId: string): string | NotFoundResponse;
 * ```
 */
export const responseStatusCode = defineRule<ResponseStatusCodeOptions>()({
  name: 'response-status-code',
  description: 'Response status codes must be allowed by the guidelines and fit the HTTP method.',
  category: CATEGORY,
  recommended: true,
  // DEFAULT (may change): the allowed status codes and the success codes per method are a selection of ours, not the full IANA registry.
  defaults: {
    allowed: [
      200, 201, 202, 204, 206, 301, 302, 303, 304, 307, 308, 400, 401, 403, 404, 405, 406, 408, 409,
      410, 412, 413, 415, 422, 429, 500, 501, 502, 503, 504,
    ],
    allowDefault: true,
    successByMethod: {
      get: [200, 206],
      head: [200, 204],
      post: [200, 201, 202, 204],
      put: [200, 201, 202, 204],
      patch: [200, 202, 204],
      delete: [200, 202, 204],
    },
  },
  run({ analysis, options, report }) {
    for (const op of analysis.httpOperations) {
      const where = describeOperation(op)
      for (const response of op.responses) {
        const status = response.statusCodes
        if (typeof status !== 'number') {
          if (!options.allowDefault) {
            report(
              op.operation,
              `${where}: response '${formatStatus(status)}' must use an explicit status code.`,
            )
          }
          continue
        }
        if (!options.allowed.includes(status)) {
          report(op.operation, `${where}: status code ${status} is not allowed by the guidelines.`)
          continue
        }
        const success = options.successByMethod[op.verb]
        if (status >= 200 && status < 300 && success && !success.includes(status)) {
          report(
            op.operation,
            `${where}: ${op.verb.toUpperCase()} should not return ${status} (expected ${success.join(', ')}).`,
          )
        }
        if ((status === 204 || status === 304) && response.responses.some((r) => r.body)) {
          report(op.operation, `${where}: a ${status} response must not have a body.`)
        }
      }
    }
  },
})

export interface ResponseErrorBodyOptions {
  /** Error responses must have a body. */
  requireBody: boolean
  /** The body must be a model decorated with `@error`. */
  requireErrorDecorator: boolean
  /** When set, error bodies must be one of these models (the standard error model). */
  models?: string[]
}

/**
 * Purpose: Every error response returns the standard error model: a model decorated with `@error`,
 * or one of the models named in `models`. Consumers then handle all errors one way.
 *
 * NG:
 * ```tsp
 * model Failure { @statusCode statusCode: 400; message: string; }
 *
 * @route("/orders") @get op listOrders(): string[] | Failure | NotFoundResponse;
 * ```
 *
 * OK:
 * ```tsp
 * @error model ApiError { code: string; message: string; }
 *
 * @route("/orders") @get op listOrders(): string[] | ApiError;
 * ```
 */
export const responseErrorBody = defineRule<ResponseErrorBodyOptions>()({
  name: 'response-error-body',
  description: 'Error responses must use the standard error model.',
  category: CATEGORY,
  recommended: true,
  // A body is not required by default: TypeSpec's own `NotFoundResponse` and friends have none.
  // DEFAULT (may change): an error must be an `@error` model; a body is not required, because TypeSpec's own `NotFoundResponse` has none.
  defaults: { requireBody: false, requireErrorDecorator: true },
  unset: { models: ['ApiError'] },
  run({ program, analysis, options, report }) {
    for (const op of analysis.httpOperations) {
      const where = describeOperation(op)
      for (const response of op.responses) {
        if (statusClass(response.statusCodes) !== 'error') continue
        const status = formatStatus(response.statusCodes)
        const bodies = response.responses.map((r) => r.body).filter((b) => b !== undefined)
        if (bodies.length === 0) {
          if (options.requireBody) {
            report(
              op.operation,
              `${where}: error response ${status} has no body. Return the standard error model.`,
            )
          }
          continue
        }
        for (const body of bodies) {
          const candidates = [response.type, body.type]
          if (options.requireErrorDecorator && !candidates.some((t) => isErrorModel(program, t))) {
            report(
              op.operation,
              `${where}: error response ${status} must return a model decorated with @error.`,
            )
          }
          const allowed = options.models
          if (allowed) {
            const names = candidates.map((t) => (t.kind === 'Model' ? t.name : ''))
            if (!names.some((n) => allowed.includes(n))) {
              report(
                op.operation,
                `${where}: error response ${status} must return ${allowed.join(' or ')}.`,
              )
            }
          }
        }
      }
    }
  },
})

export interface ResponseHeaderNamingOptions {
  case: CaseSpec
}

/**
 * Purpose: Response header names follow one convention (hyphen-separated words by default).
 *
 * NG:
 * ```tsp
 * model OrderList { @header("x_total_count") totalCount: int32; @body body: string[]; }
 *
 * @route("/orders") @get op listOrders(): OrderList;
 * ```
 *
 * OK:
 * ```tsp
 * model OrderList { @header("X-Total-Count") totalCount: int32; @body body: string[]; }
 *
 * @route("/orders") @get op listOrders(): OrderList;
 * ```
 */
export const responseHeaderNaming = defineRule<ResponseHeaderNamingOptions>()({
  name: 'response-header-naming',
  description: 'Response header names must follow the guideline convention.',
  category: CATEGORY,
  recommended: true,
  // DEFAULT (may change): hyphen-separated words, any letter case (header names are case-insensitive).
  defaults: { case: 'http-header' },
  run({ analysis, options, report }) {
    for (const op of analysis.httpOperations) {
      for (const response of op.responses) {
        for (const content of response.responses) {
          for (const [name, property] of Object.entries(content.headers ?? {})) {
            if (!matchesCase(name, options.case)) {
              report(property, `response header '${name}' must be ${options.case}.`)
            }
          }
        }
      }
    }
  },
})

/**
 * Purpose: A response says what happened and, for errors, what to do about it. Without a
 * description of its own it only carries the generic text of its status code.
 *
 * NG:
 * ```tsp
 * @route("/orders") @get op listOrders(): string[];
 * ```
 *
 * OK:
 * ```tsp
 * @returnsDoc("The identifiers of the orders of the signed-in customer.")
 * @route("/orders") @get op listOrders(): string[];
 * ```
 */
export const responseDocumented = defineRule()({
  name: 'response-documented',
  description: 'Responses must be described.',
  category: CATEGORY,
  recommended: true,
  defaults: {},
  run({ program, analysis, report }) {
    for (const op of analysis.httpOperations) {
      for (const response of op.responses) {
        // Without a description of its own, a response gets the generic text of its status.
        const generic = getStatusCodeDescription(response.statusCodes)
        // A documented model of the project returned as is describes the response too, although
        // the HTTP library keeps that text for the schema. A library type's own documentation
        // (`string`, `NotFoundResponse`) says nothing about this API.
        const own = isUserType(program, response.type) ? getDoc(program, response.type) : undefined
        const texts = [response.description, own]
        if (!texts.some((text) => text?.trim() && text !== generic)) {
          report(
            op.operation,
            `${describeOperation(op)}: response ${formatStatus(response.statusCodes)} has no description. Describe it with a doc comment on the response model, @returnsDoc or @errorsDoc.`,
          )
        }
      }
    }
  },
})
