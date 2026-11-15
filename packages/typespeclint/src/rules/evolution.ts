import { resolve } from 'node:path'

import { BASELINE_FILE, UPDATE_BASELINE_ENV } from '../constants/index.js'
import { isUserType } from '../helper/analysis.js'
import { defineRule } from '../helper/rule.js'
import { readBaseline, snapshotOf, writeBaseline } from '../helper/snapshot.js'
import { describeOperation } from '../utils/http.js'
import { breakingChanges } from '../utils/snapshot.js'

export interface BreakingChangeOptions {
  /** Baseline file recording the published API, relative to the directory of tspconfig.yaml. */
  baseline: string
}

/**
 * Purpose: A change that breaks consumers must be a decision, not an accident. The rule compares
 * the API with a baseline recorded when a version was published (`TYPESPECLINT_UPDATE_BASELINE=1
 * tsp compile .` writes `typespeclint.baseline.json`) and reports what a consumer of that version
 * can no longer do: a removed operation, parameter or response property, a changed type, a
 * parameter that became required. Additions a consumer can ignore are fine. Until a baseline is
 * recorded, the rule reports that one is missing.
 *
 * Published version (the baseline):
 * ```tsp
 * @service
 * @useAuth(BearerAuth)
 * namespace Shop;
 *
 * model Order { id: string; total: decimal; note?: string; }
 *
 * @route("/orders") @get op listOrders(@query status?: string): Order[];
 * ```
 *
 * NG:
 * ```tsp
 * @service
 * @useAuth(BearerAuth)
 * namespace Shop;
 *
 * // 'total' is gone, and 'status' is now required.
 * model Order { id: string; note?: string; }
 *
 * @route("/orders") @get op listOrders(@query status: string): Order[];
 * ```
 *
 * OK:
 * ```tsp
 * @service
 * @useAuth(BearerAuth)
 * namespace Shop;
 *
 * // A new property and a new optional parameter: existing consumers keep working.
 * model Order { id: string; total: decimal; note?: string; currency?: string; }
 *
 * @route("/orders") @get op listOrders(@query status?: string, @query pageSize?: int32): Order[];
 * ```
 */
export const breakingChange = defineRule<BreakingChangeOptions>()({
  name: 'breaking-change',
  description: 'The API must not break consumers of its published version.',
  category: 'evolution',
  // Until a baseline is recorded there is nothing to compare with: the rule says so once.
  recommended: true,
  defaults: { baseline: BASELINE_FILE },
  run({ program, analysis, options, report }) {
    const file = resolve(program.projectRoot, options.baseline)
    const current = snapshotOf(analysis.httpOperations)
    if (process.env[UPDATE_BASELINE_ENV]) {
      writeBaseline(file, current)
      return
    }
    // Findings about the API as a whole are shown on the service.
    const service = analysis.services
      .map((s) => s.namespace)
      .find((namespace) => namespace.name !== '' && isUserType(program, namespace))
    const anchor = service ?? analysis.httpOperations[0]?.operation
    if (!anchor) return
    const baseline = readBaseline(file)
    if (!baseline) {
      report(
        anchor,
        `No baseline at '${options.baseline}'. Record the published API once with ${UPDATE_BASELINE_ENV}=1.`,
      )
      return
    }
    const byName = new Map(analysis.httpOperations.map((op) => [describeOperation(op), op]))
    for (const change of breakingChanges(baseline, current)) {
      report(
        byName.get(change.operation)?.operation ?? anchor,
        `Breaking change in ${change.operation}: ${change.message}. Keep the published contract, or apply the versioning policy and update the baseline.`,
      )
    }
  },
})
