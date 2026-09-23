import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { extractCanonicalParagraphText } from '@/features/documents/template/canonicalParagraph'
import { parseSemanticMapResponse } from './semanticMapModelContract'
import { SemanticMapTransportError } from './semanticMapTransportTypes'
import { startSemanticContractGeneration, resumeSemanticContractGeneration, type SemanticContractGenerationResult, type SemanticMapProviderResult } from './semanticContractGenerationService'
import type { ContractTransformationDataset } from './types'

function assertState<T extends SemanticContractGenerationResult['status']>(
  result: SemanticContractGenerationResult,
  status: T,
): asserts result is Extract<SemanticContractGenerationResult, { status: T }> {
  assert.equal(result.status, status)
}

const sourceParagraphs = [
  'Klient: Anna Kowalska',
  'E-mail: sample@example.test',
  'Termin albumu do 12.07.2025',
  'Potwierdzenie harmonogramu do 01.08.2025',
  'Kwota słownie: pięć tysięcy złotych 00/100',
  'Postanowienia umowy pozostają bez zmian.',
]

async function sourceDocx(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  const paras = sourceParagraphs.map((text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`).join('')
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}<w:sectPr/></w:body></w:document>`)
  return zip.generateAsync({ type: 'arraybuffer' })
}

function dataset(): ContractTransformationDataset {
  return {
    clients: {
      // Deliberately not suitable for recovering person boundaries.
      displayNames: 'legacy flattened value',
      personCount: 2,
      customers: [
        { displayName: 'Anna Kowalska' },
        { displayName: 'Jan Nowak', email: 'jan@example.test' },
      ],
    },
    dates: { contractExecutionDate: '2026-09-23', weddingDate: '2027-06-19' },
    finances: { contractValueFormatted: '5 000 zł', contractValueWords: 'pięć tysięcy złotych' },
    locations: {},
    package: { name: 'Źródłowy pakiet' },
    additionalServices: [{ name: 'Dodatkowe ujęcia' }],
  }
}

async function makeProviderRows(
  blocks: Awaited<ReturnType<typeof import('./indexDocxForTransform').indexDocxForTransform>>,
  concepts: Array<{ paragraph: number; start: string; end?: string; concept: string; customerIndex?: number; dateRole?: string | null; nameForm?: string | null }>,
  extrasPlacement: { sourceBlockId: string; side: 'before' | 'after' } | null,
): Promise<SemanticMapProviderResult> {
  const { indexSemanticSourceTokens } = await import('./semanticSourceTokens')
  const semanticMappings = concepts.map((item) => {
    const block = blocks[item.paragraph]!
    const text = block.text
    const start = text.indexOf(item.start)
    const selected = item.end ?? item.start
    const end = text.indexOf(selected, start) + selected.length
    assert.ok(start >= 0 && end > start)
    const tokens = indexSemanticSourceTokens(block)
    const first = tokens.find((token) => token.start === start)
    const last = tokens.find((token) => token.end === end)
    assert.ok(first && last, `token bounds exist for ${item.concept}`)
    return {
      sourceBlockId: block.blockId,
      startTokenId: first.id,
      endTokenId: last.id,
      concept: item.concept,
      customerIndex: item.concept === 'customer_email' ? item.customerIndex ?? 0 : null,
      customerIndexes: null,
      nameForm: item.concept === 'customer_1_name' || item.concept === 'customer_2_name' ? item.nameForm ?? 'BASE' : null,
      dateRole: item.concept === 'ambiguous_date' ? item.dateRole ?? 'other_contractual_date' : null,
      baseDateConcept: null,
      relation: null,
    }
  })
  const parsed = parseSemanticMapResponse({ semanticMappings, extrasPlacement })
  assert.ok(parsed.ok, 'strict accepted semantic-map-v7 parser accepts fixture provider result')
  return parsed
}

async function run() {
  const bytes = await sourceDocx()
  const { indexDocxForTransform } = await import('./indexDocxForTransform')
  const blocks = await indexDocxForTransform(bytes)
  const allConcepts = [
    { paragraph: 0, start: 'Anna Kowalska', concept: 'customer_1_name' },
    { paragraph: 1, start: 'sample@example.test', concept: 'customer_email', customerIndex: 0 },
    { paragraph: 2, start: '12.07.2025', concept: 'ambiguous_date', dateRole: 'album_due_date' },
    { paragraph: 3, start: '01.08.2025', concept: 'ambiguous_date', dateRole: 'schedule_confirmation_date' },
    { paragraph: 4, start: 'pięć tysięcy złotych', concept: 'total_words' },
  ]
  let providerCalls = 0
  const providerResult = await makeProviderRows(blocks, allConcepts, { sourceBlockId: 'para-5', side: 'after' })
  const input = {
    sourceDocxBytes: bytes,
    sourceIdentity: { templateId: 'template-a', version: 'v1', fileName: 'contract.docx' },
    currentDate: '2026-09-23',
    canonicalDataset: dataset(),
    modelCandidate: 'terra' as const,
  }
  const result = await startSemanticContractGeneration(input, async (request) => {
    providerCalls++
    assert.equal(request.text.format.name, 'contract_semantic_mappings_v5_extras_placement')
    return providerResult
  })
  assertState(result, 'REQUIRES_USER_INPUT')
  assert.equal(providerCalls, 1)
  assert.deepEqual(result.requirements.map((item) => item.kind).sort(), ['customer_email', 'date', 'date'])
  assert.equal(result.requirements.filter((item) => item.kind === 'date').length, 2)
  assert.equal(result.requirements.filter((item) => item.kind === 'customer_email').length, 1)
  assert.deepEqual(result.requirements.filter((item) => item.kind === 'date').map((item) => item.label).sort(), ['Termin albumu', 'Termin potwierdzenia harmonogramu'])
  assert.ok(result.requirements.every((item) => item.id.length > 0))

  const suppliedValues = Object.fromEntries(result.requirements.map((requirement) => [
    requirement.id,
    requirement.kind === 'date' ? '2026-10-04' : 'anna@example.test',
  ]))
  const resumed = await resumeSemanticContractGeneration({ pendingState: result.pendingState, suppliedValues })
  assertState(resumed, 'COMPLETED')
  assert.equal(providerCalls, 1, 'resume has no provider dependency or second call')
  assert.equal(dataset().clients.customers?.[0]?.email, undefined, 'generation-only email does not mutate canonical CRM snapshot')
  const zip = await JSZip.loadAsync(resumed.artifact.docxBytes)
  const xml = await zip.file('word/document.xml')!.async('string')
  const visible = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => extractCanonicalParagraphText(match[0]!))
  assert.ok(visible[0]!.includes('Anna Kowalska'), 'ordered structured customer identity drives name output')
  assert.ok(visible[1]!.includes('anna@example.test'), 'the approved missing email is replaced rather than preserving sample text')
  assert.ok(visible[2]!.includes('04.10.2026'), 'first supplied date resumes deterministically')
  assert.ok(visible[3]!.includes('04.10.2026'), 'second supplied date resumes deterministically')
  assert.equal(visible[4]!.match(/00\/100/g)?.length, 1, 'SOURCE money presentation suffix remains exactly once')
  assert.ok(visible.some((paragraph) => paragraph.includes('Dodatkowe ujęcia')))
  assert.ok(!visible.some((paragraph) => paragraph.includes('zł') && paragraph.includes('Dodatkowe ujęcia')), 'extras insertion has names only, no CRM extra price')

  // A missing canonical location is not promoted to a user-editable requirement.
  const noExtraDataset = { ...dataset(), additionalServices: undefined }
  const missingLocation = await makeProviderRows(blocks, [{ paragraph: 5, start: 'Postanowienia umowy', concept: 'reception_location' }], null)
  const failed = await startSemanticContractGeneration({ ...input, canonicalDataset: noExtraDataset }, async () => missingLocation)
  assertState(failed, 'TECHNICAL_FAILURE')
  assert.equal(failed.code, 'canonical_data_missing')

  const nonBase = await makeProviderRows(blocks, [{ paragraph: 0, start: 'Anna Kowalska', concept: 'customer_1_name', nameForm: 'GENITIVE' }], null)
  const nonBaseResult = await startSemanticContractGeneration({ ...input, canonicalDataset: noExtraDataset }, async () => nonBase)
  assertState(nonBaseResult, 'TECHNICAL_FAILURE')
  assert.equal(nonBaseResult.code, 'unsupported_name_form')

  const providerFailure = await startSemanticContractGeneration(input, async () => { throw new Error('not exposed') })
  assertState(providerFailure, 'PROVIDER_FAILURE')

  const typedTransportFailure = await startSemanticContractGeneration(input, async () => { throw new SemanticMapTransportError('PROVIDER_TIMEOUT', 'provider_timeout') })
  assertState(typedTransportFailure, 'PROVIDER_FAILURE')
  assert.equal(typedTransportFailure.code, 'provider_timeout', 'P0 preserves typed timeout classification')
  const typedConfigurationFailure = await startSemanticContractGeneration(input, async () => { throw new SemanticMapTransportError('PROVIDER_CONFIGURATION_FAILURE', 'provider_configuration') })
  assertState(typedConfigurationFailure, 'TECHNICAL_FAILURE')
  assert.equal(typedConfigurationFailure.code, 'provider_configuration_failed', 'configuration failure is technical and fail closed')

  const qualityDataset = { ...noExtraDataset, additionalServices: [{ name: 'Unsafe 900 zł extra' }] }
  const qualityResult = await startSemanticContractGeneration({ ...input, canonicalDataset: qualityDataset }, async () => makeProviderRows(blocks, [], null))
  assertState(qualityResult, 'QUALITY_FAILURE')

  // Invalid requested placement safely takes the accepted physical fallback.
  const fallbackDataset = { ...dataset(), clients: { ...dataset().clients, customers: [{ displayName: 'Anna Kowalska', email: 'anna@example.test' }, { displayName: 'Jan Nowak', email: 'jan@example.test' }] } }
  const fallbackResult = await startSemanticContractGeneration({ ...input, canonicalDataset: fallbackDataset }, async () => {
    return makeProviderRows(blocks, [], { sourceBlockId: 'not-a-source-block', side: 'after' })
  })
  assertState(fallbackResult, 'COMPLETED')
  const fallbackZip = await JSZip.loadAsync(fallbackResult.artifact.docxBytes)
  const fallbackXml = await fallbackZip.file('word/document.xml')!.async('string')
  const fallbackVisible = [...fallbackXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => extractCanonicalParagraphText(match[0]!))
  assert.ok(fallbackVisible.slice(-2).some((paragraph) => paragraph.includes('Dodatkowe ujęcia')), 'invalid semantic boundary uses the accepted structural fallback')

  const implementation = await readFile(new URL('./semanticContractGenerationService.ts', import.meta.url), 'utf8')
  for (const forbidden of ['applyDeterministicRepairs', 'WeddingSparseContractGenerationService', 'runSparseProductTransform', 'changedBlocks', 'evaluationNameFormResolver']) {
    assert.equal(implementation.includes(forbidden), false, `new semantic service is isolated from ${forbidden}`)
  }
  console.log('PASS semantic production foundation: V7 composition, aggregate requirements, deterministic resume, extras, money presentation, and fail-closed behavior')
}

void run()
