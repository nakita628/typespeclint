import { expect, it } from 'vite-plus/test'

import { runRule } from '../src/helper/rule.js'
import { ruleSpecs } from '../src/rules/index.js'
import type { AnyRuleSpec } from '../src/types/index.js'
import { Tester } from './helper.js'

// The `recommended` rules that judge a design must not report one that is written correctly. Each declaration
// below was once reported by a default that was too eager; they stay here so it cannot return.
const REGISTRY = `
  @service
  @useAuth(BearerAuth)
  namespace Registry;

  /** A company or another body with legal standing. */
  model LegalEntity {
    id: string;
    name: string;
  }

  /** How the service is doing. */
  model Metrics {
    /** Median response time, in milliseconds. */
    responseTime: int32;

    @format("uri")
    homepageUrl: string;

    /** Version of the TypeScript client the caller uses. */
    tsVersion: string;

    hasChildren: string[];
    isHealthy: boolean;
    measuredAt: utcDateTime;
  }

  /** The upload is larger than the limit. */
  @error
  model TooLarge {
    @statusCode statusCode: 413;
    message: string;
  }

  /** A range of the requested content. */
  model PartialContent {
    @statusCode statusCode: 206;
    @body body: bytes;
  }

  /** List the legal entities, a page at a time. */
  @route("/legal-entities")
  @get
  op listLegalEntities(@query pageToken?: string): LegalEntity[] | NotFoundResponse | TooLarge;

  /** Read the metrics, or a range of the raw samples. */
  @route("/metrics")
  @get
  op readMetrics(): Metrics | PartialContent | NotFoundResponse | TooLarge;
`

// A broader API in common styles: pagination, partial update, upload and download, a
// long-running job, conditional requests, a search sent as POST, a public health check.
const STORAGE = `
  @service(#{ title: "Storage" })
  @server("https://api.example.com/v1", "Production")
  @useAuth(BearerAuth | ApiKeyAuth<ApiKeyLocation.header, "X-API-Key">)
  namespace Storage;

  /** Lifecycle state of a file. */
  enum FileState { uploading, ready, deleted }

  /** Sort order. */
  union SortOrder { "asc", "desc" }

  /** A stored file. */
  model File {
    @key id: string;
    name: string;
    sizeBytes: int64;
    state: FileState;
    contentType: string;
    checksumSha256: string;
    ownerId: string;
    isPublic: boolean;
    tags: string[];
    metadata: Record<string>;
    createdAt: utcDateTime;
    updatedAt: utcDateTime;
    expirationDate?: plainDate;
    downloadUrl: url;
    getCount: int32;
    retentionTime: duration;
  }

  /** A page of files. */
  model FilePage {
    items: File[];
    nextPageToken?: string;
    totalCount: int32;
  }

  /** Fields of a file that can be changed. */
  model FilePatch {
    name?: string;
    isPublic?: boolean;
    tags?: string[];
  }

  /** What is needed to create a file. */
  model FileCreate {
    name: string;
    contentType: string;
    isPublic?: boolean;
  }

  /** A long-running job. */
  model Job {
    id: string;
    status: "queued" | "running" | "done" | "failed";
    startTime?: utcDateTime;
    endTime?: utcDateTime;
    error?: ApiError;
  }

  /** Error details. */
  @error
  model ApiError {
    code: string;
    message: string;
    target?: string;
    details?: ApiError[];
  }

  /** Created. */
  model FileCreated {
    @statusCode statusCode: 201;
    @header location: string;
    @body body: File;
  }

  /** Accepted. */
  model JobAccepted {
    @statusCode statusCode: 202;
    @header("Operation-Location") operationLocation: string;
    @header("Retry-After") retryAfter?: int32;
    @body body: Job;
  }

  /** The bytes of a file. */
  model FileContent {
    @header contentType: "application/octet-stream";
    @header("ETag") etag: string;
    @body body: bytes;
  }

  @tag("files")
  @route("/files")
  interface Files {
    /** List the files of the caller. */
    @get list(
      @query pageSize?: int32,
      @query pageToken?: string,
      @query orderBy?: string,
      @query sortOrder?: SortOrder,
      @query createdAfter?: utcDateTime,
      @query tags?: string[],
      @query isPublic?: boolean,
    ): FilePage | ApiError;

    /** Create the record of a file before uploading its content. */
    @post create(@body body: FileCreate, @header("Idempotency-Key") idempotencyKey?: string): FileCreated | ApiError;

    /** Read one file. */
    @get read(@path fileId: string, @header ifNoneMatch?: string): File | NotModifiedResponse | NotFoundResponse | ApiError;

    /** Change some fields of a file. */
    @patch update(@path fileId: string, @body body: FilePatch): File | NotFoundResponse | ApiError;

    /** Replace the content of a file. */
    @put @route("/{fileId}/content") upload(@path fileId: string, @header contentType: "application/octet-stream", @body body: bytes): NoContentResponse | ApiError;

    /** Download the content of a file. */
    @get @route("/{fileId}/content") download(@path fileId: string): FileContent | NotFoundResponse | ApiError;

    /** Check whether a file exists. */
    @head exists(@path fileId: string): NoContentResponse | NotFoundResponse;

    /** Delete a file. */
    @delete delete(@path fileId: string): NoContentResponse | NotFoundResponse | ApiError;

    /** Start copying a file; poll the returned job. */
    @post @route("/{fileId}/copies") copy(@path fileId: string, @body body: { targetName: string }): JobAccepted | ApiError;

    /** Search files with a query too long for a URL. */
    @post @route("/searches") search(@body body: { query: string; limit?: int32 }): FilePage | ApiError;
  }

  @tag("jobs")
  @route("/jobs")
  interface Jobs {
    /** Read the state of a job. */
    @get getJob(@path jobId: string): Job | NotFoundResponse | ApiError;

    /** Cancel a job. */
    @post @route("/{jobId}/cancellations") cancelJob(@path jobId: string): Job | ConflictResponse | ApiError;
  }

  /** Whether the service is up. */
  @tag("health")
  @useAuth(NoAuth)
  @route("/health")
  @get op checkHealth(): { status: "ok" } | ApiError;
`

// Rules that ask for something to be there (a description, a tag, a baseline). What they
// report on these samples is true: it is missing. The samples check the rules that judge.
const PRESENCE = new Set([
  'breaking-change',
  'operation-documented',
  'operation-tagged',
  'model-documented',
  'property-documented',
  'parameter-documented',
  'response-documented',
])

it.each([
  ['an API with the declarations that were once reported', REGISTRY],
  ['a broader API in common styles', STORAGE],
])('the recommended rules report nothing on %s', async (_, source) => {
  const { program } = await Tester.compile(source)
  const recommended: AnyRuleSpec[] = ruleSpecs.filter(
    (spec) => spec.recommended && !PRESENCE.has(spec.name),
  )
  const findings = recommended.flatMap((spec) =>
    runRule(spec, program).map((message) => `${spec.name}: ${message}`),
  )
  expect(findings).toStrictEqual([])
})
