import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { buildContractTransformationDataset } from '../transformationDataset'
import { executeSemanticMappings } from '../semanticMappingExecutor'
import { resolveSemanticMappings, type SemanticMapping } from '../semanticMapping'
import { extractCanonicalParagraphText } from '../../documents/template/canonicalParagraph'
import { buildGoldenScenarios, type GoldenCaseId } from './goldenScenarios'

const root = process.cwd()
const sourceDir = join(root, 'tmp/golden-contract-validation-run2/SOURCE')
const surfaces: Array<{
  caseId: GoldenCaseId
  blockId: string
  customer: 1 | 2
  anchor: string
  sourceIdentities: readonly string[]
}> = [
  { caseId: 'G01', blockId: 'para-1', customer: 1, anchor: 'Alicji Przykładowej', sourceIdentities: ['Alicja Przykładowa'] },
  { caseId: 'G01', blockId: 'para-2', customer: 1, anchor: 'Alicją Przykładową', sourceIdentities: ['Alicja Przykładowa'] },
  { caseId: 'G01', blockId: 'table-0-row-0-cell-0-p-0', customer: 1, anchor: 'Alicja Przykładowa', sourceIdentities: ['Alicja Przykładowa'] },
  { caseId: 'G02', blockId: 'para-2', customer: 1, anchor: 'Leny Fikcyjnej', sourceIdentities: ['Lena Fikcyjna', 'Oskar Umowny'] },
  { caseId: 'G02', blockId: 'para-2', customer: 2, anchor: 'Oskara Umownego', sourceIdentities: ['Lena Fikcyjna', 'Oskar Umowny'] },
  { caseId: 'G02', blockId: 'table-0-row-1-cell-1-p-0', customer: 1, anchor: 'Lena Fikcyjna', sourceIdentities: ['Lena Fikcyjna', 'Oskar Umowny'] },
  { caseId: 'G02', blockId: 'table-0-row-2-cell-1-p-0', customer: 2, anchor: 'Oskar Umowny', sourceIdentities: ['Lena Fikcyjna', 'Oskar Umowny'] },
  { caseId: 'G02', blockId: 'table-3-row-0-cell-0-p-0', customer: 1, anchor: 'Lena Fikcyjna', sourceIdentities: ['Lena Fikcyjna', 'Oskar Umowny'] },
  { caseId: 'G02', blockId: 'table-3-row-0-cell-1-p-0', customer: 2, anchor: 'Oskar Umowny', sourceIdentities: ['Lena Fikcyjna', 'Oskar Umowny'] },
  { caseId: 'G03', blockId: 'para-9', customer: 1, anchor: 'Mają Przykładową', sourceIdentities: ['Maja Przykładowa', 'Kacper Modelowy'] },
  { caseId: 'G03', blockId: 'para-9', customer: 2, anchor: 'Kacprem Modelowym', sourceIdentities: ['Maja Przykładowa', 'Kacper Modelowy'] },
  { caseId: 'G03', blockId: 'table-1-row-1-cell-0-p-0', customer: 1, anchor: 'Maja Przykładowa', sourceIdentities: ['Maja Przykładowa', 'Kacper Modelowy'] },
  { caseId: 'G03', blockId: 'table-1-row-2-cell-0-p-0', customer: 2, anchor: 'Kacper Modelowy', sourceIdentities: ['Maja Przykładowa', 'Kacper Modelowy'] },
  { caseId: 'G03', blockId: 'table-6-row-0-cell-1-p-0', customer: 1, anchor: 'Maja Przykładowa', sourceIdentities: ['Maja Przykładowa', 'Kacper Modelowy'] },
  { caseId: 'G03', blockId: 'table-6-row-0-cell-2-p-0', customer: 2, anchor: 'Kacper Modelowy', sourceIdentities: ['Maja Przykładowa', 'Kacper Modelowy'] },
  { caseId: 'G04', blockId: 'table-1-row-1-cell-1-p-0', customer: 1, anchor: 'Iga Makieta', sourceIdentities: ['Iga Makieta'] },
  { caseId: 'G04', blockId: 'table-3-row-1-cell-3-p-0', customer: 1, anchor: 'Iga Makieta', sourceIdentities: ['Iga Makieta'] },
  { caseId: 'G04', blockId: 'table-8-row-0-cell-0-p-0', customer: 1, anchor: 'Iga Makieta', sourceIdentities: ['Iga Makieta'] },
  { caseId: 'G05', blockId: 'para-2', customer: 1, anchor: 'Heleną Wzorcową', sourceIdentities: ['Helena Wzorcowa'] },
  { caseId: 'G05', blockId: 'table-0-row-4-cell-1-p-0', customer: 1, anchor: 'Helena Wzorcowa', sourceIdentities: ['Helena Wzorcowa'] },
  { caseId: 'G05', blockId: 'table-1-row-0-cell-1-p-0', customer: 1, anchor: 'Helena Wzorcowa', sourceIdentities: ['Helena Wzorcowa'] },
  { caseId: 'G06', blockId: 'para-2', customer: 1, anchor: 'Nina Robocza', sourceIdentities: ['Nina Robocza', 'Kajetan Testowy'] },
  { caseId: 'G06', blockId: 'para-2', customer: 2, anchor: 'Kajetan Testowy', sourceIdentities: ['Nina Robocza', 'Kajetan Testowy'] },
  { caseId: 'G06', blockId: 'table-0-row-0-cell-1-p-0', customer: 1, anchor: 'Nina Robocza', sourceIdentities: ['Nina Robocza', 'Kajetan Testowy'] },
  { caseId: 'G06', blockId: 'table-0-row-0-cell-1-p-0', customer: 2, anchor: 'Kajetan Testowy', sourceIdentities: ['Nina Robocza', 'Kajetan Testowy'] },
  { caseId: 'G06', blockId: 'table-2-row-0-cell-0-p-0', customer: 1, anchor: 'Nina Robocza', sourceIdentities: ['Nina Robocza', 'Kajetan Testowy'] },
  { caseId: 'G06', blockId: 'table-2-row-0-cell-1-p-0', customer: 2, anchor: 'Kajetan Testowy', sourceIdentities: ['Nina Robocza', 'Kajetan Testowy'] },
]

const GENITIVE_SURFACES = new Set(['Alicji Przykładowej', 'Leny Fikcyjnej', 'Oskara Umownego'])
const INSTRUMENTAL_SURFACES = new Set(['Alicją Przykładową', 'Mają Przykładową', 'Heleną Wzorcową', 'Kacprem Modelowym'])

async function main() {
  const scenarios = buildGoldenScenarios()
  const counts = { safe: 0, unresolved: 0, base: 0, genitive: 0, instrumental: 0 }
  const byCase = new Map<GoldenCaseId, { safe: number; unrenderable: number }>()
  for (const surface of surfaces) {
    const scenario = scenarios.find((item) => item.caseId === surface.caseId)!
    for (const sourceIdentity of surface.sourceIdentities) {
      assert.ok(scenario.stalePartyTokens.includes(sourceIdentity), `${surface.caseId} source identity is in its authoritative stale-party reference fixture`)
    }
    const raw = readFileSync(join(sourceDir, scenario.sourceFile))
    const sourceBytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
    const indexed = await indexDocxForTransform(sourceBytes)
    const zip = await JSZip.loadAsync(sourceBytes)
    const documentXml = await zip.file('word/document.xml')!.async('string')
    const paragraphXmls = [...documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
    const block = indexed.find((item) => item.blockId === surface.blockId)
    assert.ok(block, `${surface.caseId} ${surface.blockId} exists`)
    const sourceParagraphs = [{ blockId: block.blockId, paragraphXml: paragraphXmls[block.paragraphIndex]! }]
    const concept: SemanticMapping['concept'] = surface.customer === 1 ? 'customer_1_name' : 'customer_2_name'
    const nameForm = surface.anchor === surface.sourceIdentities[surface.customer - 1]
      ? 'BASE'
      : GENITIVE_SURFACES.has(surface.anchor)
        ? 'GENITIVE'
        : INSTRUMENTAL_SURFACES.has(surface.anchor)
          ? 'INSTRUMENTAL'
          : undefined
    assert.ok(nameForm, `${surface.caseId} ${surface.anchor} has a closed name form`)
    if (!nameForm) throw new Error(`missing form classification: ${surface.anchor}`)
    counts[nameForm === 'BASE' ? 'base' : nameForm === 'GENITIVE' ? 'genitive' : 'instrumental']++
    const grounded = resolveSemanticMappings({
      mappings: [{ sourceBlockId: block.blockId, concept, anchor: surface.anchor, nameForm }],
      sourceBlocks: sourceParagraphs,
    })
    assert.ok(grounded.ok, `${surface.caseId} ${surface.anchor} grounds`)
    if (!grounded.ok) throw new Error(`grounding failed: ${grounded.code}`)
    const dataset = buildContractTransformationDataset({ wedding: scenario.wedding, package: scenario.package, extras: scenario.extras, currentDate: '2026-11-05' })
    const execution = executeSemanticMappings({
      resolvedMappings: grounded.mappings,
      canonicalDataset: dataset,
      sourceParagraphs,
      sourceCustomerIdentities: surface.sourceIdentities,
    })
    const result = byCase.get(surface.caseId) ?? { safe: 0, unrenderable: 0 }
    if (execution.ok) {
      counts.safe++
      result.safe++
      const output = execution.paragraphs[0]!
      const visible = extractCanonicalParagraphText(output.paragraphXml)
      const target = dataset.clients.customers?.[surface.customer - 1]?.displayName
      assert.ok(target && visible.includes(target), `${surface.caseId} canonical customer value rendered`)
    } else {
      assert.fail(`${surface.caseId} unresolved name form should use canonical fallback, got ${execution.code}`)
    }
    assert.equal(execution.ok, true, `${surface.caseId} all closed name forms execute with safe canonical fallback`)
    byCase.set(surface.caseId, result)
  }
  assert.equal(surfaces.length, 27)
  assert.deepEqual(counts, { safe: 27, unresolved: 0, base: 20, genitive: 3, instrumental: 4 })
  console.log(`PASS G01-G06 customer-name surface replay; total=${surfaces.length}; forms=${JSON.stringify(counts)}`)
  console.log(`GOLDENS_WITH_UNRENDERABLE=${[...byCase].filter(([, value]) => value.unrenderable > 0).map(([id]) => id).join(',')}`)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
