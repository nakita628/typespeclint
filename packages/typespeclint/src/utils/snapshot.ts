import type {
  ApiSnapshot,
  BreakingChange,
  SnapshotFields,
  SnapshotOperation,
} from '../types/index.js'

function requestChanges(before: SnapshotFields, after: SnapshotFields): string[] {
  const changes: string[] = []
  for (const [path, was] of Object.entries(before)) {
    const now = after[path]
    if (!now) changes.push(`request '${path}' was removed`)
    else if (now.type !== was.type) {
      changes.push(`request '${path}' changed type from ${was.type} to ${now.type}`)
    } else if (was.optional && !now.optional) changes.push(`request '${path}' became required`)
  }
  for (const [path, now] of Object.entries(after)) {
    if (!before[path] && !now.optional) changes.push(`request '${path}' was added as required`)
  }
  return changes
}

function responseChanges(status: string, before: SnapshotFields, after: SnapshotFields): string[] {
  const changes: string[] = []
  for (const [path, was] of Object.entries(before)) {
    const now = after[path]
    if (!now) changes.push(`response ${status} '${path}' was removed`)
    else if (now.type !== was.type) {
      changes.push(`response ${status} '${path}' changed type from ${was.type} to ${now.type}`)
    } else if (!was.optional && now.optional) {
      changes.push(`response ${status} '${path}' is no longer always returned`)
    }
  }
  return changes
}

function operationChanges(before: SnapshotOperation, after: SnapshotOperation): string[] {
  const changes = requestChanges(before.request, after.request)
  for (const [status, was] of Object.entries(before.responses)) {
    const now = after.responses[status]
    if (now) changes.push(...responseChanges(status, was, now))
    else changes.push(`response ${status} was removed`)
  }
  return changes
}

/**
 * The changes from `before` to `after` that break a consumer written against `before`:
 * something it sends is no longer accepted, or something it reads is no longer there.
 * Additions a consumer can ignore (a new operation, an optional parameter, a new response
 * property) are not breaking.
 */
export function breakingChanges(before: ApiSnapshot, after: ApiSnapshot): BreakingChange[] {
  const changes: BreakingChange[] = []
  for (const [operation, was] of Object.entries(before.operations)) {
    const now = after.operations[operation]
    if (!now) {
      changes.push({ operation, message: 'the operation was removed' })
      continue
    }
    for (const message of operationChanges(was, now)) changes.push({ operation, message })
  }
  return changes
}
