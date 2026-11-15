import { isTemplateDeclaration, type Program, type Type } from '@typespec/compiler'
import {
  getAuthenticationForOperation,
  resolveAuthentication,
  type HttpAuth,
  type HttpService,
} from '@typespec/http'

import { isUserType } from '../helper/analysis.js'
import { defineRule } from '../helper/rule.js'
import { describeOperation } from '../utils/http.js'
import { toRegExp } from '../utils/naming.js'
import { isAuthScheme } from '../utils/typespec.js'

const CATEGORY = 'security'

type Scheme = HttpAuth & { target: Type }

/**
 * Schemes used by the services. Schemes written inline (`@useAuth(BearerAuth)`,
 * `OAuth2Auth<[Flow]>`) are library types, where findings would be dropped, so
 * those are reported on the service namespace instead.
 */
function allSchemes(program: Program, services: HttpService[]): Scheme[] {
  // Three rules read the schemes; resolve them once per program.
  let schemes = schemesOf.get(program)
  if (!schemes) {
    schemes = resolveSchemes(program, services)
    schemesOf.set(program, schemes)
  }
  return schemes
}

const schemesOf = new WeakMap<Program, Scheme[]>()

function resolveSchemes(program: Program, services: HttpService[]): Scheme[] {
  return services.flatMap((service) =>
    // oxlint-disable-next-line oxc/no-map-spread -- a handful of schemes; the copy keeps HttpAuth's union intact
    resolveAuthentication(service).schemes.map((scheme) => ({
      ...scheme,
      target: isUserType(program, scheme.model) ? scheme.model : service.namespace,
    })),
  )
}

/**
 * Purpose: A security scheme that is declared but never applied is either dead code or a forgotten
 * `@useAuth`. Apply it or delete it.
 *
 * NG:
 * ```tsp
 * model LegacyKey is ApiKeyAuth<ApiKeyLocation.header, "X-Legacy-Key">;
 *
 * @service
 * @useAuth(BearerAuth)
 * namespace Shop {
 *   @route("/orders") @get op listOrders(): string[];
 * }
 * ```
 *
 * OK:
 * ```tsp
 * model PartnerKey is ApiKeyAuth<ApiKeyLocation.header, "X-Partner-Key">;
 *
 * @service
 * @useAuth(BearerAuth | PartnerKey)
 * namespace Shop {
 *   @route("/orders") @get op listOrders(): string[];
 * }
 * ```
 */
export const securitySchemeUsed = defineRule()({
  name: 'security-scheme-used',
  description: 'Every declared security scheme must be used by the API.',
  category: CATEGORY,
  recommended: true,
  defaults: {},
  run({ program, analysis, report }) {
    const used = new Set(allSchemes(program, analysis.services).map((scheme) => scheme.model.node))
    for (const model of analysis.models) {
      if (!isAuthScheme(model) || isTemplateDeclaration(model)) continue
      if (model.node && !used.has(model.node) && !analysis.reachableNodes.has(model.node)) {
        report(
          model,
          `Security scheme '${model.name}' is never used. Apply it with @useAuth or remove it.`,
        )
      }
    }
  },
})

export interface SecuritySchemeValidOptions {
  /** Require `https://` for OAuth2 / OpenID Connect URLs. */
  requireHttps: boolean
  /** Allow API keys to be sent in the query string. */
  allowApiKeyInQuery: boolean
  /** Scheme kinds that may not be used, e.g. `["basic", "implicit"]`. */
  disallow: Array<
    'basic' | 'bearer' | 'apiKey' | 'oauth2' | 'openIdConnect' | 'implicit' | 'password'
  >
}

/**
 * Purpose: Security schemes must carry correct machine-readable information: absolute https URLs,
 * no API key in the query string, and none of the flows the guidelines forbid (`implicit` and
 * `password` by default).
 *
 * NG:
 * ```tsp
 * model Implicit {
 *   type: OAuth2FlowType.implicit;
 *   authorizationUrl: "http://auth.example.com/authorize";
 *   scopes: ["orders:read"];
 * }
 *
 * @service
 * @useAuth(OAuth2Auth<[Implicit]>)
 * namespace Shop {
 *   @route("/orders") @get op listOrders(): string[];
 * }
 * ```
 *
 * OK:
 * ```tsp
 * model AuthorizationCode {
 *   type: OAuth2FlowType.authorizationCode;
 *   authorizationUrl: "https://auth.example.com/authorize";
 *   tokenUrl: "https://auth.example.com/token";
 *   scopes: ["orders:read"];
 * }
 *
 * @service
 * @useAuth(OAuth2Auth<[AuthorizationCode]>)
 * namespace Shop {
 *   @route("/orders") @get op listOrders(): string[];
 * }
 * ```
 */
export const securitySchemeValid = defineRule<SecuritySchemeValidOptions>()({
  name: 'security-scheme-valid',
  description:
    'Security schemes must carry valid, guideline-compliant machine-readable information.',
  category: CATEGORY,
  recommended: true,
  // DEFAULT (may change): https everywhere and no API key in the query string are common practice; `implicit` and `password` are the two flows OAuth 2.1 drops. Our choice, not a rule of TypeSpec.
  defaults: {
    requireHttps: true,
    allowApiKeyInQuery: false,
    disallow: ['implicit', 'password'],
  },
  run({ program, analysis, options, report }) {
    const checkUrl = (scheme: Scheme, label: string, value: string | undefined): void => {
      if (value === undefined) return
      let url: URL | undefined
      try {
        url = new URL(value)
      } catch {
        report(
          scheme.target,
          `Security scheme '${scheme.id}': ${label} '${value}' is not a valid absolute URL.`,
        )
        return
      }
      if (options.requireHttps && url.protocol !== 'https:') {
        report(scheme.target, `Security scheme '${scheme.id}': ${label} must use https.`)
      }
    }
    const disallowed = (
      scheme: Scheme,
      kind: SecuritySchemeValidOptions['disallow'][number],
    ): void => {
      if (options.disallow.includes(kind)) {
        report(
          scheme.target,
          `Security scheme '${scheme.id}' uses '${kind}', which the guidelines do not allow.`,
        )
      }
    }
    for (const scheme of allSchemes(program, analysis.services)) {
      switch (scheme.type) {
        case 'http':
          disallowed(scheme, scheme.scheme === 'Basic' ? 'basic' : 'bearer')
          break
        case 'apiKey':
          disallowed(scheme, 'apiKey')
          if (scheme.in === 'query' && !options.allowApiKeyInQuery) {
            report(
              scheme.target,
              `Security scheme '${scheme.id}' sends the API key in the query string; use a header instead.`,
            )
          }
          break
        case 'oauth2':
          disallowed(scheme, 'oauth2')
          if (scheme.flows.length === 0) {
            report(scheme.target, `Security scheme '${scheme.id}' declares no OAuth2 flow.`)
          }
          for (const flow of scheme.flows) {
            if (flow.type === 'implicit' || flow.type === 'password') disallowed(scheme, flow.type)
            if ('authorizationUrl' in flow)
              checkUrl(scheme, 'authorizationUrl', flow.authorizationUrl)
            if ('tokenUrl' in flow) checkUrl(scheme, 'tokenUrl', flow.tokenUrl)
            checkUrl(scheme, 'refreshUrl', flow.refreshUrl)
          }
          break
        case 'openIdConnect':
          disallowed(scheme, 'openIdConnect')
          checkUrl(scheme, 'openIdConnectUrl', scheme.openIdConnectUrl)
          break
        case 'noAuth':
          break
      }
    }
  },
})

export interface SecurityScopeOptions {
  /** Regular expression source every scope name must match. */
  pattern: string
}

/**
 * Purpose: Scopes are part of the contract consumers must understand. Name them with one pattern
 * (lowercase words joined by `:` or `.` by default).
 *
 * NG:
 * ```tsp
 * model ClientCredentials {
 *   type: OAuth2FlowType.clientCredentials;
 *   tokenUrl: "https://auth.example.com/token";
 *   scopes: ["ReadOrders"];
 * }
 *
 * @service
 * @useAuth(OAuth2Auth<[ClientCredentials]>)
 * namespace Shop {
 *   @route("/orders") @get op listOrders(): string[];
 * }
 * ```
 *
 * OK:
 * ```tsp
 * model ClientCredentials {
 *   type: OAuth2FlowType.clientCredentials;
 *   tokenUrl: "https://auth.example.com/token";
 *   scopes: ["orders:read"];
 * }
 *
 * @service
 * @useAuth(OAuth2Auth<[ClientCredentials]>)
 * namespace Shop {
 *   @route("/orders") @get op listOrders(): string[];
 * }
 * ```
 */
export const securityScopeValid = defineRule<SecurityScopeOptions>()({
  name: 'security-scope-valid',
  description: 'OAuth2 scopes must be named consistently.',
  category: CATEGORY,
  recommended: true,
  // TypeSpec has no syntax for scope descriptions, so only the name can be checked.
  // DEFAULT (may change): lowercase words joined by `:` or `.` (`orders:read`). One common style among several; chosen by us.
  defaults: { pattern: '^[a-z][a-z0-9]*([:.][a-z][a-z0-9]*)*$' },
  run({ program, analysis, options, report }) {
    const pattern = toRegExp(options.pattern)
    for (const scheme of allSchemes(program, analysis.services)) {
      if (scheme.type !== 'oauth2') continue
      for (const flow of scheme.flows) {
        for (const scope of flow.scopes) {
          if (!pattern.test(scope.value)) {
            report(
              scheme.target,
              `Scope '${scope.value}' of '${scheme.id}' does not match /${options.pattern}/.`,
            )
          }
        }
      }
    }
  },
})

export interface OperationSecuredOptions {
  /** Accept an explicit `@useAuth(NoAuth)` as a deliberate public endpoint. */
  allowNoAuth: boolean
}

/**
 * Purpose: Every operation is covered by a security scheme. A deliberately public operation says
 * so with `@useAuth(NoAuth)`.
 *
 * NG:
 * ```tsp
 * @service
 * namespace Shop;
 *
 * @route("/orders") @get op listOrders(): string[];
 * ```
 *
 * OK:
 * ```tsp
 * @service
 * @useAuth(BearerAuth)
 * namespace Shop;
 *
 * @route("/orders") @get op listOrders(): string[];
 *
 * @useAuth(NoAuth)
 * @route("/health") @get op readHealth(): string;
 * ```
 */
export const operationSecured = defineRule<OperationSecuredOptions>()({
  name: 'operation-secured',
  description: 'Every operation must be covered by a security mechanism.',
  category: 'operations',
  recommended: true,
  defaults: { allowNoAuth: true },
  run({ program, analysis, options, report }) {
    for (const service of analysis.services) {
      const operations = service.operations.filter((op) => isUserType(program, op.operation))
      const uncovered = operations.filter((op) => {
        const auth = getAuthenticationForOperation(program, op.operation)
        return !auth || auth.options.length === 0
      })
      // An API that declares no security at all has one problem, not one per operation.
      const nothingCovered = uncovered.length > 1 && uncovered.length === operations.length
      if (nothingCovered && service.namespace.name !== '') {
        report(
          service.namespace,
          `None of the ${operations.length} operations of '${service.namespace.name}' is covered by a security scheme. Add @useAuth to the namespace.`,
        )
      } else {
        for (const op of uncovered) {
          report(
            op.operation,
            `${describeOperation(op)} is not covered by any security scheme. Add @useAuth.`,
          )
        }
      }
      if (options.allowNoAuth) continue
      for (const op of operations) {
        const auth = getAuthenticationForOperation(program, op.operation)
        const anonymous = auth?.options.some(
          (option) => option.schemes.length > 0 && option.schemes.every((s) => s.type === 'noAuth'),
        )
        if (anonymous) {
          report(op.operation, `${describeOperation(op)} can be called without authentication.`)
        }
      }
    }
  },
})
