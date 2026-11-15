import type { RuleSpec } from '../types/index.js'
import * as evolution from './evolution.js'
import * as extras from './extras.js'
import * as models from './models.js'
import * as operations from './operations.js'
import * as parameters from './parameters.js'
import * as responses from './responses.js'
import * as security from './security.js'

export const ruleSpecs = [
  evolution.breakingChange,
  security.securitySchemeUsed,
  security.securitySchemeValid,
  security.securityScopeValid,
  operations.operationDocumented,
  models.modelUsed,
  models.modelNaming,
  models.modelStructure,
  models.modelDocumented,
  extras.exampleRequired,
  models.propertyNaming,
  models.propertyRequired,
  models.propertyType,
  models.propertyDocumented,
  extras.standardFormat,
  operations.operationTagged,
  operations.operationPath,
  operations.operationMethod,
  operations.operationResponses,
  security.operationSecured,
  parameters.parameterNaming,
  parameters.parameterRequired,
  parameters.parameterType,
  parameters.parameterDocumented,
  parameters.parameterLocation,
  parameters.parameterProvidable,
  responses.responseStatusCode,
  responses.responseErrorBody,
  extras.responseProblemDetails,
  responses.responseHeaderNaming,
  responses.responseDocumented,
] as const

type Specs = (typeof ruleSpecs)[number]

/** Options of every rule, keyed by rule name. */
export type RuleOptionsMap = {
  [S in Specs as S['name']]: S extends RuleSpec<string, infer O> ? O : never
}

export type { MethodConvention } from './operations.js'
