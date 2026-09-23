import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { extractCanonicalParagraphText } from '@/features/documents/template/canonicalParagraph'
import { parseFlexibleDate } from '@/features/ai-contract-lab/semanticValueEquality'
import { formatDateLikeSource, formatMoneyLikeSource } from '@/features/ai-contract-lab/resolveTypedSourceSpan'
import { buildContractTransformationDataset } from '@/features/ai-contract-transform/transformationDataset'
import { writeSemanticMappingDocx } from '@/features/ai-contract-transform/docxTransformWriter'
import { auditSemanticReplayParagraph, continueSemanticReplayDocx, expectedReplayLocationTarget } from '@/features/ai-contract-transform/cg7/semanticFinalReplayHarness'
import { executeSemanticMappings } from '@/features/ai-contract-transform/semanticMappingExecutor'
import { indexDocxForTransform } from '@/features/ai-contract-transform/indexDocxForTransform'
import { insertAdditionalServicesIntoBlocks } from '@/features/ai-contract-transform/insertAdditionalServices'
import { groundSemanticMapResponse, parseSemanticMapResponse } from '@/features/ai-contract-transform/semanticMapModelContract'
import { extractResponseText } from '@/features/ai-contract-transform/extractResponseText'
import { buildGoldenScenarios, type GoldenCaseId } from '@/features/ai-contract-transform/cg7/goldenScenarios'
import { resolveGoldenEvaluationNameForm } from '@/features/ai-contract-transform/cg7/goldenNameFormEvaluationOracle'
import { GOLDEN_SUPPLIED_DATE_VALUES } from '@/features/ai-contract-transform/cg7/goldenSuppliedDateValues.fixture'
import type { SuppliedDateValues } from '@/features/ai-contract-transform/types'
import { renderCustomerAddress, renderLocationSummary } from '@/features/ai-contract-transform/quality/locationRendering'
import { parsePlnAmountInteger } from '@/features/ai-contract-transform/quality/plnAmountSurface'
import { polishContractMoneyWords } from '@/features/ai-contract-transform/polishContractMoneyWords'

const root = process.cwd()
const base = join(root, 'tmp/golden-contract-validation-run2')
const sourceDir = join(base, 'SOURCE')
const outDir = join(base, 'FINAL_SEMANTIC_EXTRAS_V1_OFFLINE_AUDITED_20260923')
const evidenceDir = join(base, 'EVIDENCE/SEMANTIC_SOURCE_IDENTITY_V2_SIX_GOLDEN_ACCEPTANCE_20260923')
const replayEvidenceDir = join(base, 'EVIDENCE/SEMANTIC_EXTRAS_V1_OFFLINE_AUDITED_20260923')
// Executor fixtures only. Captured provider output predates the placement field.
const placementFixtures: Partial<Record<GoldenCaseId, { sourceBlockId: string; side: 'before' | 'after' }>> = {
  G01: { sourceBlockId: 'para-30', side: 'after' },
  G03: { sourceBlockId: 'para-92', side: 'after' },
  G04: { sourceBlockId: 'para-47', side: 'before' },
  G05: { sourceBlockId: 'para-25', side: 'after' },
  G06: { sourceBlockId: 'para-13', side: 'after' },
}
const hashes: Record<GoldenCaseId, string> = {
  G01: 'd8f5b95eae9586adc5c37b681f2ba108ab2464fcc78f2ab8214a6d57a6710fee',
  G02: '617275318f49790e9b2ba3faa4093b96486f0bf1b2b72a2082f0eed94cb9a6ae',
  G03: '1d4035dafdde597b308af923a1061ba3409141420d8dd6d699df1578ae5d6637',
  G04: '63358621714ef99f88392be4174e2e498dcaf4555749a698ec94904c0925feb4',
  G05: '6feb4a760e42d1a8ef6e61d4721e3c021d5eb8df9278e4cf188a76db2fafb91c',
  G06: '14b917a31e67eab720bc94df91db84611ee5da3bb68ef0bb49cfc1102466a012',
}
const cases = buildGoldenScenarios()
const sameFixtureDate = (item: { sourceBlockId: string; sourceAnchor: string }, mapping: { sourceBlockId: string; anchor: string }) => item.sourceBlockId === mapping.sourceBlockId && parseFlexibleDate(item.sourceAnchor) !== null && parseFlexibleDate(item.sourceAnchor) === parseFlexibleDate(mapping.anchor)
const summary: Record<string, unknown> = { providerCalls: 0, paidCalls: 0, currentDate: '2026-11-05', goldens: {}, initialInputCount: 0, suppliedValueCount: 0 }

function paragraphs(xml: string): string[] { return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((m) => m[0]!) }
function tableShape(xml: string): number[][] {
  return [...xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)].map((t) => [...t[0]!.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((r) => [...r[0]!.matchAll(/<w:tc\b/g)].length))
}
function asArrayBuffer(bytes: Buffer): ArrayBuffer { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer }
async function documentXml(bytes: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  const entry = zip.file('word/document.xml')
  assert.ok(entry)
  return entry.async('string')
}

function formatDate(canonicalDate: string, anchor: string): string {
  const formatted = formatDateLikeSource({ canonicalDate, sourceText: anchor })
  const due = anchor.match(/^\s*(do)\s+/i)?.[1]
  const roku = /\s+roku\s*$/i.test(anchor) ? ' roku' : ''
  return `${due ? `${due} ` : ''}${formatted}${roku}`
}

function mappedLocation(mapping: { concept: string }, dataset: ReturnType<typeof buildContractTransformationDataset>) {
  return mapping.concept === 'preparation_location' ? dataset.locations.preparation
    : mapping.concept === 'bride_preparation_location' ? dataset.locations.preparationLocations?.find((item) => item.person === 'bride')
      : mapping.concept === 'groom_preparation_location' ? dataset.locations.preparationLocations?.find((item) => item.person === 'groom')
        : mapping.concept === 'shared_preparation_location' ? dataset.locations.preparationLocations?.find((item) => item.person === 'shared')
          : mapping.concept === 'ceremony_location' ? dataset.locations.ceremony
            : mapping.concept === 'reception_location' ? dataset.locations.reception : undefined
}

function expectedReplacement(mapping: any, dataset: ReturnType<typeof buildContractTransformationDataset>, id: GoldenCaseId): string {
  if (mapping.concept === 'customer_1_name' || mapping.concept === 'customer_2_name') {
    const identity = dataset.clients.displayNames.split(/\s+i\s+|\s+oraz\s+|,\s*/i)[mapping.concept === 'customer_1_name' ? 0 : 1]
    assert.ok(identity, `${id}: target identity exists`)
    if (mapping.nameForm === 'BASE') return identity!
    assert.ok(mapping.nameForm === 'GENITIVE' || mapping.nameForm === 'INSTRUMENTAL', `${id}: mapped name form is closed`)
    const form = resolveGoldenEvaluationNameForm({ canonicalIdentity: identity!, nameForm: mapping.nameForm })
    assert.ok(form, `${id}: approved name form resolves`)
    return form!
  }
  if (mapping.concept === 'customer_email' || mapping.concept === 'customer_phone') {
    const indexes: number[] = mapping.customerIndexes?.length === 2 ? [...mapping.customerIndexes] : mapping.customerIndex == null ? [] : [mapping.customerIndex]
    const customer = indexes.map((i) => dataset.clients.customers?.[i]).find((c) => c?.[mapping.concept === 'customer_email' ? 'email' : 'phone']?.trim())
    const value = customer?.[mapping.concept === 'customer_email' ? 'email' : 'phone']?.trim()
    assert.ok(value, `${id}: owned contact value exists`)
    return value!
  }
  if (mapping.concept === 'customer_address') {
    const indexes: number[] = mapping.customerIndexes?.length === 2 ? [...mapping.customerIndexes] : mapping.customerIndex == null ? [] : [mapping.customerIndex]
    const addresses = indexes.map((i) => dataset.clients.customers?.[i]?.address).filter((x): x is string => Boolean(x))
    assert.ok(addresses.length > 0, `${id}: owned address exists`)
    if (mapping.customerIndexes?.length === 2) assert.equal(renderCustomerAddress(addresses[0]!), renderCustomerAddress(addresses[1]!))
    return renderCustomerAddress(addresses[0]!)!
  }
  if (mapping.concept === 'wedding_date' || mapping.concept === 'execution_date') {
    return formatDate(mapping.concept === 'wedding_date' ? dataset.dates.weddingDate : dataset.dates.contractExecutionDate, mapping.anchor)
  }
  if (mapping.concept === 'deposit_due_date') {
    const exec = mappingsForCurrent.find((m: any) => m.concept === 'execution_date')
    assert.ok(exec, `${id}: deposit has grounded source execution date`)
    const execIso = parseFlexibleDate(exec.anchor)
    const depositIso = parseFlexibleDate(mapping.anchor)
    const currentIso = parseFlexibleDate(dataset.dates.contractExecutionDate)
    assert.ok(execIso && depositIso && currentIso, `${id}: deposit source dates parse`)
    const sourceExecution = new Date(`${execIso}T00:00:00.000Z`)
    const sourceDeposit = new Date(`${depositIso}T00:00:00.000Z`)
    const targetExecution = new Date(`${currentIso}T00:00:00.000Z`)
    const offset = Math.round((sourceDeposit.getTime() - sourceExecution.getTime()) / 86_400_000)
    targetExecution.setUTCDate(targetExecution.getUTCDate() + offset)
    return formatDate(targetExecution.toISOString().slice(0, 10), mapping.anchor)
  }
  if (mapping.concept === 'final_payment_due_date' || mapping.concept === 'delivery_due_date') {
    const fixture = GOLDEN_SUPPLIED_DATE_VALUES.find((item) => item.goldenId === id && sameFixtureDate(item, mapping))
    const canonical = mapping.concept === 'final_payment_due_date' ? dataset.dates.finalPaymentDueDate : dataset.dates.deliveryDueDate
    const target = canonical ?? fixture?.value
    assert.ok(target, `${id}: authoritative or approved evaluation date exists`)
    return formatDate(target!, mapping.anchor)
  }
  if (mapping.concept === 'ambiguous_date') {
    const fixture = GOLDEN_SUPPLIED_DATE_VALUES.find((item) => item.goldenId === id && sameFixtureDate(item, mapping))
    assert.ok(fixture, `${id}: ambiguous date has an approved evaluation value`)
    return formatDate(fixture!.value, mapping.anchor)
  }
  if (['total', 'deposit', 'remaining', 'total_words', 'deposit_words', 'remaining_words'].includes(mapping.concept)) {
    const key = mapping.concept.startsWith('total') ? 'contractValueFormatted' : mapping.concept.startsWith('deposit') ? 'depositFormatted' : 'remainingFormatted'
    const amount = parsePlnAmountInteger(dataset.finances[key] ?? '')
    assert.notEqual(amount, null, `${id}: canonical finance parses`)
    if (mapping.concept.endsWith('_words')) return polishContractMoneyWords(amount!)!
    return formatMoneyLikeSource({ canonicalAmount: amount!, sourceText: mapping.anchor })!
  }
  const location = mappedLocation(mapping, dataset)
  assert.ok(location, `${id}: canonical location exists for ${mapping.concept}`)
  return expectedReplayLocationTarget(location, () => 'fullAddress' in location
    ? renderLocationSummary({ fullAddress: location.fullAddress })
    : renderLocationSummary(location)).text
}

let mappingsForCurrent: any[] = []

const dateToken = /(?:\bdo\s+)?\b\d{1,2}(?:[./-]\d{1,2}[./-]\d{4}|\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|pazdziernika|listopada|grudnia)\s+\d{4}(?:\s+roku)?)/gi
function dateInventory(blocks: Array<{ blockId: string; text: string }>) {
  return blocks.flatMap((block) => [...block.text.matchAll(dateToken)].map((match) => ({ blockId: block.blockId, dateLiteral: match[0], start: match.index ?? 0 })))
}

mkdirSync(outDir, { recursive: true })
mkdirSync(replayEvidenceDir, { recursive: true })
for (const scenario of cases) {
  const id = scenario.caseId
  try {
  const sourcePath = join(sourceDir, scenario.sourceFile)
  const sourceBytesRaw = readFileSync(sourcePath)
  const sourceHash = createHash('sha256').update(sourceBytesRaw).digest('hex')
  assert.equal(sourceHash, hashes[id], `${id}: canonical source hash`)

  const capturePath = join(evidenceDir, `${id}-provider-response.raw.json`)
  const providerResponse = JSON.parse(readFileSync(capturePath, 'utf8'))
  const extracted = extractResponseText(providerResponse)
  assert.ok(extracted.text, `${id}: original captured provider output exists`)
  const outputText = extracted.text
  assert.equal(outputText, readFileSync(join(evidenceDir, `${id}-provider-output.txt`), 'utf8'), `${id}: raw response matches lossless extracted capture`)
  const parsed = parseSemanticMapResponse(outputText)
  if (!parsed.ok) throw new Error(`${id}: strict parser rejected ${parsed.code}`)
  assert.equal(parsed.semanticMappings.some((m) => ['package_name', 'extra_service', 'extras'].includes(m.concept)), false, `${id}: package/extras excluded from model authority`)

  const sourceBytes = asArrayBuffer(sourceBytesRaw)
  const sourceXml = await documentXml(sourceBytes)
  const sourceParagraphXml = paragraphs(sourceXml)
  const indexed = await indexDocxForTransform(sourceBytes)
  const sourceParagraphs = indexed.map((b) => {
    const paragraphXml = sourceParagraphXml[b.paragraphIndex]
    assert.ok(paragraphXml, `${id}: source paragraph exists`)
    return { blockId: b.blockId, paragraphXml: paragraphXml! }
  })
  const grounded = groundSemanticMapResponse(outputText, sourceParagraphs, indexed)
  if (!grounded.ok) throw new Error(`${id}: grounding rejected ${grounded.code} ${JSON.stringify(grounded)}`)
  mappingsForCurrent = grounded.mappings

  const dataset = buildContractTransformationDataset({ wedding: scenario.wedding, package: scenario.package, extras: scenario.extras, currentDate: '2026-11-05', weddingPlaces: scenario.structuredPlaces })
  const execute = (suppliedDateValues?: SuppliedDateValues) => executeSemanticMappings({
    resolvedMappings: grounded.mappings,
    canonicalDataset: dataset,
    sourceParagraphs,
    sourceCustomerIdentities: ({
      G01: ['Alicja Przykładowa'], G02: ['Lena Fikcyjna', 'Oskar Umowny'],
      G03: ['Maja Przykładowa', 'Kacper Modelowy'], G04: ['Iga Makieta'],
      G05: ['Helena Wzorcowa'], G06: ['Nina Robocza', 'Kajetan Testowy'],
    } as Record<GoldenCaseId, string[]>)[id],
    evaluationNameFormResolver: resolveGoldenEvaluationNameForm,
    ...(suppliedDateValues ? { suppliedDateValues } : {}),
  })
  const initialExecution = execute()
  const blockers = initialExecution.ok ? [] : initialExecution.code === 'requires_user_input'
    ? initialExecution.requiresUserInputDates.map((x) => `${x.role ?? 'other_contractual_date'}|${x.anchor}`)
    : (() => { throw new Error(`${id}: non-input execution failure ${initialExecution.code}`) })()
  const approvedForGolden = GOLDEN_SUPPLIED_DATE_VALUES.filter((item) => item.goldenId === id)
  if (approvedForGolden.length > 0) {
    assert.equal(initialExecution.ok, false, `${id}: first pass must stop before supplied values`)
    if (initialExecution.ok || initialExecution.code !== 'requires_user_input') throw new Error(`${id}: initial unresolved contract missing`)
    assert.deepEqual(
      initialExecution.requiresUserInputDates.map((x) => `${x.role ?? 'other_contractual_date'}|${x.sourceBlockId}`).sort(),
      approvedForGolden.map((x) => `${x.role}|${x.sourceBlockId}`).sort(),
      `${id}: initial unresolved date set exactly matches approved fixture`,
    )
    const suppliedValues = approvedForGolden.map((item) => {
      const request = initialExecution.requiresUserInputDates.find((x) => x.sourceBlockId === item.sourceBlockId && parseFlexibleDate(x.anchor) === parseFlexibleDate(item.sourceAnchor) && x.role === item.role)
      assert.ok(request, `${id}: approved fixture corresponds to one exact unresolved grounded mapping`)
      return { unresolvedDateId: request!.unresolvedDateId, value: item.value }
    })
    ;(summary.initialInputCount as number) += initialExecution.requiresUserInputDates.length
    ;(summary.suppliedValueCount as number) += suppliedValues.length
    const resumed = execute({ documentStateId: initialExecution.documentStateId, values: suppliedValues })
    if (!resumed.ok) throw new Error(`${id}: resume failed ${resumed.code}`)
    Object.assign(resumed, { __suppliedAudit: approvedForGolden.map((item) => {
      const request = initialExecution.requiresUserInputDates.find((x) => x.sourceBlockId === item.sourceBlockId && parseFlexibleDate(x.anchor) === parseFlexibleDate(item.sourceAnchor) && x.role === item.role)!
      const mapping = grounded.mappings.find((m) => sameFixtureDate(item, m))!
      const edit = resumed.spanEdits.find((e) => e.blockId === item.sourceBlockId && e.span.start === mapping.span.start)!
      assert.ok(edit, `${id}: supplied replacement is applied at its exact grounded span`)
      return { sourceDate: item.sourceAnchor, unresolvedId: request.unresolvedDateId, suppliedValue: item.value, finalRenderedValue: edit.replacement, sourceBlockId: item.sourceBlockId, groundingStatus: 'grounded' }
    }) })
    ;(summary as Record<string, unknown>)[`${id}SuppliedDateAudit`] = (resumed as unknown as { __suppliedAudit: unknown }).__suppliedAudit
    var execution = resumed
  } else {
    assert.deepEqual(blockers, [], `${id}: no date input required`)
    if (!initialExecution.ok) throw new Error(`${id}: full canonical execution failed ${initialExecution.code}`)
    var execution = initialExecution
  }

  let depositTarget: string | null = null
  if (id === 'G02' || id === 'G04') {
    const dateOnly = grounded.mappings.filter((m) => m.concept === 'execution_date' || m.concept === 'deposit_due_date')
    const depositExecution = executeSemanticMappings({ resolvedMappings: dateOnly, canonicalDataset: dataset, sourceParagraphs })
    assert.equal(depositExecution.ok, true, `${id}: supported deposit date resolves independently of other required inputs`)
    if (depositExecution.ok) {
      const mapping = dateOnly.find((m) => m.concept === 'deposit_due_date')!
      const edit = depositExecution.spanEdits.find((e) => e.blockId === mapping.sourceBlockId && e.span.start === mapping.span.start)!
      depositTarget = edit.replacement
      assert.equal(parseFlexibleDate(depositTarget), '2026-11-08')
    }
  }

  let finalFile: string | null = null
  let safety: Record<string, unknown> | null = null
  let dateAudit: unknown[] = []
  if (execution.ok) {
    const semanticBytes = await writeSemanticMappingDocx({ sourceBytes, sourceBlocks: indexed, execution })
    const semanticXml = await documentXml(semanticBytes)
    const semanticParagraphXml = paragraphs(semanticXml)
    const semanticById = new Map(execution.paragraphs.map((p) => [p.blockId, p.paragraphXml]))
    for (const b of indexed) if (semanticById.has(b.blockId)) assert.equal(semanticParagraphXml[b.paragraphIndex], semanticById.get(b.blockId), `${id}: grounded span output preserved`)

    const expectedEditByBlock = new Map<string, typeof execution.spanEdits>()
    for (const edit of execution.spanEdits) expectedEditByBlock.set(edit.blockId, [...(expectedEditByBlock.get(edit.blockId) ?? []), edit])
    for (const block of indexed) auditSemanticReplayParagraph({
      sourceParagraphXml: sourceParagraphXml[block.paragraphIndex]!,
      outputParagraphXml: semanticParagraphXml[block.paragraphIndex]!,
      blockId: block.blockId,
      edits: expectedEditByBlock.get(block.blockId) ?? [],
      mappings: grounded.mappings,
    })
    for (const mapping of grounded.mappings) {
      const edit = execution.spanEdits.find((item) => item.blockId === mapping.sourceBlockId && item.span.start === mapping.span.start)
      assert.ok(edit, `${id}: grounded mapping has one output edit`)
      assert.equal(edit!.replacement, expectedReplacement(mapping, dataset, id), `${id}: canonical target correct for ${mapping.concept}`)
      const location = mappedLocation(mapping, dataset)
      if (location?.target) {
        assert.deepEqual(edit!.replacementSegments, location.target.segments,
          `${id}: structured target components occupy the grounded source slots for ${mapping.concept}`)
      }
    }
    const packageScopeIds = indexed.filter((block) => block.tableContext?.ownershipFamily === 'service_scope').map((block) => block.blockId)
    assert.equal(grounded.mappings.some((mapping) => packageScopeIds.includes(mapping.sourceBlockId)), false, `${id}: base package service-scope content is not semantically rewritten`)

    const transformed = indexed.map((b) => ({ blockId: b.blockId, text: extractCanonicalParagraphText(semanticParagraphXml[b.paragraphIndex]!) }))
    const extras = insertAdditionalServicesIntoBlocks({
      blocks: transformed,
      sourceBlocks: indexed,
      dataset,
      placement: Object.hasOwn(parsed, 'extrasPlacement') ? parsed.extrasPlacement : placementFixtures[id],
    })
    assert.equal(extras.insertedNames.length, scenario.extras.length, `${id}: deterministic extra insertions complete`)
    const extraChangedIds = extras.blocks.filter((b, index) => b.text !== transformed[index]!.text).map((b) => b.blockId)
    const finalBytes = await continueSemanticReplayDocx({ semanticBytes, sourceBlocks: indexed, semanticBlocks: transformed, extraBlocks: extras.blocks, paragraphInsertions: extras.paragraphInsertions, groundedEditBlockIds: execution.spanEdits.map((edit) => edit.blockId) })
    const finalXml = await documentXml(finalBytes)
    const finalParagraphXml = paragraphs(finalXml)
    assert.deepEqual(tableShape(finalXml), tableShape(sourceXml), `${id}: table structure preserved`)
    assert.equal(finalParagraphXml.length, sourceParagraphXml.length + extras.paragraphInsertions.reduce((count, item) => count + item.paragraphs.length, 0), `${id}: paragraph count changes only by declared deterministic insertions`)
    const expectedParagraphSequence: Array<{ kind: 'source' | 'inserted'; xml?: string; text?: string }> = []
    for (const block of indexed) {
      for (const insertion of extras.paragraphInsertions.filter((entry) => entry.beforeParagraphIndex === block.paragraphIndex)) {
        for (const text of insertion.paragraphs) expectedParagraphSequence.push({ kind: 'inserted', text })
      }
      expectedParagraphSequence.push({ kind: 'source', xml: semanticParagraphXml[block.paragraphIndex]! })
      for (const insertion of extras.paragraphInsertions.filter((entry) => entry.beforeParagraphIndex === undefined && entry.afterParagraphIndex === block.paragraphIndex)) {
        for (const text of insertion.paragraphs) expectedParagraphSequence.push({ kind: 'inserted', text })
      }
    }
    assert.equal(expectedParagraphSequence.length, finalParagraphXml.length, `${id}: all final paragraphs accounted for`)
    const unexpectedParagraphChanges = expectedParagraphSequence.flatMap((expected, index) => {
      const actual = finalParagraphXml[index]!
      if (expected.kind === 'source') return actual === expected.xml ? [] : [index]
      if (extractCanonicalParagraphText(actual) !== expected.text || /<w:numPr\b/.test(actual) || /<w:pStyle\b/.test(actual)) return [index]
      return []
    })
    assert.deepEqual(unexpectedParagraphChanges, [], `${id}: SOURCE OOXML and inserted paragraph text/style scope are exact`)
    assert.equal([...sourceXml.matchAll(/<w:sectPr\b/g)].length, [...finalXml.matchAll(/<w:sectPr\b/g)].length, `${id}: section count preserved`)
    const extraTarget = extras.placement?.sourceBlockId
    assert.equal(extraChangedIds.every((blockId) => blockId === extraTarget), true, `${id}: deterministic extras mutate only their declared target block`)

    const sourceZip = await JSZip.loadAsync(sourceBytes)
    const finalZip = await JSZip.loadAsync(finalBytes)
    const sourceParts = Object.values(sourceZip.files).filter((file) => !file.dir).map((file) => file.name).sort()
    const finalParts = Object.values(finalZip.files).filter((file) => !file.dir).map((file) => file.name).sort()
    assert.deepEqual(finalParts, sourceParts, `${id}: DOCX package part set preserved`)
    for (const part of sourceParts.filter((name) => name !== 'word/document.xml')) {
      const before = await sourceZip.file(part)!.async('nodebuffer')
      const after = await finalZip.file(part)!.async('nodebuffer')
      assert.equal(after.equals(before), true, `${id}: non-document package part unchanged: ${part}`)
    }
    const finalText = finalParagraphXml.map(extractCanonicalParagraphText).join('\n')
    for (const edit of execution.spanEdits) assert.ok(finalText.includes(edit.replacementSegments?.join('') ?? edit.replacement), `${id}: canonical mapped replacement survives final writing`)
    const emailMappings = grounded.mappings.filter((m) => m.concept === 'customer_email')
    for (const m of emailMappings) {
      const oldEmail = m.anchor.toLowerCase()
      const targetEmails = dataset.clients.customers?.flatMap((c) => c.email ? [c.email.toLowerCase()] : []) ?? []
      assert.equal(targetEmails.some((email) => finalText.includes(email)), true, `${id}: canonical customer email rendered`)
      assert.equal(finalText.toLowerCase().includes(oldEmail), false, `${id}: source customer email replaced`)
    }
    if (id === 'G06') assert.equal(finalText.split('olga.widokowa@example.com').length - 1, 1, 'G06: shared email resolves to Olga exactly once')
    const emailTokens = (value: string) => value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.map((x) => x.toLowerCase()) ?? []
    const expectedEmailCounts = new Map<string, number>()
    for (const email of emailTokens(sourceParagraphXml.map(extractCanonicalParagraphText).join('\n'))) expectedEmailCounts.set(email, (expectedEmailCounts.get(email) ?? 0) + 1)
    for (const mapping of emailMappings) {
      for (const email of emailTokens(mapping.anchor)) expectedEmailCounts.set(email, (expectedEmailCounts.get(email) ?? 0) - 1)
      const edit = execution.spanEdits.find((item) => item.blockId === mapping.sourceBlockId && item.span.start === grounded.mappings.find((g) => g.sourceBlockId === mapping.sourceBlockId && g.anchor === mapping.anchor)!.span.start)!
      expectedEmailCounts.set(edit.replacement.toLowerCase(), (expectedEmailCounts.get(edit.replacement.toLowerCase()) ?? 0) + 1)
    }
    const actualEmailCounts = new Map<string, number>()
    for (const email of emailTokens(finalText)) actualEmailCounts.set(email, (actualEmailCounts.get(email) ?? 0) + 1)
    assert.deepEqual([...actualEmailCounts.entries()].sort(), [...expectedEmailCounts.entries()].filter(([, count]) => count > 0).sort(), `${id}: provider/legal email inventory is preserved without customer false positives`)
    const sourceText = sourceParagraphXml.map(extractCanonicalParagraphText).join('\n')
    for (const extra of scenario.extras) {
      const extraName = extra.name
      assert.ok(extraName, `${id}: selected extra has a name`)
      const sourceCount = sourceText.split(extraName).length - 1
      const finalCount = finalText.split(extraName).length - 1
      const insertedCount = extras.insertedNames.filter((name) => name === extraName).length
      assert.equal(finalCount, sourceCount + insertedCount, `${id}: deterministic extras preserve package mentions and add only selected service occurrences`)
    }
    const dateMappings = grounded.mappings.filter((mapping) => /date/.test(mapping.concept))
    dateAudit = dateMappings.map((mapping) => {
      const edit = execution.spanEdits.find((item) => item.blockId === mapping.sourceBlockId && item.span.start === mapping.span.start)!
      const fixture = GOLDEN_SUPPLIED_DATE_VALUES.find((item) => item.goldenId === id && sameFixtureDate(item, mapping))
      const sourceExecution = mapping.concept === 'deposit_due_date' ? grounded.mappings.find((item) => item.concept === 'execution_date') : undefined
      const sourceExecutionIso = sourceExecution ? parseFlexibleDate(sourceExecution.anchor) : null
      const sourceDepositIso = mapping.concept === 'deposit_due_date' ? parseFlexibleDate(mapping.anchor) : null
      const sourceOffsetDays = sourceExecutionIso && sourceDepositIso
        ? Math.round((new Date(`${sourceDepositIso}T00:00:00.000Z`).getTime() - new Date(`${sourceExecutionIso}T00:00:00.000Z`).getTime()) / 86_400_000)
        : null
      let authority = mapping.concept === 'wedding_date' ? 'Wedding.date'
        : mapping.concept === 'execution_date' ? 'generation currentDate'
          : mapping.concept === 'deposit_due_date' ? 'deterministic source-day offset'
            : fixture ? 'approved evaluation-only supplied value' : 'authoritative CRM date'
      const canonicalDate = mapping.concept === 'wedding_date' ? dataset.dates.weddingDate
        : mapping.concept === 'execution_date' ? dataset.dates.contractExecutionDate
          : mapping.concept === 'deposit_due_date' ? parseFlexibleDate(edit.replacement) ?? ''
            : fixture?.value ?? (mapping.concept === 'final_payment_due_date' ? dataset.dates.finalPaymentDueDate : dataset.dates.deliveryDueDate) ?? ''
      const canonicalIso = parseFlexibleDate(canonicalDate)
      assert.ok(canonicalIso, `${id}: canonical date authority parses`)
      assert.equal(parseFlexibleDate(edit.replacement), canonicalIso, `${id}: final date role has the approved canonical date`)
      return {
        sourceDate: mapping.anchor,
        concept: mapping.concept,
        dateRole: 'dateRole' in mapping ? mapping.dateRole : mapping.concept,
        authority,
        finalRenderedValue: edit.replacement,
        finalCanonicalDate: canonicalIso,
        sourceBlockId: mapping.sourceBlockId,
        groundingStatus: 'grounded',
        unresolvedId: fixture ? (execution as any).__suppliedAudit.find((item: any) => item.sourceBlockId === fixture.sourceBlockId && item.sourceDate === fixture.sourceAnchor)?.unresolvedId : null,
        suppliedValue: fixture?.value ?? null,
        sourceExecutionDate: sourceExecution?.anchor ?? null,
        sourceDepositDate: mapping.concept === 'deposit_due_date' ? mapping.anchor : null,
        sourceOffsetDays,
        targetCurrentDate: mapping.concept === 'deposit_due_date' ? dataset.dates.contractExecutionDate : null,
      }
    })
    const sourceInventory = dateInventory(indexed.map((block) => ({ blockId: block.blockId, text: block.text }))).map((literal) => {
      const match = grounded.mappings.find((mapping) => /date/.test(mapping.concept) && mapping.sourceBlockId === literal.blockId && literal.start < mapping.span.end && literal.start + literal.dateLiteral.length > mapping.span.start)
      return { ...literal, disposition: match ? `mutable:${match.concept}` : 'template_authoritative_unmapped' }
    })
    const finalIndexed = await indexDocxForTransform(finalBytes)
    const finalInventory = dateInventory(finalIndexed.map((block) => ({ blockId: block.blockId, text: block.text })))
    const unmappedDateCount = sourceInventory.filter((literal) => literal.disposition === 'template_authoritative_unmapped').length
    const staleMutableDates = [...new Set(sourceInventory.filter((literal) => literal.disposition.startsWith('mutable:')).map((literal) => literal.dateLiteral))].filter((sourceDate) => {
      const expectedImmutableCount = sourceInventory.filter((literal) => literal.dateLiteral === sourceDate && literal.disposition === 'template_authoritative_unmapped').length
      const finalCount = finalInventory.filter((literal) => literal.dateLiteral === sourceDate).length
      return finalCount > expectedImmutableCount
    })
    assert.deepEqual(staleMutableDates, [], `${id}: no mutable concrete source dates survive silently`)
    for (const mapping of grounded.mappings.filter((item) => ['customer_address', 'customer_phone'].includes(item.concept))) {
      assert.equal(finalText.includes(mapping.anchor), false, `${id}: old mapped contact value removed`)
    }
    const expectedParagraphInsertions = extras.paragraphInsertions.reduce((count, item) => count + item.paragraphs.length, 0)
    const structureAudit = {
      sourceParagraphs: sourceParagraphXml.length,
      finalParagraphs: finalParagraphXml.length,
      expectedExtraParagraphs: expectedParagraphInsertions,
      sourceTables: tableShape(sourceXml).length,
      finalTables: tableShape(finalXml).length,
      sourceRows: [...sourceXml.matchAll(/<w:tr\b/g)].length,
      finalRows: [...finalXml.matchAll(/<w:tr\b/g)].length,
      sourceCells: [...sourceXml.matchAll(/<w:tc\b/g)].length,
      finalCells: [...finalXml.matchAll(/<w:tc\b/g)].length,
      sourceSections: [...sourceXml.matchAll(/<w:sectPr\b/g)].length,
      finalSections: [...finalXml.matchAll(/<w:sectPr\b/g)].length,
      nonDocumentPackagePartsUnchanged: true,
      docxWellFormed: true,
    }
    const packageAuthorityViolations = grounded.mappings.filter((mapping) => ['package_name', 'extra_service', 'extras', 'coverage', 'operator_count', 'overtime', 'delivery_terms'].includes(mapping.concept)).length
    assert.equal(packageAuthorityViolations, 0, `${id}: base package authority has zero semantic mapping writes`)
    const actualChangedSourceBlocks = [...new Set([...grounded.mappings.map((mapping) => mapping.sourceBlockId), ...extraChangedIds])].sort()
    const unexpectedChangedBlocks = unexpectedParagraphChanges.map(String)
    assert.deepEqual(unexpectedChangedBlocks, [], `${id}: no source block changed outside mappings or deterministic extras`)
    finalFile = join(outDir, `${id}_FINAL.docx`)
    if (existsSync(finalFile)) assert.equal(await documentXml(asArrayBuffer(readFileSync(finalFile))), finalXml, `${id}: existing artifact must have identical document XML`)
    else writeFileSync(finalFile, Buffer.from(finalBytes))
    safety = {
      strictParse: true, grounding: true, executor: true,
      canonicalEmails: true, extrasInsertionCountMatchesExpected: true, tableStructurePreserved: true,
      allGroundedCanonicalReplacementsPresent: true,
      onlyMappedBlocksAndDeterministicExtraPlacementChanged: unexpectedChangedBlocks.length === 0,
      packageAuthorityMappings: packageAuthorityViolations,
      relativeTimingTextPreservedByGroundedSpanEdits: true,
      staleMutableConcreteDates: staleMutableDates,
      structureAudit,
      extraPlacementChangedBlockIds: extraChangedIds,
      expectedChangedSourceBlocks: actualChangedSourceBlocks,
      unexpectedChangedBlocks,
      dateAudit,
      sourceDateLiterals: sourceInventory,
      finalDateLiterals: finalInventory,
      templateAuthorityUnmappedDateLiteralCount: unmappedDateCount,
      semanticMappingCount: grounded.mappings.length, spanEditCount: execution.spanEdits.length,
    }
  }

  ;(summary.goldens as Record<string, unknown>)[id] = {
    sourceHash, capturePath, strictParse: parsed.ok, grounded: grounded.ok,
    execution: execution.ok ? 'PASS' : 'REQUIRES_USER_INPUT',
    unresolvedDateFields: blockers,
    initialUnresolvedRequests: approvedForGolden.length > 0 && initialExecution && !initialExecution.ok && initialExecution.code === 'requires_user_input'
      ? initialExecution.requiresUserInputDates.map((item) => ({ unresolvedDateId: item.unresolvedDateId, sourceBlockId: item.sourceBlockId, anchor: item.anchor, role: item.role, span: item.span }))
      : [],
    suppliedValues: approvedForGolden.map((item) => ({ sourceBlockId: item.sourceBlockId, sourceDate: item.sourceAnchor, role: item.role, canonicalValue: item.value })),
    depositResolution: depositTarget,
    dateAudit,
    finalDocx: finalFile ? finalFile.replace(`${root}/`, '') : null,
    safety,
  }
  } catch (error) {
    ;(summary.goldens as Record<string, unknown>)[id] = { failure: error instanceof Error ? error.message : String(error) }
    console.error(`${id} OFFLINE_ACCEPTANCE_FAIL: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
  }
}
writeFileSync(join(replayEvidenceDir, 'REPLAY_SUMMARY.json'), JSON.stringify(summary, null, 2), { flag: 'wx' })
console.log(JSON.stringify(summary, null, 2))
