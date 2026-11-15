import type { HttpOperation, HttpStatusCodesEntry } from '@typespec/http'

export function describeOperation(op: HttpOperation): string {
  return `${op.verb.toUpperCase()} ${op.path}`
}

export type StatusClass = 'success' | 'error' | 'other'

export function statusClass(status: HttpStatusCodesEntry): StatusClass {
  if (status === '*') return 'error'
  const start = typeof status === 'number' ? status : status.start
  if (start >= 400) return 'error'
  if (start >= 200) return 'success'
  return 'other'
}

export function formatStatus(status: HttpStatusCodesEntry): string {
  if (status === '*') return 'default'
  return typeof status === 'number' ? String(status) : `${status.start}-${status.end}`
}
