import type { RuleDoc } from '../types/index.js'
import type { RuleOptionsMap } from './index.js'

/**
 * Purpose and NG / OK example of every rule. `test/docs.test.ts` compiles each
 * example and checks that NG is reported and OK is not, so they cannot go stale.
 */
export const ruleDocs: Record<keyof RuleOptionsMap, RuleDoc> = {
  'breaking-change': {
    purpose:
      'A change that breaks consumers must be a decision, not an accident. The rule compares the API with a baseline recorded when a version was published (`TYPESPECLINT_UPDATE_BASELINE=1 tsp compile .` writes `typespeclint.baseline.json`) and reports what a consumer of that version can no longer do: a removed operation, parameter or response property, a changed type, a parameter that became required. Additions a consumer can ignore are fine. Until a baseline is recorded, the rule reports that one is missing.',
    standalone: true,
    before: `
@service
@useAuth(BearerAuth)
namespace Shop;

model Order { id: string; total: decimal; note?: string; }

@route("/orders") @get op listOrders(@query status?: string): Order[];`,
    ng: `
@service
@useAuth(BearerAuth)
namespace Shop;

// 'total' is gone, and 'status' is now required.
model Order { id: string; note?: string; }

@route("/orders") @get op listOrders(@query status: string): Order[];`,
    ok: `
@service
@useAuth(BearerAuth)
namespace Shop;

// A new property and a new optional parameter: existing consumers keep working.
model Order { id: string; total: decimal; note?: string; currency?: string; }

@route("/orders") @get op listOrders(@query status?: string, @query pageSize?: int32): Order[];`,
  },
  'security-scheme-used': {
    purpose:
      'A security scheme that is declared but never applied is either dead code or a forgotten `@useAuth`. Apply it or delete it.',
    standalone: true,
    ng: `
model LegacyKey is ApiKeyAuth<ApiKeyLocation.header, "X-Legacy-Key">;

@service
@useAuth(BearerAuth)
namespace Shop {
  @route("/orders") @get op listOrders(): string[];
}`,
    ok: `
model PartnerKey is ApiKeyAuth<ApiKeyLocation.header, "X-Partner-Key">;

@service
@useAuth(BearerAuth | PartnerKey)
namespace Shop {
  @route("/orders") @get op listOrders(): string[];
}`,
  },
  'security-scheme-valid': {
    purpose:
      'Security schemes must carry correct machine-readable information: absolute https URLs, no API key in the query string, and none of the flows the guidelines forbid (`implicit` and `password` by default).',
    standalone: true,
    ng: `
model Implicit {
  type: OAuth2FlowType.implicit;
  authorizationUrl: "http://auth.example.com/authorize";
  scopes: ["orders:read"];
}

@service
@useAuth(OAuth2Auth<[Implicit]>)
namespace Shop {
  @route("/orders") @get op listOrders(): string[];
}`,
    ok: `
model AuthorizationCode {
  type: OAuth2FlowType.authorizationCode;
  authorizationUrl: "https://auth.example.com/authorize";
  tokenUrl: "https://auth.example.com/token";
  scopes: ["orders:read"];
}

@service
@useAuth(OAuth2Auth<[AuthorizationCode]>)
namespace Shop {
  @route("/orders") @get op listOrders(): string[];
}`,
  },
  'security-scope-valid': {
    purpose:
      'Scopes are part of the contract consumers must understand. Name them with one pattern (lowercase words joined by `:` or `.` by default).',
    standalone: true,
    ng: `
model ClientCredentials {
  type: OAuth2FlowType.clientCredentials;
  tokenUrl: "https://auth.example.com/token";
  scopes: ["ReadOrders"];
}

@service
@useAuth(OAuth2Auth<[ClientCredentials]>)
namespace Shop {
  @route("/orders") @get op listOrders(): string[];
}`,
    ok: `
model ClientCredentials {
  type: OAuth2FlowType.clientCredentials;
  tokenUrl: "https://auth.example.com/token";
  scopes: ["orders:read"];
}

@service
@useAuth(OAuth2Auth<[ClientCredentials]>)
namespace Shop {
  @route("/orders") @get op listOrders(): string[];
}`,
  },
  'operation-documented': {
    purpose:
      'The description is where the use case of an operation is explained. Without it, reviewers and consumers have to guess what the goal is for.',
    ng: `
@route("/orders") @get op listOrders(): string[];`,
    ok: `
/** List the orders of the signed-in customer, newest first. */
@route("/orders") @get op listOrders(): string[];`,
  },
  'model-used': {
    purpose:
      'A model no operation refers to is either left over or shows that an operation was forgotten. Use it or delete it.',
    ng: `
model Order { id: string; }
model Invoice { id: string; }

@route("/orders") @get op listOrders(): Order[];`,
    ok: `
model Order { id: string; }

@route("/orders") @get op listOrders(): Order[];`,
  },
  'model-naming': {
    purpose:
      "Model names should say what the data is, in one convention. Technical affixes such as `DTO` leak the provider's implementation.",
    ng: `
model account_dto { id: string; }
model AccountDTO { id: string; }`,
    ok: `
model Account { id: string; }`,
  },
  'model-structure': {
    purpose:
      'Deeply nested or very wide models are hard to understand and to evolve. Keep depth and property count within limits. The defaults are generous; set `maxDepth` and `maxProperties` to what your guidelines say.',
    options: { maxDepth: 2 },
    ng: `
model Order { customer: Customer; }
model Customer { address: Address; }
model Address { city: string; }`,
    ok: `
model Order { customerId: string; shippingAddress: Address; }
model Address { city: string; }`,
  },
  'model-documented': {
    purpose:
      'A model without a description forces readers to infer its meaning from its name alone.',
    ng: `
model Order { id: string; }`,
    ok: `
/** A purchase made by a customer. */
model Order { id: string; }`,
  },
  'example-required': {
    purpose:
      'Examples make the generated documentation show a real payload instead of a bare schema. Opt-in; set `operations: true` to also require `@opExample`.',
    ng: `
model Order { id: string; total: decimal; }`,
    ok: `
@example(#{ id: "ord_123", total: 42.5 })
model Order { id: string; total: decimal; }`,
  },
  'property-naming': {
    purpose:
      'Property names follow one convention and avoid cryptic abbreviations: `message`, not `msg`; `errorMessage`, not `err_msg`.',
    ng: `
model Mail { err_msg: string; msg: string; }`,
    ok: `
model Mail { errorMessage: string; message: string; }`,
  },
  'property-required': {
    purpose:
      'A model whose properties are all optional accepts `{}`. That is rarely intended (models named `*Patch`, `*Filter`, ... are ignored by default).',
    ng: `
model Mail { email?: string; message?: string; }`,
    ok: `
model Mail { email: string; message: string; replyTo?: string; }`,
  },
  'property-type': {
    purpose:
      'The type must fit what the name promises: dates are date types (ISO 8601 / RFC 3339 on the wire), `is*` flags are booleans, `*Url` is a `url`, `*Count` is an integer.',
    ng: `
model Order { createdAt: string; isPaid: int32; itemCount: string; }`,
    ok: `
model Order { createdAt: utcDateTime; isPaid: boolean; itemCount: int32; }`,
  },
  'property-documented': {
    purpose:
      'Every property is described, so consumers do not have to guess units, formats or meaning.',
    ng: `
model Order { total: decimal; }`,
    ok: `
model Order {
  /** Amount charged, taxes included. */
  total: decimal;
}`,
  },
  'standard-format': {
    purpose:
      'When a standard exists for a piece of data (ISO 4217 currencies, ISO 3166-1 countries, BCP 47 languages, E.164 phone numbers, RFC 5322 e-mail, RFC 9562 UUIDs), use it instead of a free-form string. Opt-in; each standard can be switched off and `custom` adds your own.',
    ng: `
model Price { amount: decimal; currency: string; }`,
    ok: `
/** ISO 4217 currency code. */
@pattern("^[A-Z]{3}$")
scalar CurrencyCode extends string;

model Price { amount: decimal; currency: CurrencyCode; }`,
  },
  'operation-tagged': {
    purpose: 'Categorized operations are easier to find in the documentation.',
    ng: `
@route("/orders") @get op listOrders(): string[];`,
    ok: `
@tag("orders")
@route("/orders") @get op listOrders(): string[];`,
  },
  'operation-path': {
    purpose:
      'Paths follow one format: kebab-case segments, camelCase path parameters and no trailing slash.',
    ng: `
@route("/order_items/{item_id}/") @get op readOrderItem(@path item_id: string): string;`,
    ok: `
@route("/order-items/{itemId}") @get op readOrderItem(@path itemId: string): string;`,
  },
  'operation-method': {
    purpose:
      'The HTTP method must fit what the operation does. By default it is inferred from the operation name (`get*` / `list*` are GET, `create*` is POST, `delete*` is DELETE, ...).',
    ng: `
@route("/orders/{orderId}") @post op deleteOrder(@path orderId: string): void;`,
    ok: `
@route("/orders/{orderId}") @delete op deleteOrder(@path orderId: string): void;`,
  },
  'operation-responses': {
    purpose:
      'An operation declares every response it can return: at least one success and at least one error.',
    ng: `
@route("/orders") @get op listOrders(): string[];`,
    ok: `
@error model ApiError { code: string; message: string; }

@route("/orders") @get op listOrders(): string[] | ApiError;`,
  },
  'operation-secured': {
    purpose:
      'Every operation is covered by a security scheme. A deliberately public operation says so with `@useAuth(NoAuth)`.',
    standalone: true,
    ng: `
@service
namespace Shop;

@route("/orders") @get op listOrders(): string[];`,
    ok: `
@service
@useAuth(BearerAuth)
namespace Shop;

@route("/orders") @get op listOrders(): string[];

@useAuth(NoAuth)
@route("/health") @get op readHealth(): string;`,
  },
  'parameter-naming': {
    purpose:
      'Parameter names follow the convention of their location (camelCase for query and path, hyphenated header names) and avoid cryptic abbreviations.',
    ng: `
@route("/orders") @get op listOrders(@query page_size?: int32, @header("x_trace_id") traceId?: string): string[];`,
    ok: `
@route("/orders") @get op listOrders(@query pageSize?: int32, @header("X-Trace-Id") traceId?: string): string[];`,
  },
  'parameter-required': {
    purpose:
      'A create / replace request whose body properties are all optional accepts `{}`, which is probably a mistake. Path parameters are always required.',
    ng: `
@route("/mails") @post op sendMail(@body mail: { email?: string; message?: string }): void;`,
    ok: `
@route("/mails") @post op sendMail(@body mail: { email: string; message: string }): void;`,
  },
  'parameter-type': {
    purpose:
      'Query, path and header parameters are simple values, not objects, and their type fits what the name promises (same conventions as `property-type`).',
    ng: `
model OrderFilter { status: string; }

@route("/orders") @get op listOrders(@query filter?: OrderFilter, @query createdAt?: int64): string[];`,
    ok: `
@route("/orders") @get op listOrders(@query status?: string, @query createdAt?: utcDateTime): string[];`,
  },
  'parameter-documented': {
    purpose: 'Every parameter is described.',
    ng: `
@route("/orders") @get op listOrders(@query pageSize?: int32): string[];`,
    ok: `
@route("/orders") @get op listOrders(
  /** Maximum number of orders to return. */
  @query pageSize?: int32,
): string[];`,
  },
  'parameter-location': {
    purpose:
      'Parameters travel in a location that suits the method and the data: no body on GET / HEAD / DELETE, and nothing sensitive in the URL, where it ends up in logs and browser history.',
    ng: `
@route("/sessions") @delete op deleteSession(@query accessToken: string, @body reason: string): void;`,
    ok: `
@route("/sessions") @delete op deleteSession(@header authorization: string, @query reason?: string): void;`,
  },
  'parameter-providable': {
    purpose:
      'A consumer can only call a goal if it can supply its parameters: it knows the value, or another goal returns it. The rule checks identifiers (`*Id` by default): some operation must return the value without requiring it. Names consumers know anyway go in `known`. The rule reasons from names: `orderId` is providable when an operation returns an `Order` with an `id`, or a property named `orderId`.',
    ng: `
model Order { id: string; total: decimal; }

// Nothing returns an order id: where would a consumer get one?
@route("/orders/{orderId}") @get op readOrder(@path orderId: string): Order;`,
    ok: `
model Order { id: string; total: decimal; }

@route("/orders") @get op listOrders(): Order[];
@route("/orders/{orderId}") @get op readOrder(@path orderId: string): Order;`,
  },
  'response-status-code': {
    purpose:
      'Only the status codes the guidelines allow are used, and the success code fits the method (for example GET does not return 201).',
    ng: `
model Teapot { @statusCode statusCode: 418; }
model Created { @statusCode statusCode: 201; @body body: string; }

@route("/orders/{orderId}") @get op readOrder(@path orderId: string): Created | Teapot;`,
    ok: `
@route("/orders/{orderId}") @get op readOrder(@path orderId: string): string | NotFoundResponse;`,
  },
  'response-error-body': {
    purpose:
      'Every error response returns the standard error model: a model decorated with `@error`, or one of the models named in `models`. Consumers then handle all errors one way.',
    ng: `
model Failure { @statusCode statusCode: 400; message: string; }

@route("/orders") @get op listOrders(): string[] | Failure | NotFoundResponse;`,
    ok: `
@error model ApiError { code: string; message: string; }

@route("/orders") @get op listOrders(): string[] | ApiError;`,
  },
  'response-problem-details': {
    purpose:
      'Error bodies follow RFC 9457 problem details (`type`, `title`, `status`, `detail`, `instance`) and are sent as `application/problem+json`. Opt-in; `requiredMembers`, `requireContentType` and `typePattern` adapt it to your guidelines.',
    ng: `
@error model NotFound { @statusCode statusCode: 404; message: string; }

@route("/orders/{orderId}") @get op readOrder(@path orderId: string): string | NotFound;`,
    ok: `
model NotFoundProblem {
  type: "/problems/not-found";
  title: string;
  status: 404;
  detail: string;
  instance: string;
}

@error model NotFoundProblemResponse {
  @statusCode statusCode: 404;
  @header contentType: "application/problem+json";
  @body body: NotFoundProblem;
}

@route("/orders/{orderId}") @get op readOrder(@path orderId: string): string | NotFoundProblemResponse;`,
  },
  'response-header-naming': {
    purpose: 'Response header names follow one convention (hyphen-separated words by default).',
    ng: `
model OrderList { @header("x_total_count") totalCount: int32; @body body: string[]; }

@route("/orders") @get op listOrders(): OrderList;`,
    ok: `
model OrderList { @header("X-Total-Count") totalCount: int32; @body body: string[]; }

@route("/orders") @get op listOrders(): OrderList;`,
  },
  'response-documented': {
    purpose:
      'A response says what happened and, for errors, what to do about it. Without a description of its own it only carries the generic text of its status code.',
    ng: `
@route("/orders") @get op listOrders(): string[];`,
    ok: `
@returnsDoc("The identifiers of the orders of the signed-in customer.")
@route("/orders") @get op listOrders(): string[];`,
  },
}
