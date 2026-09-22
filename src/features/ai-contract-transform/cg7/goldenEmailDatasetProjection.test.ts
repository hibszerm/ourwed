import assert from 'node:assert/strict'
import { buildContractTransformationDataset } from '../transformationDataset'
import { resolveSemanticMappings } from '../semanticMapping'
import { executeSemanticMappings } from '../semanticMappingExecutor'
import { extractCanonicalParagraphText } from '../../documents/template/canonicalParagraph'
import { buildGoldenScenarios } from './goldenScenarios'

const expectedEmails: Record<string, string[]> = {
  G01: ['zofia.kalendarzowa@example.com'],
  G02: ['helena.mostowa@example.com', 'adam.mostowy@example.com'],
  G03: ['natalia.brzegowa@example.com', 'filip.brzegowy@example.com'],
  G04: ['julia.siatkowa@example.com'],
  G05: ['barbara.atramentowa@example.com'],
  G06: ['olga.widokowa@example.com', 'marek.widokowy@example.com'],
}

async function main() {
  const scenarios = buildGoldenScenarios()
  const datasets = new Map<string, ReturnType<typeof buildContractTransformationDataset>>()

  for (const scenario of scenarios) {
    const dataset = buildContractTransformationDataset({
      wedding: scenario.wedding,
      package: scenario.package,
      extras: scenario.extras,
      currentDate: '2026-11-05',
    })
    const actual = dataset.clients.customers?.map((customer) => customer.email ?? '') ?? []
    assert.deepEqual(actual, expectedEmails[scenario.caseId], `${scenario.caseId} emails reach canonical dataset`)
    datasets.set(scenario.caseId, dataset)
  }

  const source = '<w:p><w:r><w:t>sample@example.com</w:t></w:r></w:p>'
  const sourceParagraphs = [{ blockId: 'shared-email', paragraphXml: source }]
  const grounded = resolveSemanticMappings({
    mappings: [{
      sourceBlockId: 'shared-email',
      concept: 'customer_email',
      anchor: 'sample@example.com',
      customerIndexes: [0, 1],
    }],
    sourceBlocks: sourceParagraphs,
  })
  assert.ok(grounded.ok, 'shared source email grounds')
  if (!grounded.ok) throw new Error(`shared email grounding failed: ${grounded.code}`)

  const execution = executeSemanticMappings({
    resolvedMappings: grounded.mappings,
    canonicalDataset: datasets.get('G06')!,
    sourceParagraphs,
  })
  assert.ok(execution.ok, 'G06 shared email executes')
  if (!execution.ok) throw new Error(`G06 email execution failed: ${execution.code}`)
  assert.equal(execution.spanEdits.length, 1)
  assert.equal(execution.spanEdits[0]!.replacement, 'olga.widokowa@example.com')
  assert.equal(
    extractCanonicalParagraphText(execution.paragraphs[0]!.paragraphXml),
    'olga.widokowa@example.com',
  )
  console.log('PASS G01-G06 canonical email dataset projection and G06 shared-email rendering')
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
