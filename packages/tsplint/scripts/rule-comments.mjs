// Writes the "Purpose / NG / OK" header comment above every rule in src/rules/*.ts
// from src/rules/docs.ts, so the examples exist once and are tested once.
import { readdirSync, readFileSync } from 'node:fs'

import { ruleDocs } from '../dist/index.js'
import { emit, finish } from './emit.mjs'

const dir = new URL('../src/rules/', import.meta.url)
const RULE =
  /(?:\/\*\*(?:(?!\*\/)[\s\S])*\*\/\n)?(export const \w+ = defineRule(?:<\w+>)?\(\)\(\{\n  name: '([a-z-]+)',)/g
const WIDTH = 96

function wrap(text) {
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > WIDTH) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines
}

function code(source) {
  return ['```tsp', ...source.trim().split('\n'), '```']
}

function comment(doc) {
  const body = [
    ...wrap(`Purpose: ${doc.purpose}`),
    ...(doc.options ? ['', `The examples assume \`${JSON.stringify(doc.options)}\`.`] : []),
    ...(doc.before ? ['', 'Published version (the baseline):', ...code(doc.before)] : []),
    '',
    'NG:',
    ...code(doc.ng),
    '',
    'OK:',
    ...code(doc.ok),
  ]
  // `*/` would end the comment early.
  const lines = body.map((line) => (line ? ` * ${line.replaceAll('*/', '*\\/')}` : ' *'))
  return ['/**', ...lines, ' */'].join('\n') + '\n'
}

const documented = new Set()
const stale = []

for (const name of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
  const file = new URL(name, dir)
  const source = readFileSync(file, 'utf8')
  const next = source.replace(RULE, (_, declaration, rule) => {
    documented.add(rule)
    return comment(ruleDocs[rule]) + declaration
  })
  if (next !== source && !emit(file, next)) stale.push(name)
}

const missing = Object.keys(ruleDocs).filter((rule) => !documented.has(rule))
if (missing.length > 0) {
  console.error(`No rule declaration found for: ${missing.join(', ')}`)
  process.exit(1)
}
finish(stale, 'Rule header comments are')
