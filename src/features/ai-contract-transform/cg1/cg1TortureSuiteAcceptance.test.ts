/**
 * CG1 acceptance — deterministic torture suite must run and report matrix.
 * Run: npm run test:cg1-contract-torture
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { runDeterministicTortureSuite } from './runDeterministicTortureSuite'
import { TORTURE_TEMPLATE_META } from './tortureTemplates'
import { buildCg1ScenarioMatrix } from './scenarios'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

async function main() {
  assert(TORTURE_TEMPLATE_META.length === 10, 'expected 10 templates')
  const scenarios = buildCg1ScenarioMatrix()
  assert(scenarios.length === 20, `expected 20 scenarios, got ${scenarios.length}`)
  const ones = scenarios.filter((s) => s.partyMode === 'one')
  const twos = scenarios.filter((s) => s.partyMode === 'two')
  assert(ones.length >= 4, 'need multiple one-person cases')
  assert(twos.length >= 4, 'need multiple two-person cases')

  const { results, summary } = await runDeterministicTortureSuite({
    artifactDir: 'tmp/cg1-artifacts/deterministic',
    writeTemplatesDir: 'tests/fixtures/contracts/templates',
  })

  assert(results.length === 20, 'matrix size')
  assert(summary.total === 20, 'summary total')

  // Every template must reopen as DOCX after BASE scenario
  for (const r of results.filter((x) => x.extrasMode === 'none')) {
    assert(r.reopenOk, `${r.scenarioId} must reopen`)
    assert(r.structureResult === 'PASS', `${r.scenarioId} structure`)
  }

  // Explicit extras templates must place into existing_section when extras present
  for (const r of results.filter(
    (x) => x.explicitExtrasArea && x.extrasMode !== 'none',
  )) {
    assert(
      r.placementMode === 'existing_section',
      `${r.scenarioId} expected existing_section, got ${r.placementMode}`,
    )
    assert(
      r.placement === 'PASS',
      `${r.scenarioId} placement should PASS (${r.why})`,
    )
  }

  writeFileSync(
    'tmp/cg1-artifacts/deterministic/ACCEPTANCE.json',
    JSON.stringify({ summary, results }, null, 2),
  )

  console.log('CG1 acceptance summary', summary)
  if (summary.fail > 0) {
    console.error(
      'FAILING CASES',
      results.filter((r) => r.overall === 'FAIL'),
    )
    process.exitCode = 1
  } else {
    console.log('CG1_DETERMINISTIC_ACCEPTANCE_PASS')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
