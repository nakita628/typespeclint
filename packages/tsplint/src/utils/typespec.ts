// Pure questions about TypeSpec types: no program, no state.
import type { Model, ModelProperty, Type } from '@typespec/compiler'

import { AUTH_SCHEME_ENUM, OAUTH2_FLOW_ENUM } from '../constants/index.js'

/**
 * Security definitions: auth schemes and OAuth2 flows. Their `type` property is a
 * member of `TypeSpec.Http.AuthType` / `OAuth2FlowType`. They are not API data, so
 * the model and property rules skip them.
 */
export function isAuthModel(model: Model): boolean {
  const type = model.properties.get('type')?.type
  return (
    type?.kind === 'EnumMember' &&
    (type.enum.name === AUTH_SCHEME_ENUM || type.enum.name === OAUTH2_FLOW_ENUM)
  )
}

/** An auth scheme (not a flow), i.e. something `@useAuth` accepts. */
export function isAuthScheme(model: Model): boolean {
  const type = model.properties.get('type')?.type
  return type?.kind === 'EnumMember' && type.enum.name === AUTH_SCHEME_ENUM
}

/** Names of a scalar and all the scalars it extends (`int32` -> `int32`, `int64`, `integer`, `numeric`). */
export function scalarChain(type: Type): string[] {
  const names: string[] = []
  let current = type.kind === 'Scalar' ? type : undefined
  while (current) {
    names.push(current.name)
    current = current.baseScalar
  }
  return names
}

/** Strip `T[]` and `T | null` wrappers. */
export function unwrapType(type: Type): Type {
  if (
    type.kind === 'Model' &&
    type.indexer &&
    type.properties.size === 0 &&
    type.name === 'Array'
  ) {
    return unwrapType(type.indexer.value)
  }
  if (type.kind === 'Union' && !type.name) {
    const variants = [...type.variants.values()]
      .map((variant) => variant.type)
      .filter((t) => !(t.kind === 'Intrinsic' && t.name === 'null'))
    if (variants.length === 1 && variants[0]) return unwrapType(variants[0])
  }
  return type
}

/** Anonymous object models nested directly in a type (through arrays and unions). */
export function inlineModels(type: Type): Model[] {
  if (type.kind === 'Model') {
    if (type.indexer && type.properties.size === 0) return inlineModels(type.indexer.value)
    return type.name === '' ? [type] : []
  }
  if (type.kind === 'Union' && !type.name) {
    return [...type.variants.values()].flatMap((variant) => inlineModels(variant.type))
  }
  return []
}

/** Look a property up on a model and the models it extends. */
export function findProperty(model: Model, name: string): ModelProperty | undefined {
  for (let current: Model | undefined = model; current; current = current.baseModel) {
    const prop = current.properties.get(name)
    if (prop) return prop
  }
  return undefined
}

/** Type names a value type answers to, or `undefined` when it cannot be judged. */
export function typeNames(type: Type): string[] | undefined {
  const target = unwrapType(type)
  switch (target.kind) {
    case 'Scalar':
      return scalarChain(target)
    case 'Boolean':
      return ['boolean']
    case 'String':
      return ['string']
    case 'Number':
      return ['numeric']
    case 'Model':
    case 'Enum':
    case 'Union':
      return target.name ? [target.name] : undefined
    default:
      return undefined
  }
}
