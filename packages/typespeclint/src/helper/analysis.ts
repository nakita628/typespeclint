import {
  getLocationContext,
  listOperationsIn,
  listServices,
  type Model,
  type ModelProperty,
  type Namespace,
  type Operation,
  type Program,
  type Type,
} from '@typespec/compiler'
import {
  getAuthentication,
  getHttpOperation,
  isBody,
  isBodyRoot,
  isMetadata,
  isMultipartBodyProperty,
  type HttpService,
} from '@typespec/http'

import type { Analysis } from '../types/index.js'
import { inlineModels } from '../utils/typespec.js'

const cache = new WeakMap<Program, Analysis>()
const ownProperties = new WeakMap<Model, ModelProperty[]>()

export function isUserType(program: Program, type: Type): boolean {
  return getLocationContext(program, type).type === 'project'
}

/**
 * The HTTP services of the program. Same result as `getAllHttpServices`, built from
 * `getHttpOperation`, which caches per program: the operations are resolved once and shared
 * with whatever else asks for them (emitters), instead of being resolved again for the linter.
 */
function httpServices(program: Program): HttpService[] {
  const global = program.getGlobalNamespaceType()
  const declared = listServices(program).map((service) => service.type)
  const namespaces = declared.length > 0 ? declared : [global]
  return namespaces.map((namespace) => ({
    namespace,
    operations: listOperationsIn(namespace, { recursive: namespace !== global }).map(
      (operation) => getHttpOperation(program, operation)[0],
    ),
    authentication: getAuthentication(program, namespace),
  }))
}

export function analyze(program: Program): Analysis {
  const cached = cache.get(program)
  if (cached) return cached

  // Named declarations live in namespaces and interfaces. Walking those is enough; a full
  // `navigateProgram` would also visit every property and type of the standard library.
  const models: Model[] = []
  const operations: Operation[] = []
  const visit = (namespace: Namespace): void => {
    for (const model of namespace.models.values()) {
      if (model.name && isUserType(program, model)) models.push(model)
    }
    for (const operation of namespace.operations.values()) {
      if (isUserType(program, operation)) operations.push(operation)
    }
    for (const iface of namespace.interfaces.values()) {
      if (!isUserType(program, iface)) continue
      for (const operation of iface.operations.values()) operations.push(operation)
    }
    for (const child of namespace.namespaces.values()) visit(child)
  }
  visit(program.getGlobalNamespaceType())

  const services = httpServices(program)
  const httpOperations = services
    .flatMap((service) => service.operations)
    .filter((op) => isUserType(program, op.operation))

  const reachable = new Set<Type>()
  const reachableNodes = new Set<object>()
  const walk = (type: Type | undefined): void => {
    if (!type || reachable.has(type)) return
    reachable.add(type)
    if (type.node) reachableNodes.add(type.node)
    switch (type.kind) {
      case 'Model':
        for (const prop of type.properties.values()) walk(prop)
        walk(type.baseModel)
        type.derivedModels.forEach(walk)
        walk(type.indexer?.value)
        walk(type.sourceModel)
        for (const source of type.sourceModels) walk(source.model)
        for (const arg of type.templateMapper?.args ?? []) {
          if ('entityKind' in arg && arg.entityKind === 'Type') walk(arg)
        }
        break
      case 'ModelProperty':
        walk(type.type)
        walk(type.sourceProperty)
        if (type.model) walk(type.model)
        break
      case 'Union':
        for (const variant of type.variants.values()) walk(variant.type)
        break
      case 'Tuple':
        type.values.forEach(walk)
        break
      case 'Scalar':
        walk(type.baseScalar)
        break
      case 'EnumMember':
        walk(type.enum)
        break
      case 'UnionVariant':
        walk(type.type)
        break
      default:
        break
    }
  }
  // Only the project's own operations can refer to the project's models.
  for (const operation of operations) {
    for (const prop of operation.parameters.properties.values()) walk(prop.type)
    for (const source of operation.parameters.sourceModels) walk(source.model)
    walk(operation.returnType)
  }

  const analysis = { models, operations, services, httpOperations, reachableNodes }
  cache.set(program, analysis)
  return analysis
}

/**
 * Data properties declared by a model itself, including those of inline anonymous
 * models. Copies made by spread / `is` and HTTP metadata (`@header`, `@path`,
 * `@statusCode`, ...) are skipped.
 */
export function ownDataProperties(program: Program, model: Model): ModelProperty[] {
  // Several rules ask for the same model; a model belongs to one program.
  const known = ownProperties.get(model)
  if (known) return known
  const result: ModelProperty[] = []
  ownProperties.set(model, result)
  const seen = new Set<Model>()
  const visit = (current: Model): void => {
    if (seen.has(current)) return
    seen.add(current)
    for (const prop of current.properties.values()) {
      if (prop.sourceProperty || isMetadata(program, prop) || isBodyLike(program, prop)) continue
      result.push(prop)
      for (const inline of inlineModels(prop.type)) visit(inline)
    }
  }
  visit(model)
  return result
}

/** A response envelope: a model describing an HTTP message (`@statusCode`, `@header`, `@body`, ...). */
export function isEnvelope(program: Program, model: Model): boolean {
  return [...model.properties.values()].some(
    (prop) => isMetadata(program, prop) || isBodyLike(program, prop),
  )
}

function isBodyLike(program: Program, prop: ModelProperty): boolean {
  return (
    isBody(program, prop) || isBodyRoot(program, prop) || isMultipartBodyProperty(program, prop)
  )
}
