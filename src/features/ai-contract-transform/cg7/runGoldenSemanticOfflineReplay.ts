import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { extractCanonicalParagraphText } from '../../documents/template/canonicalParagraph'
import { formatDateLikeSource, formatMoneyLikeSource } from '@/features/ai-contract-lab/resolveTypedSourceSpan'
import { parsePlnAmountInteger } from '../quality/plnAmountSurface'
import { renderCustomerAddress, renderLocationSummary } from '../quality/locationRendering'
import { polishContractMoneyWords } from '../polishContractMoneyWords'
import { buildContractTransformationDataset } from '../transformationDataset'
import { writeSemanticMappingDocx } from '../docxTransformWriter'
import { executeSemanticMappings, type SemanticMappingExecutionResult } from '../semanticMappingExecutor'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { parseSemanticMapResponse } from '../semanticMapModelContract'
import { resolveSemanticMappings } from '../semanticMapping'
import { buildGoldenScenarios, type GoldenCaseId } from './goldenScenarios'
import { resolveGoldenEvaluationNameForm } from './goldenNameFormEvaluationOracle'

const root = process.cwd()
const runDirectory = join(root, 'tmp/golden-contract-validation-run2')
const sourceDirectory = join(runDirectory, 'SOURCE')
const evidenceDirectory = join(runDirectory, 'EVIDENCE/SEMANTIC_MAP_TERRA_FINAL_CONTRACT')
const outputDirectory = join(runDirectory, 'FINAL_SEMANTIC')
const expectedHashes: Record<GoldenCaseId, string> = {
  G01: 'd8f5b95eae9586adc5c37b681f2ba108ab2464fcc78f2ab8214a6d57a6710fee',
  G02: '617275318f49790e9b2ba3faa4093b96486f0bf1b2b72a2082f0eed94cb9a6ae',
  G03: '1d4035dafdde597b308af923a1061ba3409141420d8dd6d699df1578ae5d6637',
  G04: '63358621714ef99f88392be4174e2e498dcaf4555749a698ec94904c0925feb4',
  G05: '6feb4a760e42d1a8ef6e61d4721e3c021d5eb8df9278e4cf188a76db2fafb91c',
  G06: '14b917a31e67eab720bc94df91db84611ee5da3bb68ef0bb49cfc1102466a012',
}
const sourceCustomerIdentities: Record<GoldenCaseId, readonly string[]> = {
  G01: ['Alicja Przykładowa'],
  G02: ['Lena Fikcyjna', 'Oskar Umowny'],
  G03: ['Maja Przykładowa', 'Kacper Modelowy'],
  G04: ['Iga Makieta'],
  G05: ['Helena Wzorcowa'],
  G06: ['Nina Robocza', 'Kajetan Testowy'],
}

type ParsedEvidence = {
  parsedMappings: unknown[]
  protocolResult: { ok: boolean; strictSchemaParse: boolean }
  groundingResult: { ok: boolean; rawCount: number; normalizedCount: number }
  semanticCompleteness: {
    baselineExpectedCount: number
    correctCount: number
    incorrectCount: number
    missingCount: number
    unexpectedCount: number
    ownershipErrors: number
    nameFormErrors: number
    dateRoleErrors: number
    financeRoleErrors: number
    locationRoleErrors: number
    packageAuthorityViolations: number
  }
}

type ExecutedCase = {
  caseId: GoldenCaseId
  sourceHash: string
  outputPath: string
  sourceParagraphCount: number
  finalParagraphCount: number
  sourceTableCount: number
  finalTableCount: number
  tableDimensionsChanged: boolean
  mappedGroundedEdits: number
  unexpectedBlocksChanged: string[]
  mappingCount: number
  execution: SemanticMappingExecutionResult
  sourceXml: string
  finalXml: string
}

function paragraphs(xml: string): string[] {
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
}

function tableDimensions(xml: string): number[][] {
  return [...xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)].map((table) =>
    [...table[0]!.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((row) =>
      [...row[0]!.matchAll(/<w:tc\b/g)].length,
    ),
  )
}

function countTag(xml: string, tag: string): number {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s|>)`, 'g'))].length
}

async function readDocumentXml(bytes: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  const document = zip.file('word/document.xml')
  assert.ok(document, 'DOCX contains word/document.xml')
  return document.async('string')
}

function expectedReplacement(mapping: {
  concept: string
  anchor: string
  nameForm?: string
  customerIndex?: number | null
  customerIndexes?: readonly number[] | null
}, dataset: ReturnType<typeof buildContractTransformationDataset>, caseId: GoldenCaseId): string {
  if (mapping.concept === 'customer_1_name' || mapping.concept === 'customer_2_name') {
    const identity = dataset.clients.displayNames.split(/\s+i\s+|\s+oraz\s+|,\s*/i)[mapping.concept === 'customer_1_name' ? 0 : 1]
    assert.ok(identity, `${caseId} canonical customer identity exists`)
    if (mapping.nameForm === 'BASE') return identity
    const form = mapping.nameForm === 'GENITIVE' || mapping.nameForm === 'INSTRUMENTAL' ? mapping.nameForm : undefined
    assert.ok(form, `${caseId} name form is closed`)
    const resolved = resolveGoldenEvaluationNameForm({ canonicalIdentity: identity, nameForm: form! })
    assert.ok(resolved, `${caseId} approved name-form pair exists`)
    return resolved!
  }
  if (mapping.concept === 'customer_phone') {
    const customerIndex = mapping.customerIndexes?.length === 2 ? mapping.customerIndexes.find((index) => dataset.clients.customers?.[index]?.phone?.trim()) : mapping.customerIndex
    const phone = customerIndex == null ? undefined : dataset.clients.customers?.[customerIndex]?.phone?.trim()
    assert.ok(phone, `${caseId} mapped phone is present`)
    return phone!
  }
  if (mapping.concept === 'customer_address') {
    if (mapping.customerIndexes?.length === 2) {
      const first = dataset.clients.customers?.[0]?.address
      const second = dataset.clients.customers?.[1]?.address
      assert.ok(first && second && renderCustomerAddress(first) === renderCustomerAddress(second), `${caseId} shared addresses agree`)
      return renderCustomerAddress(first!)!
    }
    const address = dataset.clients.customers?.[mapping.customerIndex ?? -1]?.address
    assert.ok(address, `${caseId} mapped address exists`)
    return renderCustomerAddress(address!)!
  }
  if (mapping.concept === 'wedding_date' || mapping.concept === 'execution_date') {
    const canonical = mapping.concept === 'wedding_date' ? dataset.dates.weddingDate : dataset.dates.contractExecutionDate
    const formatted = formatDateLikeSource({ canonicalDate: canonical, sourceText: mapping.anchor })
    assert.ok(formatted, `${caseId} date renders`)
    return formatted!
  }
  if (['total', 'deposit', 'remaining', 'total_words', 'deposit_words', 'remaining_words'].includes(mapping.concept)) {
    const financeKey = mapping.concept.startsWith('total') ? 'contractValueFormatted' : mapping.concept.startsWith('deposit') ? 'depositFormatted' : 'remainingFormatted'
    const amount = parsePlnAmountInteger(dataset.finances[financeKey] ?? '')
    assert.notEqual(amount, null, `${caseId} finance amount parses`)
    if (mapping.concept.endsWith('_words')) return polishContractMoneyWords(amount!)!
    return formatMoneyLikeSource({ canonicalAmount: amount!, sourceText: mapping.anchor })!
  }
  const location = mapping.concept === 'preparation_location' ? dataset.locations.preparation
    : mapping.concept === 'bride_preparation_location' ? dataset.locations.preparationLocations?.find((item) => item.person === 'bride')
      : mapping.concept === 'groom_preparation_location' ? dataset.locations.preparationLocations?.find((item) => item.person === 'groom')
        : mapping.concept === 'shared_preparation_location' ? dataset.locations.preparationLocations?.find((item) => item.person === 'shared')
          : mapping.concept === 'ceremony_location' ? dataset.locations.ceremony
            : mapping.concept === 'reception_location' ? dataset.locations.reception : undefined
  assert.ok(location, `${caseId} mapped location role has canonical data: ${mapping.concept}`)
  const rendered = 'fullAddress' in location
    ? renderLocationSummary({ fullAddress: location.fullAddress })
    : renderLocationSummary(location)
  assert.ok(rendered, `${caseId} location renders`)
  return rendered!
}

async function executeCase(caseId: GoldenCaseId, scenario: ReturnType<typeof buildGoldenScenarios>[number]): Promise<ExecutedCase> {
  const sourcePath = join(sourceDirectory, scenario.sourceFile)
  const sourceBytesRaw = readFileSync(sourcePath)
  const sourceHash = createHash('sha256').update(sourceBytesRaw).digest('hex')
  assert.equal(sourceHash, expectedHashes[caseId], `${caseId} source hash matches accepted canonical hash`)
  const evidence = JSON.parse(readFileSync(join(evidenceDirectory, `${caseId}.json`), 'utf8')) as ParsedEvidence
  assert.equal(evidence.protocolResult.ok, true, `${caseId} accepted protocol valid`)
  assert.equal(evidence.protocolResult.strictSchemaParse, true, `${caseId} accepted strict schema parse`)
  assert.equal(evidence.groundingResult.ok, true, `${caseId} accepted grounding valid`)
  assert.equal(evidence.semanticCompleteness.correctCount, evidence.semanticCompleteness.baselineExpectedCount, `${caseId} all accepted mappings correct`)
  assert.equal(evidence.semanticCompleteness.incorrectCount, 0)
  assert.equal(evidence.semanticCompleteness.missingCount, 0)
  assert.equal(evidence.semanticCompleteness.unexpectedCount, 0)
  for (const [field, count] of Object.entries({
    ownershipErrors: evidence.semanticCompleteness.ownershipErrors,
    nameFormErrors: evidence.semanticCompleteness.nameFormErrors,
    dateRoleErrors: evidence.semanticCompleteness.dateRoleErrors,
    financeRoleErrors: evidence.semanticCompleteness.financeRoleErrors,
    locationRoleErrors: evidence.semanticCompleteness.locationRoleErrors,
    packageAuthorityViolations: evidence.semanticCompleteness.packageAuthorityViolations,
  })) assert.equal(count, 0, `${caseId} accepted semantic evidence has zero ${field}`)
  assert.equal(evidence.groundingResult.normalizedCount, evidence.semanticCompleteness.baselineExpectedCount, `${caseId} accepted grounded count matches expected count`)
  assert.equal(evidence.parsedMappings.length, evidence.semanticCompleteness.baselineExpectedCount, `${caseId} accepted parsed mapping count matches expected count`)
  assert.equal(evidence.parsedMappings.some((mapping) => {
    if (!mapping || typeof mapping !== 'object' || !('concept' in mapping)) return false
    return ['package_name', 'extra_service', 'extras'].includes(String(mapping.concept))
  }), false, `${caseId} package and extras remain outside semantic-map authority`)
  const parsed = parseSemanticMapResponse({ semanticMappings: evidence.parsedMappings })
  if (!parsed.ok) throw new Error(`${caseId} semantic mapping parse failed: ${parsed.code}`)

  const sourceBytes = sourceBytesRaw.buffer.slice(sourceBytesRaw.byteOffset, sourceBytesRaw.byteOffset + sourceBytesRaw.byteLength)
  const indexed = await indexDocxForTransform(sourceBytes)
  const sourceXml = await readDocumentXml(sourceBytes)
  const sourceParagraphXml = paragraphs(sourceXml)
  const sourceParagraphs = indexed.map(({ blockId, paragraphIndex }) => {
    const paragraphXml = sourceParagraphXml[paragraphIndex]
    assert.ok(paragraphXml, `${caseId} indexed source paragraph exists`)
    return { blockId, paragraphXml: paragraphXml! }
  })
  const grounded = resolveSemanticMappings({ mappings: parsed.semanticMappings, sourceBlocks: sourceParagraphs })
  if (!grounded.ok) throw new Error(`${caseId} grounding failed: ${grounded.code}`)
  const dataset = buildContractTransformationDataset({
    wedding: scenario.wedding,
    package: scenario.package,
    extras: scenario.extras,
    currentDate: '2026-09-22',
  })
  const execution = executeSemanticMappings({
    resolvedMappings: grounded.mappings,
    canonicalDataset: dataset,
    sourceParagraphs,
    sourceCustomerIdentities: sourceCustomerIdentities[caseId],
    evaluationNameFormResolver: resolveGoldenEvaluationNameForm,
  })
  if (!execution.ok) throw new Error(`${caseId} execution failed: ${execution.code} at mapping ${execution.mappingIndex}`)

  const mappedIds = new Set(execution.paragraphs.map((row) => row.blockId))
  const sourceById = new Map(sourceParagraphs.map((row) => [row.blockId, row.paragraphXml]))
  for (const mapping of grounded.mappings) {
    const edit: (typeof execution.spanEdits)[number] | undefined = execution.spanEdits.find((item) => item.blockId === mapping.sourceBlockId && item.span.start === mapping.span.start)
    assert.ok(edit, `${caseId} has an edit for every grounded mapping`)
    assert.equal(edit!.replacement, expectedReplacement(mapping, dataset, caseId), `${caseId} mapped value matches canonical semantics: ${mapping.concept}`)
  }
  for (const row of execution.paragraphs) {
    assert.notEqual(sourceById.get(row.blockId), undefined, `${caseId} edited block comes from source`)
  }
  const outputPath = join(outputDirectory, `${caseId}_FINAL_SEMANTIC.docx`)
  assert.equal(existsSync(outputPath), false, `${caseId} output will not overwrite a prior artifact`)
  const outputBytes = await writeSemanticMappingDocx({ sourceBytes, sourceBlocks: indexed, execution })
  writeFileSync(outputPath, Buffer.from(outputBytes))
  const finalBytesRaw = readFileSync(outputPath)
  const finalBytes = finalBytesRaw.buffer.slice(finalBytesRaw.byteOffset, finalBytesRaw.byteOffset + finalBytesRaw.byteLength)
  const finalXml = await readDocumentXml(finalBytes)
  const finalParagraphs = paragraphs(finalXml)
  assert.equal(finalParagraphs.length, sourceParagraphXml.length, `${caseId} paragraph count unchanged`)
  const finalIndexed = await indexDocxForTransform(finalBytes)
  assert.equal(finalIndexed.length, indexed.length, `${caseId} DOCX re-indexes to same paragraph block count`)
  const executedById = new Map(execution.paragraphs.map((row) => [row.blockId, row.paragraphXml]))
  const unexpectedBlocksChanged: string[] = []
  for (const block of indexed) {
    const before = sourceParagraphXml[block.paragraphIndex]!
    const after = finalParagraphs[block.paragraphIndex]!
    const expected = executedById.get(block.blockId) ?? before
    assert.equal(after, expected, `${caseId} paragraph equals exact grounded executor output or original XML: ${block.blockId}`)
    if (!mappedIds.has(block.blockId) && before !== after) unexpectedBlocksChanged.push(block.blockId)
  }
  assert.deepEqual(unexpectedBlocksChanged, [], `${caseId} has no changes outside mapped blocks`)
  assert.equal(countTag(sourceXml, 'w:tbl'), countTag(finalXml, 'w:tbl'), `${caseId} table count unchanged`)
  const sourceTables = tableDimensions(sourceXml)
  const finalTables = tableDimensions(finalXml)
  assert.deepEqual(finalTables, sourceTables, `${caseId} table dimensions unchanged`)
  assert.equal(countTag(sourceXml, 'w:tr'), countTag(finalXml, 'w:tr'), `${caseId} table row count unchanged`)
  assert.equal(countTag(sourceXml, 'w:tc'), countTag(finalXml, 'w:tc'), `${caseId} table cell count unchanged`)
  for (const [index, row] of execution.paragraphs.entries()) {
    const block = indexed.find((item) => item.blockId === row.blockId)!
    assert.equal(finalParagraphs[block.paragraphIndex], row.paragraphXml, `${caseId} writer preserves deterministic executor OOXML ${index}`)
  }

  if (caseId === 'G06') {
    const sharedAddressMapping = grounded.mappings.find((mapping) => mapping.concept === 'customer_address' && mapping.customerIndexes?.length === 2)
    const sharedPhoneMapping = grounded.mappings.find((mapping) => mapping.concept === 'customer_phone' && mapping.customerIndexes?.length === 2)
    assert.ok(sharedAddressMapping && sharedPhoneMapping, 'G06 contains jointly owned address and phone')
    const address = dataset.clients.customers![0]!.address!
    const phone = '+48 511 700 101'
    const addressText = extractCanonicalParagraphText(finalParagraphs[indexed.find((item) => item.blockId === sharedAddressMapping!.sourceBlockId)!.paragraphIndex]!)
    const phoneText = extractCanonicalParagraphText(finalParagraphs[indexed.find((item) => item.blockId === sharedPhoneMapping!.sourceBlockId)!.paragraphIndex]!)
    assert.ok(addressText.includes(renderCustomerAddress(address)!), 'G06 shared canonical address rendered')
    assert.equal(phoneText.split(phone).length - 1, 1, 'G06 shared phone renders customer 0 exactly once')
    assert.ok(!phoneText.includes(dataset.clients.customers![1]!.phone!), 'G06 shared phone does not combine customer 1 value')
  }

  return {
    caseId, sourceHash, outputPath,
    sourceParagraphCount: sourceParagraphXml.length,
    finalParagraphCount: finalParagraphs.length,
    sourceTableCount: sourceTables.length,
    finalTableCount: finalTables.length,
    tableDimensionsChanged: JSON.stringify(sourceTables) !== JSON.stringify(finalTables),
    mappedGroundedEdits: execution.spanEdits.length,
    unexpectedBlocksChanged,
    mappingCount: grounded.mappings.length,
    execution,
    sourceXml,
    finalXml,
  }
}

async function main() {
  assert.equal(existsSync(outputDirectory), false, 'final output directory must not exist; prior artifacts will not be overwritten')
  const scenarios = buildGoldenScenarios()
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.caseId, scenario]))
  const cases: GoldenCaseId[] = ['G01', 'G02', 'G03', 'G04', 'G05', 'G06']
  const sourceHashes: Record<string, string> = {}
  for (const caseId of cases) {
    const scenario = scenarioById.get(caseId)!
    const hash = createHash('sha256').update(readFileSync(join(sourceDirectory, scenario.sourceFile))).digest('hex')
    sourceHashes[caseId] = hash
    assert.equal(hash, expectedHashes[caseId], `${caseId} source integrity check; stop on mismatch`)
  }
  mkdirSync(outputDirectory)
  const results: ExecutedCase[] = []
  for (const caseId of cases) results.push(await executeCase(caseId, scenarioById.get(caseId)!))
  assert.equal(results.reduce((sum, item) => sum + item.mappingCount, 0), 90, 'all accepted mappings replayed')
  assert.equal(results.reduce((sum, item) => sum + item.mappedGroundedEdits, 0), 90, 'all accepted mappings executed once')
  for (const result of results) {
    console.log(JSON.stringify({
      caseId: result.caseId,
      execution: 'PASS',
      postWriteValidation: 'PASS',
      sourceHash: result.sourceHash,
      sourceParagraphCount: result.sourceParagraphCount,
      finalParagraphCount: result.finalParagraphCount,
      sourceTableCount: result.sourceTableCount,
      finalTableCount: result.finalTableCount,
      tableDimensionsChanged: result.tableDimensionsChanged,
      mappedGroundedEdits: result.mappedGroundedEdits,
      unexpectedBlocksChanged: result.unexpectedBlocksChanged,
      output: result.outputPath,
    }))
  }
  console.log(JSON.stringify({ totalAcceptedSemanticMappings: 90, totalExecutedGroundedEdits: 90, providerCalls: 0, outputDirectory }))
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
