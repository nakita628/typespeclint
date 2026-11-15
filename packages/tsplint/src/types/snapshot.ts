// The recorded surface of an API, as `breaking-change` saves and compares it.

/** One value a consumer sends or receives: whether it may be absent, and its type. */
export interface SnapshotField {
  optional: boolean
  type: string
}

/** Fields by path: `in:name` for parameters, `a.b` for nested body properties. */
export type SnapshotFields = Record<string, SnapshotField>

export interface SnapshotOperation {
  /** What the consumer sends: parameters and request body properties. */
  request: SnapshotFields
  /** What the consumer receives, by status code. */
  responses: Record<string, SnapshotFields>
}

/** Operations by `VERB path`. */
export interface ApiSnapshot {
  operations: Record<string, SnapshotOperation>
}

export interface BreakingChange {
  /** `VERB path` of the operation the change is in. */
  operation: string
  message: string
}
