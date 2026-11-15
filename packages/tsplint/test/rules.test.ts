import { describe, it } from 'vite-plus/test'

import * as models from '../src/rules/models.js'
import * as operations from '../src/rules/operations.js'
import * as parameters from '../src/rules/parameters.js'
import * as responses from '../src/rules/responses.js'
import * as security from '../src/rules/security.js'
import type { AnyRuleSpec } from '../src/types/index.js'
import { ruleTester, SERVICE } from './helper.js'

const msg = (...messages: RegExp[]) => messages.map((message) => ({ message }))

const GOOD = `
  ${SERVICE}
  /** A customer. */
  model Customer { id: string; name: string; createdAt: utcDateTime; }
  /** Standard error. */
  @error model ApiError { code: string; message: string; }
  /** Read one customer. */
  @tag("customers") @route("/customers/{customerId}") @get
  op getCustomer(@path customerId: string): Customer | ApiError;
`

describe('security', () => {
  it('security-scheme-used', async () => {
    const t = await ruleTester(security.securitySchemeUsed)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(`${GOOD} model LegacyKey is ApiKeyAuth<ApiKeyLocation.header, "X-Key">;`)
      .toEmitDiagnostics(msg(/'LegacyKey' is never used/))
    await t
      .expect(`
        model Key is ApiKeyAuth<ApiKeyLocation.header, "X-Key">;
        @service @useAuth(Key) namespace Shop { @route("/a") @get op a(): void; }`)
      .toBeValid()
  })

  it('security-scheme-valid', async () => {
    const t = await ruleTester(security.securitySchemeValid)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(`
        model Flow { type: OAuth2FlowType.implicit; authorizationUrl: "http://auth.example.com"; scopes: ["read"]; }
        @service @useAuth(OAuth2Auth<[Flow]> | ApiKeyAuth<ApiKeyLocation.query, "key">) namespace Shop {
          @route("/a") @get op a(): void;
        }`)
      .toEmitDiagnostics(msg(/'implicit'/, /authorizationUrl must use https/, /query string/))
  })

  it('security-scope-valid', async () => {
    const t = await ruleTester(security.securityScopeValid, { pattern: '^[a-z]+:[a-z]+$' })
    await t
      .expect(`
        model Flow { type: OAuth2FlowType.clientCredentials; tokenUrl: "https://auth.example.com/token"; scopes: ["Read"]; }
        @service @useAuth(OAuth2Auth<[Flow]>) namespace Shop {
          @route("/a") @get op a(): void;
        }`)
      .toEmitDiagnostics(msg(/'Read'.*does not match/))
  })

  it('operation-secured', async () => {
    const t = await ruleTester(security.operationSecured)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(`@service namespace Shop; @route("/a") @get op a(): void;`)
      .toEmitDiagnostics(msg(/GET \/a is not covered/))
    await t
      .expect(`@service namespace Shop; @useAuth(NoAuth) @route("/a") @get op a(): void;`)
      .toBeValid()
    const strict = await ruleTester(security.operationSecured, { allowNoAuth: false })
    await strict
      .expect(`@service namespace Shop; @useAuth(NoAuth) @route("/a") @get op a(): void;`)
      .toEmitDiagnostics(msg(/without authentication/))
    // No security anywhere: one finding on the service, not one per operation.
    await t
      .expect(
        `@service namespace Shop; @route("/a") @get op a(): void; @route("/b") @get op b(): void;`,
      )
      .toEmitDiagnostics(msg(/None of the 2 operations of 'Shop' is covered/))
  })
})

describe('operations', () => {
  it('operation-tagged', async () => {
    const t = await ruleTester(operations.operationTagged)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(`${SERVICE} @route("/a") @get op a(): void;`)
      .toEmitDiagnostics(msg(/not categorized/))
    await t.expect(`${SERVICE} @tag("x") interface A { @route("/a") @get a(): void; }`).toBeValid()
  })

  it('operation-documented', async () => {
    const t = await ruleTester(operations.operationDocumented)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(`${SERVICE} @route("/a") @get op a(): void;`)
      .toEmitDiagnostics(msg(/has no description/))
  })

  it('operation-path', async () => {
    const t = await ruleTester(operations.operationPath)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(
        `${SERVICE} @route("/send_email/{user_id}/") @post op send(@path user_id: string): void;`,
      )
      .toEmitDiagnostics(
        msg(
          /must not end with a slash/,
          /'send_email' must be kebab-case/,
          /'user_id' must be camelCase/,
        ),
      )
    const snake = await ruleTester(operations.operationPath, {
      segmentCase: 'snake_case',
      forbiddenSegments: ['create'],
    })
    await snake
      .expect(`${SERVICE} @route("/send_email/create") @post op send(): void;`)
      .toEmitDiagnostics(msg(/'create' is not allowed/))
  })

  it('operation-method', async () => {
    const t = await ruleTester(operations.operationMethod)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(
        `${SERVICE} @route("/a") @post op getThing(): void; @route("/b") @get op deleteThing(): void;`,
      )
      .toEmitDiagnostics(
        msg(/'getThing' should use GET or HEAD, not POST/, /'deleteThing' should use DELETE/),
      )
    const noPatch = await ruleTester(operations.operationMethod, { allowed: ['get', 'post'] })
    await noPatch
      .expect(`${SERVICE} @route("/a") @patch op change(): void;`)
      .toEmitDiagnostics(msg(/PATCH is not allowed/))
  })

  it('operation-responses', async () => {
    const t = await ruleTester(operations.operationResponses)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(`${SERVICE} @route("/a") @get op a(): string;`)
      .toEmitDiagnostics(msg(/no error/))
    await t
      .expect(`${SERVICE} @error model E { code: string } @route("/a") @get op a(): E;`)
      .toEmitDiagnostics(msg(/no success/))
  })
})

describe('parameters', () => {
  it('parameter-naming', async () => {
    const t = await ruleTester(parameters.parameterNaming)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(
        `${SERVICE} @route("/a") @get op a(@query page_size: int32, @header("x_trace") trace: string, @query errMsg: string): void;`,
      )
      .toEmitDiagnostics(
        msg(
          /query parameter 'page_size' must be camelCase/,
          /header parameter 'x_trace' must be http-header/,
          /abbreviation 'err'/,
        ),
      )
    const snake = await ruleTester(parameters.parameterNaming, { query: 'snake_case' })
    await snake
      .expect(`${SERVICE} @route("/a") @get op a(@query page_size: int32): void;`)
      .toBeValid()
  })

  it('parameter-required', async () => {
    const t = await ruleTester(parameters.parameterRequired)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(
        `${SERVICE} model Mail { email?: string; message?: string; } @route("/mails") @post op send(@body mail: Mail): void;`,
      )
      .toEmitDiagnostics(msg(/every property of the request body is optional/))
    await t
      .expect(
        `${SERVICE} model Mail { email?: string; message?: string; } @route("/mails") @patch op change(@body mail: Mail): void;`,
      )
      .toBeValid()
  })

  it('parameter-type', async () => {
    const t = await ruleTester(parameters.parameterType)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(
        `${SERVICE} model Filter { a: string } @route("/a") @get op a(@query filter: Filter, @query createdAt: int64, @query isActive: string): void;`,
      )
      .toEmitDiagnostics(
        msg(
          /'filter' must not be an object/,
          /'createdAt' should be of type utcDateTime/,
          /'isActive' should be of type boolean/,
        ),
      )
    await t
      .expect(
        `${SERVICE} @route("/a") @get op a(@query ids: string[], @query since?: utcDateTime): void;`,
      )
      .toBeValid()
  })

  it('parameter-documented', async () => {
    const t = await ruleTester(parameters.parameterDocumented)
    await t
      .expect(
        `${SERVICE} @route("/a") @get op a(@query page: int32, /** Size. */ @query size: int32): void;`,
      )
      .toEmitDiagnostics(msg(/'page' has no description/))
  })

  it('parameter-location', async () => {
    const t = await ruleTester(parameters.parameterLocation)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(
        `${SERVICE} @route("/a") @delete op remove(@body reason: string, @query accessToken: string): void;`,
      )
      .toEmitDiagnostics(
        msg(/DELETE requests must not have a body/, /'accessToken' looks sensitive/),
      )
  })
})

describe('responses', () => {
  it('response-status-code', async () => {
    const t = await ruleTester(responses.responseStatusCode)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(`${SERVICE}
        model Teapot { @statusCode _: 418; }
        model Created { @statusCode _: 201; }
        @route("/a") @get op a(): Teapot | Created;`)
      .toEmitDiagnostics(msg(/418 is not allowed/, /GET should not return 201/))
  })

  it('response-error-body', async () => {
    const t = await ruleTester(responses.responseErrorBody)
    await t.expect(GOOD).toBeValid()
    const code = `${SERVICE}
        model Plain { @statusCode _: 400; message: string; }
        @route("/a") @get op a(): string | Plain | NotFoundResponse;`
    // A body-less error (TypeSpec's own NotFoundResponse) is accepted unless `requireBody` is on.
    await t.expect(code).toEmitDiagnostics(msg(/400 must return a model decorated with @error/))
    const strict = await ruleTester(responses.responseErrorBody, { requireBody: true })
    await strict
      .expect(code)
      .toEmitDiagnostics(msg(/400 must return a model decorated with @error/, /404 has no body/))
    const named = await ruleTester(responses.responseErrorBody, { models: ['Problem'] })
    await named
      .expect(
        `${SERVICE} @error model Oops { message: string } @route("/a") @get op a(): string | Oops;`,
      )
      .toEmitDiagnostics(msg(/must return Problem/))
  })

  it('response-header-naming', async () => {
    const t = await ruleTester(responses.responseHeaderNaming)
    await t
      .expect(
        `${SERVICE} model R { @header("x_rate") rate: string; @header requestId: string; } @route("/a") @get op a(): R;`,
      )
      .toEmitDiagnostics(msg(/'x_rate' must be http-header/))
  })
})

describe('models', () => {
  it('model-used', async () => {
    const t = await ruleTester(models.modelUsed)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(`${GOOD} model Orphan { id: string } model Page<T> { items: T[] } model Base { id: string } model Cat extends Base {}
        @route("/cats") @get op listCats(): Page<Cat>;`)
      .toEmitDiagnostics(msg(/'Orphan' is not used/))
    await t.expect(`model OnlyTypes { id: string }`).toBeValid()
  })

  it('model-naming', async () => {
    const t = await ruleTester(models.modelNaming)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(`model aDTO { id: string } model account_info { id: string }`)
      .toEmitDiagnostics(
        msg(
          /'aDTO' must be PascalCase/,
          /'aDTO' must not end with 'DTO'/,
          /'account_info' must be PascalCase/,
        ),
      )
  })

  it('model-structure', async () => {
    const t = await ruleTester(models.modelStructure, { maxDepth: 2, maxProperties: 2 })
    await t
      .expect(`
        model Leaf { a: string }
        model Mid { leaf: Leaf[] }
        model Top { mid: Mid | null }
        model Wide { a: string; b: string; c: string }
        model Tree { children: Tree[] }`)
      .toEmitDiagnostics(msg(/'Top' is nested 3 levels/, /'Wide' has 3 properties/))
  })

  it('model-documented', async () => {
    const t = await ruleTester(models.modelDocumented)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(`model Account { id: string }`)
      .toEmitDiagnostics(msg(/'Account' has no description/))
  })

  it('property-naming', async () => {
    const t = await ruleTester(models.propertyNaming)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(
        `model Mail { err_msg: string; msg: string; nested: { Bad: string }; @header("X-Id") request_id: string; }`,
      )
      .toEmitDiagnostics(
        msg(
          /'err_msg' must be camelCase/,
          /'err_msg' uses the abbreviation 'err'/,
          /'msg' uses the abbreviation 'msg'/,
          /'Bad' must be camelCase/,
        ),
      )
  })

  it('property-required', async () => {
    const t = await ruleTester(models.propertyRequired)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(
        `model Mail { email?: string; message?: string } model MailPatch { email?: string; message?: string } model UpdateMailRequest { email?: string; message?: string }`,
      )
      .toEmitDiagnostics(msg(/Every property of model 'Mail' is optional/))
  })

  it('property-type', async () => {
    const t = await ruleTester(models.propertyType)
    await t.expect(GOOD).toBeValid()
    await t
      .expect(`scalar Stamp extends utcDateTime;
        model Event { createdAt: string; updatedAt: Stamp; endDate?: plainDate | null; isOpen: int32; itemCount: string; homepageUrl: string; }`)
      .toEmitDiagnostics(
        msg(
          /'createdAt' should be of type utcDateTime/,
          /'isOpen' should be of type boolean/,
          /'itemCount' should be of type integer/,
          /'homepageUrl' should be of type url/,
        ),
      )
    const custom = await ruleTester(models.propertyType, {
      conventions: [{ pattern: '^message$', types: ['string'] }],
    })
    await custom
      .expect(`model Mail { message: int32; createdAt: string; }`)
      .toEmitDiagnostics(msg(/'message' should be of type string/))
  })

  it('property-documented', async () => {
    const t = await ruleTester(models.propertyDocumented)
    await t
      .expect(`model Account { id: string; /** Name. */ name: string; }`)
      .toEmitDiagnostics(msg(/'id' has no description/))
  })

  it('a rule set to false in the config never runs', async () => {
    const t = await ruleTester(models.modelDocumented, false)
    await t.expect(`model Account { id: string }`).toBeValid()
  })
})

describe('security definitions are not API data', () => {
  it('OAuth2 flow models are skipped by model and property rules', async () => {
    const code = `
      @service @useAuth(OAuth2Auth<[Flow]>) namespace Shop;
      model Flow { type: OAuth2FlowType.clientCredentials; tokenUrl: "https://auth.example.com/token"; scopes: ["orders:read"]; }
      @route("/a") @get op a(): void;`
    const specs: AnyRuleSpec[] = [
      models.modelUsed,
      models.modelDocumented,
      models.propertyType,
      models.propertyDocumented,
    ]
    await Promise.all(specs.map(async (spec) => (await ruleTester(spec)).expect(code).toBeValid()))
  })
})
