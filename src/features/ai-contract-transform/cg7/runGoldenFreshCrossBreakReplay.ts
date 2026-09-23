import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { extractCanonicalParagraphText } from '../../documents/template/canonicalParagraph'
import { formatDateLikeSource } from '@/features/ai-contract-lab/resolveTypedSourceSpan'
import { buildContractTransformationDataset } from '../transformationDataset'
import { executeSemanticMappings, type SemanticMappingExecutionResult } from '../semanticMappingExecutor'
import { writeSemanticMappingDocx } from '../docxTransformWriter'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { parseLegacySemanticMapResponse as parseSemanticMapResponse } from '../semanticMapModelContract'
import { resolveSemanticMappings } from '../semanticMapping'
import { buildGoldenScenarios } from './goldenScenarios'
import { resolveGoldenEvaluationNameForm } from './goldenNameFormEvaluationOracle'
import { GOLDEN_SUPPLIED_DATE_VALUES } from './goldenSuppliedDateValues.fixture'
import type { SuppliedDateValues } from '../types'

const root = process.cwd()
const runDirectory = join(root, 'tmp/golden-contract-validation-run2')
const sourceDirectory = join(runDirectory, 'SOURCE')
const evidenceDirectory = join(runDirectory, 'EVIDENCE/GPT6_LUNA_FRESH_FINAL_WRITER_ACCEPTANCE')
const outputDirectory = join(runDirectory, 'FINAL_STRUCTURED_CROSS_BREAK_OFFLINE_2026-09-23-R10')
const expectedHashes: Record<string, string> = {
  G02: '617275318f49790e9b2ba3faa4093b96486f0bf1b2b72a2082f0eed94cb9a6ae',
  G03: '1d4035dafdde597b308af923a1061ba3409141420d8dd6d699df1578ae5d6637',
  G04: '63358621714ef99f88392be4174e2e498dcaf4555749a698ec94904c0925feb4',
}
const sourceCustomerIdentities: Record<string, readonly string[]> = {
  G02: ['Lena Fikcyjna', 'Oskar Umowny'],
  G03: ['Maja Przykładowa', 'Kacper Modelowy'],
  G04: ['Iga Makieta'],
}

function paragraphs(xml: string): string[] {
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
}
function tableShape(xml: string): number[][] {
  return [...xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)].map((table) =>
    [...table[0]!.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((row) => [...row[0]!.matchAll(/<w:tc\b/g)].length))
}
function tagCount(xml: string, tag: string): number {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s|>)`, 'g'))].length
}
async function documentXml(bytes: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  const file = zip.file('word/document.xml')
  assert.ok(file, 'DOCX has document.xml')
  return file.async('string')
}

async function replay(caseId: 'G02' | 'G03' | 'G04', scenario: ReturnType<typeof buildGoldenScenarios>[number]) {
  const sourcePath = join(sourceDirectory, scenario.sourceFile)
  const sourceRaw = readFileSync(sourcePath)
  const sourceHash = createHash('sha256').update(sourceRaw).digest('hex')
  assert.equal(sourceHash, expectedHashes[caseId], `${caseId} canonical source hash`)
  const captured = JSON.parse(readFileSync(join(evidenceDirectory, `${caseId}-provider-output.json`), 'utf8')) as {
    goldenId: string; model: string; reasoningEffort: string; sourceSha256: string; callOrdinal: number; outputText: string
  }
  assert.equal(captured.goldenId, caseId)
  assert.equal(captured.model, 'gpt-6-luna')
  assert.equal(captured.reasoningEffort, 'medium')
  assert.equal(captured.sourceSha256, sourceHash)
  assert.equal(captured.callOrdinal, { G02: 2, G03: 3, G04: 4 }[caseId])
  const metadata = JSON.parse(readFileSync(join(evidenceDirectory, `${caseId}-provider-metadata.json`), 'utf8')) as { retries: number; outputTextCaptured: boolean }
  assert.equal(metadata.retries, 0)
  assert.equal(metadata.outputTextCaptured, true)
  const wirePayload: unknown = JSON.parse(captured.outputText)
  const parsed = parseSemanticMapResponse(wirePayload)
  if (!parsed.ok) throw new Error(`${caseId} strict parse: ${parsed.code}`)

  const sourceBytes = sourceRaw.buffer.slice(sourceRaw.byteOffset, sourceRaw.byteOffset + sourceRaw.byteLength)
  const indexed = await indexDocxForTransform(sourceBytes)
  const beforeXml = await documentXml(sourceBytes)
  const beforeParagraphs = paragraphs(beforeXml)
  const sourceParagraphs = indexed.map((block) => ({ blockId: block.blockId, paragraphXml: beforeParagraphs[block.paragraphIndex]! }))
  const grounded = resolveSemanticMappings({ mappings: parsed.semanticMappings, sourceBlocks: sourceParagraphs })
  if (!grounded.ok) throw new Error(`${caseId} grounding: ${grounded.code}`)
  const crossBreak = grounded.mappings.filter((mapping) => mapping.span.segments && mapping.span.segments.length > 1)
  const expectedCrossBreak = { G02: 5, G03: 6, G04: 1 }[caseId]
  assert.equal(crossBreak.length, expectedCrossBreak, `${caseId} has the proven number of cross-break mappings`)

  const dataset = buildContractTransformationDataset({
    wedding: scenario.wedding,
    package: scenario.package,
    extras: scenario.extras,
    currentDate: '2026-09-22',
    weddingPlaces: scenario.structuredPlaces,
  })
  const executionInput = {
    resolvedMappings: grounded.mappings,
    canonicalDataset: dataset,
    sourceParagraphs,
    sourceCustomerIdentities: sourceCustomerIdentities[caseId],
    evaluationNameFormResolver: resolveGoldenEvaluationNameForm,
  }
  const full = executeSemanticMappings(executionInput)
  let blocked: Array<{ sourceBlockId: string; concept: string; reason: string }> = []
  let safeMappings = [...grounded.mappings]
  let execution: SemanticMappingExecutionResult = full
  if (!execution.ok && execution.code === 'requires_user_input') {
    const supplied: SuppliedDateValues = {
      documentStateId: execution.documentStateId,
      values: execution.requiresUserInputDates.map((request) => {
        const fixture = GOLDEN_SUPPLIED_DATE_VALUES.find((value) =>
          value.goldenId === caseId && value.sourceBlockId === request.sourceBlockId,
        )
        assert.ok(fixture, `${caseId} unresolved date has an approved fixture value: ${request.sourceBlockId}`)
        assert.equal(fixture.role, request.role, `${caseId} approved supplied date role matches its exact source block`)
        return { unresolvedDateId: request.unresolvedDateId, value: fixture.value }
      }),
    }
    execution = executeSemanticMappings({ ...executionInput, suppliedDateValues: supplied })
  }
  while (!execution.ok) {
    if (execution.code !== 'unrenderable_surface' || execution.mappingIndex === undefined) {
      throw new Error(`${caseId} execution failed outside a missing/incompatible structured component: ${execution.code}`)
    }
    const rejected = safeMappings[execution.mappingIndex]
    assert.ok(rejected?.span.segments && rejected.span.segments.length > 1, `${caseId} blocked mapping crosses source structural slots`)
    blocked.push({ sourceBlockId: rejected.sourceBlockId, concept: rejected.concept, reason: 'authoritative target component count does not match source slots' })
    safeMappings.splice(execution.mappingIndex, 1)
    execution = executeSemanticMappings({ ...executionInput, resolvedMappings: safeMappings })
  }

  for (const mapping of safeMappings.filter((item) => item.span.segments?.length)) {
    const successfulExecution = execution as Extract<SemanticMappingExecutionResult, { ok: true }>
    const edit: (typeof successfulExecution.spanEdits)[number] | undefined = successfulExecution.spanEdits.find((item) => item.blockId === mapping.sourceBlockId && item.span.start === mapping.span.start)
    assert.ok(edit, `${caseId} has cross-break edit ${mapping.concept}`)
    assert.equal(edit!.replacementSegments?.length, mapping.span.segments!.length, `${caseId} segment count matches source breaks: ${mapping.concept}`)
  }

  const outputName = blocked.length ? `${caseId}_FINAL_PARTIAL.docx` : `${caseId}_FINAL.docx`
  const outputPath = join(outputDirectory, outputName)
  assert.equal(existsSync(outputPath), false, `${caseId} offline output is new`)
  const outputBytes = await writeSemanticMappingDocx({ sourceBytes, sourceBlocks: indexed, execution })
  writeFileSync(outputPath, Buffer.from(outputBytes))
  const afterXml = await documentXml(outputBytes)
  const afterParagraphs = paragraphs(afterXml)
  assert.equal(afterParagraphs.length, beforeParagraphs.length, `${caseId} paragraph count unchanged`)
  assert.deepEqual(tableShape(afterXml), tableShape(beforeXml), `${caseId} table ancestry/dimensions unchanged`)
  assert.equal(tagCount(afterXml, 'w:tbl'), tagCount(beforeXml, 'w:tbl'))
  assert.equal(tagCount(afterXml, 'w:tr'), tagCount(beforeXml, 'w:tr'))
  assert.equal(tagCount(afterXml, 'w:tc'), tagCount(beforeXml, 'w:tc'))
  const executedById = new Map(execution.paragraphs.map((row) => [row.blockId, row.paragraphXml]))
  for (const block of indexed) {
    const after = afterParagraphs[block.paragraphIndex]!
    assert.equal(after, executedById.get(block.blockId) ?? beforeParagraphs[block.paragraphIndex], `${caseId} writer stays within mapped source paragraphs`)
  }
  for (const row of execution.paragraphs) {
    const paragraphIndex = indexed.find((item) => item.blockId === row.blockId)!.paragraphIndex
    assert.equal(tagCount(row.paragraphXml, 'w:br'), tagCount(beforeParagraphs[paragraphIndex]!, 'w:br'), `${caseId} source breaks survive in ${row.blockId}`)
  }
  for (const block of indexed.filter((item) => execution.paragraphs.some((row) => row.blockId === item.blockId))) {
    const beforeText = block.text
    let expectedText = beforeText
    const blockEdits = execution.spanEdits.filter((item) => item.blockId === block.blockId).sort((left, right) => right.span.start - left.span.start)
    for (const edit of blockEdits) {
      const inserted = edit.replacementSegments?.join('') ?? edit.replacement
      expectedText = expectedText.slice(0, edit.span.start) + inserted + expectedText.slice(edit.span.end)
    }
    const afterText = extractCanonicalParagraphText(afterParagraphs[block.paragraphIndex]!)
    assert.equal(afterText, expectedText, `${caseId} preserves exact surrounding text and inserts only target content: ${block.blockId}`)
  }
  assert.equal(tagCount(afterXml, 'w:p'), tagCount(beforeXml, 'w:p'), `${caseId} no paragraph reconstruction or insertion`)

  if (caseId === 'G02') {
    for (const id of ['table-0-row-1-cell-1-p-0', 'table-0-row-2-cell-1-p-0']) {
      assert.ok(afterParagraphs[indexed.find((item) => item.blockId === id)!.paragraphIndex]!.includes('<w:br/>'), `G02 contact separators preserved: ${id}`)
    }
  }
  if (caseId === 'G03') {
    assert.deepEqual(tableShape(afterXml), tableShape(beforeXml), 'G03 payment and signature tables retain the exact source ancestry')
    assert.equal(blocked.length, 0, 'G03 has no blocked structured-target mappings')
    assert.equal(execution.spanEdits.length, 22, 'G03 applies all 22 mappings')
    assert.equal(outputName, 'G03_FINAL.docx', 'G03 writes a complete, non-partial final')
    const reception = grounded.mappings.find((mapping) => mapping.concept === 'reception_location')!
    const receptionEdit = execution.spanEdits.find((edit) => edit.blockId === reception.sourceBlockId && edit.span.start === reception.span.start)
    assert.deepEqual(receptionEdit?.replacementSegments, [
      'Grand Hotel Sopot — sala balowa',
      'ul. Powstańców Warszawy 12/14, Sopot',
    ], 'G03 reception renders the authoritative label and address into its two source slots')
    const receptionParagraph = afterParagraphs[indexed.find((item) => item.blockId === reception.sourceBlockId)!.paragraphIndex]!
    assert.equal(tagCount(receptionParagraph, 'w:br'), tagCount(beforeParagraphs[indexed.find((item) => item.blockId === reception.sourceBlockId)!.paragraphIndex]!, 'w:br'), 'G03 reception break survives')
  }
  if (caseId === 'G04') {
    const delivery = grounded.mappings.find((mapping) => mapping.concept === 'delivery_due_date')
    if (delivery) {
      const pIndex = indexed.find((item) => item.blockId === delivery.sourceBlockId)!.paragraphIndex
      assert.notEqual(afterParagraphs[pIndex], beforeParagraphs[pIndex], 'G04 delivery target remains in its source paragraph')
      const supplied = GOLDEN_SUPPLIED_DATE_VALUES.find((value) => value.goldenId === 'G04' && value.sourceBlockId === delivery.sourceBlockId)
      assert.ok(supplied, 'G04 delivery has an approved value fixture')
      const expected = formatDateLikeSource({ canonicalDate: supplied!.value, sourceText: delivery.anchor })
      assert.ok(expected, 'G04 delivery value formats for its exact source surface')
      const rendered = extractCanonicalParagraphText(afterParagraphs[pIndex]!)
      assert.equal(rendered.split(expected!).length - 1, 1, 'G04 delivery appears once in its original source paragraph')
      assert.equal(afterParagraphs.reduce((count, paragraph) => count + extractCanonicalParagraphText(paragraph).split(expected!).length - 1, 0), 1, 'G04 delivery has one occurrence in the FINAL')
    }
  }

  return { caseId, sourceHash, outputPath, mappingCount: grounded.mappings.length, crossBreakCount: crossBreak.length, executedCount: execution.spanEdits.length, blocked }
}

async function main() {
  assert.equal(existsSync(outputDirectory), false, 'new offline verification directory is not overwritten')
  const scenarios = buildGoldenScenarios()
  mkdirSync(outputDirectory, { recursive: true })
  const results = []
  for (const id of ['G02', 'G03', 'G04'] as const) {
    const scenario = scenarios.find((item) => item.caseId === id)!
    results.push(await replay(id, scenario))
  }
  assert.equal(results.reduce((sum, item) => sum + item.crossBreakCount, 0), 12, 'all twelve fresh anchors are structurally grounded')
  writeFileSync(join(outputDirectory, 'RUN_SUMMARY.json'), JSON.stringify({ providerCalls: 0, results }, null, 2))
  for (const result of results) console.log(JSON.stringify(result))
  console.log(JSON.stringify({ crossBreakGrounded: 12, executed: results.reduce((sum, item) => sum + item.executedCount, 0), blocked: results.flatMap((item) => item.blocked), providerCalls: 0, outputDirectory }))
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
