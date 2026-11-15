// Measures the linter on a generated API: `pnpm bench [resources]`.
// Prints the time the compiler spends in the linter, in total and per rule (median of the runs).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { compile, NodeHost } from '@typespec/compiler'

const resources = Number(process.argv[2] ?? 300)
const RUNS = 7
const dir = fileURLToPath(new URL('./.tmp/', import.meta.url))

// One resource: two models with documented properties, an error envelope shared by all, and
// the five usual operations. Mostly compliant, with a few findings so reporting is exercised.
function resource(i) {
  const name = `Item${i}`
  return `
/** Resource ${i}. */
@example(#{ id: "x", label: "y", createdAt: utcDateTime.fromISO("2026-01-01T00:00:00Z"), isActive: true, itemCount: 1, detail: #{ note: "n", err_msg: "e" } })
model ${name} {
  /** Identifier. */ id: string;
  /** Label. */ label: string;
  /** Creation time. */ createdAt: utcDateTime;
  /** Whether it is active. */ isActive: boolean;
  /** Number of items. */ itemCount: int32;
  /** Detail. */ detail: ${name}Detail;
}

/** Detail of resource ${i}. */
model ${name}Detail {
  /** Note. */ note: string;
  err_msg: string;
}

@tag("items${i}")
interface ${name}Operations {
  /** List. */ @route("/items-${i}") @get list(@query pageSize?: int32, @query created_after?: utcDateTime): ${name}[] | ProblemResponse;
  /** Read. */ @route("/items-${i}/{itemId}") @get read(@path itemId: string): ${name} | ProblemResponse;
  /** Create. */ @route("/items-${i}") @post create(@body body: ${name}): ${name} | ProblemResponse;
  /** Update. */ @route("/items-${i}/{itemId}") @patch update(@path itemId: string, @body body: ${name}): ${name} | ProblemResponse;
  /** Delete. */ @route("/items-${i}/{itemId}") @delete delete(@path itemId: string): void | ProblemResponse;
}
`
}

const source = `
import "@typespec/http";
using Http;

@service(#{ title: "Bench" })
@useAuth(BearerAuth)
namespace Bench;

/** Problem. */
model Problem { /** Type. */ type: string; /** Title. */ title: string; /** Status. */ status: int32; /** Detail. */ detail: string; /** Instance. */ instance: string; }
/** Problem response. */
@error model ProblemResponse { @header contentType: "application/problem+json"; @body body: Problem; }
${Array.from({ length: resources }, (_, i) => resource(i)).join('')}
`

rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
writeFileSync(`${dir}main.tsp`, source)

const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]
const totals = []
const perRule = new Map()
let findings = 0

for (let run = 0; run < RUNS; run++) {
  // oxlint-disable-next-line no-await-in-loop -- runs are timed one after the other, never in parallel
  const program = await compile(NodeHost, `${dir}main.tsp`, {
    noEmit: true,
    linterRuleSet: { extends: ['typespeclint/all'] },
  })
  const errors = program.diagnostics.filter((d) => d.severity === 'error')
  if (errors.length > 0) throw new Error(errors[0].message)
  findings = program.diagnostics.length
  const linter = program.stats.runtime.linter
  totals.push(linter.total)
  for (const [rule, ms] of Object.entries(linter.rules)) {
    perRule.set(rule, [...(perRule.get(rule) ?? []), ms])
  }
}
rmSync(dir, { recursive: true, force: true })

console.log(
  `${resources} resources (${resources * 2} models, ${resources * 5} operations), ${findings} findings`,
)
console.log(`linter total: ${median(totals).toFixed(1)} ms (median of ${RUNS} runs)`)
const rows = [...perRule]
  .map(([rule, values]) => [rule, median(values)])
  .toSorted((a, b) => b[1] - a[1])
for (const [rule, ms] of rows.slice(0, 10))
  console.log(`  ${ms.toFixed(1).padStart(7)} ms  ${rule}`)
