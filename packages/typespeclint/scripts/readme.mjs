// Regenerates the rule reference in README.md from the built rule specs: `pnpm readme`.
import { readFileSync } from 'node:fs'

import { CATEGORIES, ruleDocs, ruleSpecs } from '../dist/index.js'
import { emit, finish } from './emit.mjs'

const START = '<!-- rules:start -->'
const END = '<!-- rules:end -->'
const file = new URL('../README.md', import.meta.url)

const fence = (lang, code) => '```' + lang + '\n' + code.trim() + '\n```'
const categories = [...new Set(ruleSpecs.map((spec) => spec.category))]

const index = [
  '| Rule | Category | Checklist section | `recommended` | Description |',
  '| --- | --- | --- | --- | --- |',
  ...ruleSpecs.map(
    (spec) =>
      `| [\`${spec.name}\`](#${spec.name}) | \`${spec.category}\` | ${CATEGORIES[spec.category]} | ${spec.recommended ? 'warn' : 'off'} | ${spec.description} |`,
  ),
].join('\n')

const sections = categories.map((category) => {
  const rules = ruleSpecs
    .filter((spec) => spec.category === category)
    .map((spec) => {
      const doc = ruleDocs[spec.name]
      const parts = [
        `#### \`${spec.name}\``,
        `${spec.recommended ? 'In `recommended`' : 'Not in `recommended` (opt-in)'}. ${spec.description}`,
        `Purpose: ${doc.purpose}`,
      ]
      if (doc.options) parts.push(`The examples assume \`${JSON.stringify(doc.options)}\`.`)
      if (doc.before) parts.push('Published version (the baseline):', fence('tsp', doc.before))
      parts.push('NG:', fence('tsp', doc.ng), 'OK:', fence('tsp', doc.ok))
      if (Object.keys(spec.defaults).length > 0) {
        const lines = Object.entries(spec.defaults).map(
          ([key, value]) => `  ${key}: ${JSON.stringify(value)},`,
        )
        parts.push('Default options:', fence('ts', `{\n${lines.join('\n')}\n}`))
      }
      return parts.join('\n\n')
    })
  return [`### ${CATEGORIES[category]} (\`${category}\`)`, ...rules].join('\n\n')
})

const generated = [START, index, ...sections, END].join('\n\n')
const readme = readFileSync(file, 'utf8')
const before = readme.slice(0, readme.indexOf(START))
const after = readme.slice(readme.indexOf(END) + END.length)
const next = before + generated + after

finish(emit(file, next) ? [] : ['README.md'], 'The rule reference is')
