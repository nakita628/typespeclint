import { describe, expect, it } from 'vite-plus/test'

import { analyze } from '../src/helper/analysis.js'
import { snapshotOf } from '../src/helper/snapshot.js'
import * as parameters from '../src/rules/parameters.js'
import * as responses from '../src/rules/responses.js'
import type { ApiSnapshot } from '../src/types/index.js'
import { breakingChanges } from '../src/utils/snapshot.js'
import { ruleTester, SERVICE, Tester } from './helper.js'

const msg = (...messages: RegExp[]) => messages.map((message) => ({ message }))

const BEFORE: ApiSnapshot = {
  operations: {
    'GET /orders': {
      request: {
        'query:status': { optional: true, type: 'string' },
        'query:limit': { optional: true, type: 'int32' },
      },
      responses: {
        '200': {
          id: { optional: false, type: 'string' },
          total: { optional: false, type: 'decimal' },
          state: { optional: false, type: 'enum(open|paid)' },
        },
        '404': {},
      },
    },
    'DELETE /orders/{orderId}': { request: {}, responses: { '204': {} } },
  },
}

function changes(after: ApiSnapshot): string[] {
  return breakingChanges(BEFORE, after).map((change) => `${change.operation}: ${change.message}`)
}

const LIST = 'GET /orders'
const REMOVE = 'DELETE /orders/{orderId}'
const list = BEFORE.operations[LIST] ?? { request: {}, responses: {} }

describe('breakingChanges', () => {
  it('reports nothing for the same API or for additions a consumer can ignore', () => {
    expect(changes(BEFORE)).toStrictEqual([])
    const extended: ApiSnapshot = {
      operations: {
        ...BEFORE.operations,
        'POST /orders': { request: {}, responses: {} },
        [LIST]: {
          request: { ...list.request, 'query:page': { optional: true, type: 'int32' } },
          responses: {
            ...list.responses,
            '200': { ...list.responses['200'], note: { optional: true, type: 'string' } },
            '429': {},
          },
        },
      },
    }
    expect(changes(extended)).toStrictEqual([])
  })

  it('reports what a consumer of the old version can no longer do', () => {
    const broken: ApiSnapshot = {
      operations: {
        [LIST]: {
          request: {
            'query:status': { optional: false, type: 'string' },
            'query:limit': { optional: true, type: 'int64' },
            'query:tenant': { optional: false, type: 'string' },
          },
          responses: {
            '200': {
              id: { optional: true, type: 'string' },
              state: { optional: false, type: 'enum(open|paid|void)' },
            },
          },
        },
      },
    }
    expect(changes(broken)).toStrictEqual([
      `${LIST}: request 'query:status' became required`,
      `${LIST}: request 'query:limit' changed type from int32 to int64`,
      `${LIST}: request 'query:tenant' was added as required`,
      `${LIST}: response 200 'id' is no longer always returned`,
      `${LIST}: response 200 'total' was removed`,
      `${LIST}: response 200 'state' changed type from enum(open|paid) to enum(open|paid|void)`,
      `${LIST}: response 404 was removed`,
      `${REMOVE}: the operation was removed`,
    ])
  })
})

async function snapshot(code: string) {
  const { program } = await Tester.compile(`${SERVICE}${code}`)
  return snapshotOf(analyze(program).httpOperations)
}

describe('snapshotOf', () => {
  it('records parameters, body properties and response properties, through lists and nesting', async () => {
    const api = await snapshot(`
      enum State { open, paid }
      model Line { sku: string; quantity?: int32; }
      model Order { id: string; state: State; lines: Line[]; }
      @route("/orders") @post op createOrder(@query dryRun?: boolean, @body order: Order): Order[];`)
    expect(api).toStrictEqual({
      operations: {
        'POST /orders': {
          request: {
            'query:dryRun': { optional: true, type: 'boolean' },
            id: { optional: false, type: 'string' },
            state: { optional: false, type: 'enum(open|paid)' },
            lines: { optional: false, type: 'array' },
            'lines[]': { optional: false, type: 'object' },
            'lines[].sku': { optional: false, type: 'string' },
            'lines[].quantity': { optional: true, type: 'int32' },
          },
          responses: {
            '200': {
              '[]': { optional: false, type: 'object' },
              '[].id': { optional: false, type: 'string' },
              '[].state': { optional: false, type: 'enum(open|paid)' },
              '[].lines': { optional: false, type: 'array' },
              '[].lines[]': { optional: false, type: 'object' },
              '[].lines[].sku': { optional: false, type: 'string' },
              '[].lines[].quantity': { optional: true, type: 'int32' },
            },
          },
        },
      },
    })
  })

  it('a property removed from the items of a returned list is a breaking change', async () => {
    const before = await snapshot(
      `model Order { id: string; total: decimal; } @route("/orders") @get op listOrders(): Order[];`,
    )
    const after = await snapshot(
      `model Order { id: string; } @route("/orders") @get op listOrders(): Order[];`,
    )
    expect(breakingChanges(before, after)).toStrictEqual([
      { operation: 'GET /orders', message: "response 200 '[].total' was removed" },
    ])
  })
})

describe('parameter-providable', () => {
  it('accepts an identifier another operation returns, or one listed in known', async () => {
    const code = `${SERVICE}
      model Order { id: string }
      @route("/tenants/{tenantId}/orders") @get op listOrders(@path tenantId: string): Order[];
      @route("/tenants/{tenantId}/orders/{orderId}") @get op readOrder(@path tenantId: string, @path orderId: string): Order;`
    const t = await ruleTester(parameters.parameterProvidable)
    await t.expect(code).toEmitDiagnostics(msg(/cannot obtain 'tenantId'/))
    const known = await ruleTester(parameters.parameterProvidable, { known: ['tenantId'] })
    await known.expect(code).toBeValid()
  })
})

describe('response-documented', () => {
  it('accepts a doc comment on the response model, @returnsDoc and @errorsDoc', async () => {
    const t = await ruleTester(responses.responseDocumented)
    await t
      .expect(
        `${SERVICE}
         /** The order does not exist. */
         @error model Missing { @statusCode statusCode: 404; message: string; }
         @returnsDoc("The order.") @route("/a") @get op a(): string | Missing;`,
      )
      .toBeValid()
    await t
      .expect(`${SERVICE} @route("/a") @get op a(): string | NotFoundResponse;`)
      .toEmitDiagnostics(msg(/response 200 has no description/, /response 404 has no description/))
  })
})
