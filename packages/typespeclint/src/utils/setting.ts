import type { Severity } from '../types/index.js'

export function isSeverity(value: unknown): value is Severity {
  return value === 'off' || value === 'warn' || value === 'error'
}

export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/** Read one `rules` entry of a config: `'warn'`, `['warn', { ... }]`, `{ ... }`, `true`, `false`. */
export function parseSetting(setting: unknown): { severity?: Severity; options?: object } {
  if (setting === true) return { severity: 'warn' }
  if (setting === false) return { severity: 'off' }
  if (isSeverity(setting)) return { severity: setting }
  if (Array.isArray(setting)) {
    const [severity, options]: unknown[] = setting
    return {
      ...(isSeverity(severity) ? { severity } : {}),
      options: isObject(options) ? options : {},
    }
  }
  if (isObject(setting)) return { options: setting }
  return {}
}
