import { EXAMPLE_PRELUDE } from '../constants/index.js'
import type { RuleDoc } from '../types/index.js'

export function exampleSource(doc: RuleDoc, kind: 'ng' | 'ok'): string {
  return doc.standalone ? doc[kind] : `${EXAMPLE_PRELUDE}\n${doc[kind]}`
}

const fence = (code: string): string => '```tsp\n' + code.trim() + '\n```'

/** Markdown shown in editors and in the README. */
export function renderRuleDocs(doc: RuleDoc): string {
  const assumes = doc.options ? `\n\nThe examples assume \`${JSON.stringify(doc.options)}\`.` : ''
  const before = doc.before ? `\n\nPublished version (the baseline):\n\n${fence(doc.before)}` : ''
  return `${doc.purpose}${assumes}${before}\n\nNG:\n\n${fence(doc.ng)}\n\nOK:\n\n${fence(doc.ok)}`
}
