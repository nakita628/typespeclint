import { CASES } from '../constants/index.js'
import type { CaseSpec } from '../types/index.js'

const regexCache = new Map<string, RegExp>()

/** Compile a regular expression source once; rules test the same few patterns against every name. */
export function toRegExp(source: string): RegExp {
  let re = regexCache.get(source)
  if (!re) {
    re = new RegExp(source)
    regexCache.set(source, re)
  }
  return re
}

export function matchesCase(name: string, spec: CaseSpec): boolean {
  const builtin = (CASES as Record<string, RegExp | undefined>)[spec]
  return (builtin ?? toRegExp(spec)).test(name)
}

/** Split an identifier into lower-cased words (`errMsgID` -> `err`, `msg`, `id`). */
export function splitWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
}
