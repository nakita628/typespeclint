import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { getTypeName, type Type } from '@typespec/compiler'
import type { HttpOperation, HttpPayloadBody } from '@typespec/http'

import type { ApiSnapshot, SnapshotField, SnapshotFields } from '../types/index.js'
import { describeOperation, formatStatus } from '../utils/http.js'

/** How a type is written in a snapshot: its name, or its members when the members are the contract. */
function signature(type: Type): string {
  if (type.kind === 'Enum') return `enum(${[...type.members.keys()].toSorted().join('|')})`
  return getTypeName(type)
}

type Entry = [path: string, field: SnapshotField]

/** The fields of `type` at `path`; an object is listed property by property. */
function fieldsOf(path: string, type: Type, optional: boolean, seen: Set<Type>): Entry[] {
  // A list is listed by its items, at `path[]`.
  if (type.kind === 'Model' && type.name === 'Array' && type.indexer) {
    const list: Entry[] = path === '' ? [] : [[path, { optional, type: 'array' }]]
    return [...list, ...fieldsOf(`${path}[]`, type.indexer.value, false, seen)]
  }
  const isObject = type.kind === 'Model' && !type.indexer && type.properties.size > 0
  if (!isObject || seen.has(type)) {
    return path === '' ? [] : [[path, { optional, type: signature(type) }]]
  }
  const own: Entry[] = path === '' ? [] : [[path, { optional, type: 'object' }]]
  const inside = new Set(seen).add(type)
  const nested = [...type.properties.values()].flatMap((property) =>
    fieldsOf(
      path === '' ? property.name : `${path}.${property.name}`,
      property.type,
      property.optional,
      inside,
    ),
  )
  return [...own, ...nested]
}

/** A body that is an object or a list is listed by its properties; anything else as `body`. */
function bodyFields(body: HttpPayloadBody | undefined): Entry[] {
  if (!body) return []
  const isStructured =
    body.type.kind === 'Model' && (!body.type.indexer || body.type.name === 'Array')
  return fieldsOf(isStructured ? '' : 'body', body.type, false, new Set())
}

/** The surface of the API a consumer depends on: what each operation takes and returns. */
export function snapshotOf(operations: HttpOperation[]): ApiSnapshot {
  return {
    operations: Object.fromEntries(
      operations.map((op) => {
        const parameters: Entry[] = op.parameters.parameters.map((parameter) => [
          `${parameter.type}:${parameter.name}`,
          { optional: parameter.param.optional, type: signature(parameter.param.type) },
        ])
        const request: SnapshotFields = Object.fromEntries([
          ...parameters,
          ...bodyFields(op.parameters.body),
        ])
        // Several responses can share a status (one per content type): their fields are merged.
        const byStatus = new Map<string, Entry[]>()
        for (const response of op.responses) {
          const status = formatStatus(response.statusCodes)
          const entries = response.responses.flatMap((content) => bodyFields(content.body))
          byStatus.set(status, [...(byStatus.get(status) ?? []), ...entries])
        }
        const responses = Object.fromEntries(
          [...byStatus].map(([status, entries]) => [status, Object.fromEntries(entries)]),
        )
        return [describeOperation(op), { request, responses }]
      }),
    ),
  }
}

export function readBaseline(file: string): ApiSnapshot | undefined {
  if (!existsSync(file)) return undefined
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || !('operations' in parsed)) {
    throw new Error(`typespeclint: ${file} is not a baseline written by typespeclint.`)
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- shape checked above; the file is ours
  return parsed as ApiSnapshot
}

export function writeBaseline(file: string, snapshot: ApiSnapshot): void {
  writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`)
}
