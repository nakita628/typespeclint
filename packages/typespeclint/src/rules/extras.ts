import {
  getExamples,
  getFormat,
  getOpExamples,
  getPattern,
  isTemplateDeclaration,
  type Model,
  type ModelProperty,
  type Program,
} from '@typespec/compiler'

import { PROBLEM_JSON, STANDARD_KEYS, STANDARDS } from '../constants/index.js'
import { isEnvelope, isUserType, ownDataProperties } from '../helper/analysis.js'
import { defineRule } from '../helper/rule.js'
import type { StandardSpec } from '../types/index.js'
import { describeOperation, formatStatus, statusClass } from '../utils/http.js'
import { toRegExp } from '../utils/naming.js'
import { findProperty, isAuthModel, scalarChain, unwrapType } from '../utils/typespec.js'

export interface ExampleRequiredOptions {
  /** Require `@example` on payload models. */
  models: boolean
  /** Require `@opExample` on operations. */
  operations: boolean
  /** Regular expression sources of model names to leave alone. */
  ignore: string[]
}

/**
 * Purpose: Examples make the generated documentation show a real payload instead of a bare schema.
 * Opt-in; set `operations: true` to also require `@opExample`.
 *
 * NG:
 * ```tsp
 * model Order { id: string; total: decimal; }
 * ```
 *
 * OK:
 * ```tsp
 * @example(#{ id: "ord_123", total: 42.5 })
 * model Order { id: string; total: decimal; }
 * ```
 */
export const exampleRequired = defineRule<ExampleRequiredOptions>()({
  name: 'example-required',
  description: 'Payload models (and optionally operations) must carry an example.',
  category: 'models',
  recommended: false,
  defaults: { models: true, operations: false, ignore: [] },
  run({ program, analysis, options, report }) {
    if (options.models) {
      for (const model of analysis.models) {
        if (isAuthModel(model) || isTemplateDeclaration(model) || isEnvelope(program, model))
          continue
        // Arrays / records take their example from the element type; binary payloads cannot have one.
        if (model.indexer || model.properties.size === 0) continue
        if (
          [...model.properties.values()].some((p) =>
            scalarChain(unwrapType(p.type)).includes('bytes'),
          )
        )
          continue
        if (options.ignore.some((p) => toRegExp(p).test(model.name))) continue
        if (getExamples(program, model).length === 0) {
          report(model, `Model '${model.name}' has no @example.`)
        }
      }
    }
    if (options.operations) {
      for (const op of analysis.httpOperations) {
        if (getOpExamples(program, op.operation).length === 0) {
          report(op.operation, `${describeOperation(op)} has no @opExample.`)
        }
      }
    }
  },
})

export interface ResponseProblemDetailsOptions {
  /** RFC 9457 members every error body must declare. */
  requiredMembers: string[]
  /** Error responses must be sent as `application/problem+json`. */
  requireContentType: boolean
  /** A literal `status` member must equal the response status code. */
  requireMatchingStatus: boolean
  /** Regular expression source a literal `type` member must match, e.g. `"^/problems/[a-z-]+$"`. */
  typePattern?: string
}

/**
 * Purpose: Error bodies follow RFC 9457 problem details (`type`, `title`, `status`, `detail`,
 * `instance`) and are sent as `application/problem+json`. Opt-in; `requiredMembers`,
 * `requireContentType` and `typePattern` adapt it to your guidelines.
 *
 * NG:
 * ```tsp
 * @error model NotFound { @statusCode statusCode: 404; message: string; }
 *
 * @route("/orders/{orderId}") @get op readOrder(@path orderId: string): string | NotFound;
 * ```
 *
 * OK:
 * ```tsp
 * model NotFoundProblem {
 *   type: "/problems/not-found";
 *   title: string;
 *   status: 404;
 *   detail: string;
 *   instance: string;
 * }
 *
 * @error model NotFoundProblemResponse {
 *   @statusCode statusCode: 404;
 *   @header contentType: "application/problem+json";
 *   @body body: NotFoundProblem;
 * }
 *
 * @route("/orders/{orderId}") @get op readOrder(@path orderId: string): string | NotFoundProblemResponse;
 * ```
 */
export const responseProblemDetails = defineRule<ResponseProblemDetailsOptions>()({
  name: 'response-problem-details',
  description: 'Error responses must be RFC 9457 problem details.',
  category: 'responses',
  recommended: false,
  // DEFAULT (may change): all five members are required here although RFC 9457 makes each of them optional. Stricter than the RFC by choice.
  defaults: {
    requiredMembers: ['type', 'title', 'status', 'detail', 'instance'],
    requireContentType: true,
    requireMatchingStatus: true,
  },
  unset: { typePattern: '^/problems/[a-z0-9-]+$' },
  run({ program, analysis, options, report }) {
    for (const op of analysis.httpOperations) {
      const where = describeOperation(op)
      for (const response of op.responses) {
        if (statusClass(response.statusCodes) !== 'error') continue
        const status = formatStatus(response.statusCodes)
        for (const content of response.responses) {
          const body = content.body
          if (!body) continue // a missing body is `response-error-body`'s concern
          const type = body.bodyKind === 'single' ? unwrapType(body.type) : undefined
          if (type?.kind !== 'Model') {
            report(
              op.operation,
              `${where}: error response ${status} must return an RFC 9457 problem details object.`,
            )
            continue
          }
          // Report on the declaration when it is ours, so a shared model is reported once.
          const target = isUserType(program, type) && type.name ? type : op.operation
          const label = type.name ? `'${type.name}'` : `the body of ${where} ${status}`
          const missing = options.requiredMembers.filter((m) => !findProperty(type, m))
          if (missing.length > 0) {
            report(target, `Problem details ${label} is missing ${missing.join(', ')} (RFC 9457).`)
          }
          if (options.requireContentType && !body.contentTypes.includes(PROBLEM_JSON)) {
            const envelope = response.type
            if (envelope.kind === 'Model' && envelope.name && isUserType(program, envelope)) {
              report(
                envelope,
                `Error response '${envelope.name}' must be sent as ${PROBLEM_JSON} (RFC 9457).`,
              )
            } else {
              report(
                op.operation,
                `${where}: error response ${status} must be sent as ${PROBLEM_JSON} (RFC 9457).`,
              )
            }
          }
          const statusMember = findProperty(type, 'status')?.type
          if (
            options.requireMatchingStatus &&
            statusMember?.kind === 'Number' &&
            typeof response.statusCodes === 'number' &&
            statusMember.value !== response.statusCodes
          ) {
            report(
              op.operation,
              `${where}: problem details ${label} says status ${statusMember.value} but the response is ${status}.`,
            )
          }
          const typeMember = findProperty(type, 'type')?.type
          if (
            options.typePattern &&
            typeMember?.kind === 'String' &&
            !toRegExp(options.typePattern).test(typeMember.value)
          ) {
            report(
              target,
              `Problem type '${typeMember.value}' of ${label} does not match /${options.typePattern}/.`,
            )
          }
        }
      }
    }
  },
})

export interface StandardFormatOptions {
  /** ISO 4217 currency codes (`currency`, `currencyCode`). */
  currency: boolean
  /** ISO 3166-1 country codes (`country`, `countryCode`). */
  country: boolean
  /** BCP 47 / RFC 5646 language tags (`language`, `locale`). */
  language: boolean
  /** E.164 phone numbers (`phone`, `phoneNumber`, `tel`). */
  phone: boolean
  /** RFC 5322 e-mail addresses (`email`). */
  email: boolean
  /** RFC 9562 UUIDs (`uuid`). */
  uuid: boolean
  /** Additional standards of your guidelines. */
  custom: StandardSpec[]
}

/** A value is constrained when it is more specific than a bare built-in scalar. */
function isConstrained(program: Program, prop: ModelProperty): boolean {
  if (getPattern(program, prop) || getFormat(program, prop)) return true
  const type = unwrapType(prop.type)
  switch (type.kind) {
    case 'Scalar':
      for (let s: typeof type | undefined = type; s; s = s.baseScalar) {
        if (getPattern(program, s) || getFormat(program, s)) return true
        // A dedicated scalar (`scalar CurrencyCode extends string`) names the standard itself.
        if (isUserType(program, s)) return true
      }
      return false
    case 'TemplateParameter':
    case 'Intrinsic':
      return true // cannot be judged
    default:
      return true // enums, literal unions and models are already specific
  }
}

/**
 * Purpose: When a standard exists for a piece of data (ISO 4217 currencies, ISO 3166-1 countries,
 * BCP 47 languages, E.164 phone numbers, RFC 5322 e-mail, RFC 9562 UUIDs), use it instead of a
 * free-form string. Opt-in; each standard can be switched off and `custom` adds your own.
 *
 * NG:
 * ```tsp
 * model Price { amount: decimal; currency: string; }
 * ```
 *
 * OK:
 * ```tsp
 * /** ISO 4217 currency code. *\/
 * @pattern("^[A-Z]{3}$")
 * scalar CurrencyCode extends string;
 *
 * model Price { amount: decimal; currency: CurrencyCode; }
 * ```
 */
export const standardFormat = defineRule<StandardFormatOptions>()({
  name: 'standard-format',
  description: 'Data covered by a standard (ISO 4217, E.164, ...) must not be a free-form value.',
  category: 'properties',
  recommended: false,
  // DEFAULT (may change): every known standard is on. Which names count as a currency, a country, ... is decided by the patterns in STANDARDS, which are ours.
  defaults: {
    currency: true,
    country: true,
    language: true,
    phone: true,
    email: true,
    uuid: true,
    custom: [],
  },
  run({ program, analysis, options, report }) {
    const standards = [
      ...STANDARD_KEYS.filter((key) => options[key]).map((key) => STANDARDS[key]),
      ...options.custom,
    ]
    const check = (prop: ModelProperty, kind: string, name: string): void => {
      const standard = standards.find((s) => toRegExp(s.pattern).test(prop.name))
      if (standard && !isConstrained(program, prop)) {
        report(
          prop,
          `${kind} '${name}' should follow ${standard.standard}: constrain it with @pattern / @format, an enum, or a dedicated scalar.`,
        )
      }
    }
    const models: Model[] = analysis.models.filter((m) => !isAuthModel(m))
    for (const model of models) {
      for (const prop of ownDataProperties(program, model)) check(prop, 'Property', prop.name)
    }
    for (const op of analysis.httpOperations) {
      for (const parameter of op.parameters.parameters) {
        check(parameter.param, `${parameter.type} parameter`, parameter.name)
      }
    }
  },
})
