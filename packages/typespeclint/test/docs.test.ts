import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import { analyze } from '../src/helper/analysis.js'
import { runRule } from '../src/helper/rule.js'
import { snapshotOf } from '../src/helper/snapshot.js'
import { ruleDocs } from '../src/rules/docs.js'
import { ruleSpecs } from '../src/rules/index.js'
import type { RuleDoc, RuleSpec } from '../src/types/index.js'
import { exampleSource } from '../src/utils/docs.js'
import { Tester } from './helper.js'

/** The options the examples run with. A `before` version is recorded as the baseline file. */
async function optionsOf(doc: RuleDoc): Promise<Record<string, unknown> | undefined> {
  if (!doc.before) return doc.options
  const { program } = await Tester.compile(doc.before)
  const baseline = join(mkdtempSync(join(tmpdir(), 'typespeclint-baseline-')), 'baseline.json')
  writeFileSync(baseline, JSON.stringify(snapshotOf(analyze(program).httpOperations)))
  return { ...doc.options, baseline }
}

// The NG / OK examples in the documentation are executed: NG must be reported, OK must not.
describe.each(ruleSpecs.map((spec) => [spec.name, spec as RuleSpec<string, object>] as const))(
  '%s',
  (name, spec) => {
    const doc: RuleDoc = ruleDocs[name]

    it('NG example is reported', async () => {
      const options = await optionsOf(doc)
      const { program } = await Tester.compile(exampleSource(doc, 'ng'))
      expect(runRule(spec, program, options)).not.toEqual([])
    })

    it('OK example is not reported', async () => {
      const options = await optionsOf(doc)
      const { program } = await Tester.compile(exampleSource(doc, 'ok'))
      expect(runRule(spec, program, options)).toEqual([])
    })
  },
)
