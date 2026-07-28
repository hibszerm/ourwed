import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  cleanupPackageIncludedItems,
  refinePackageItemsAgainstDescription,
} from './packageItemCleanup'
import {
  coalesceRedundantRawValue,
  sanitizeEvidenceArray,
  sanitizeEvidenceQuote,
} from './extractionSanitizers'
import { groupSectionEvidence } from './groupSectionEvidence'
import { adaptStoredProposal } from './adapters'
import { applyDecisionsToProposal, buildRecoveryProposal } from './buildComparisonProposal'
import { emptyContractRecoveryExtraction } from './schema/extractionSchema'
import {
  WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION,
  WEDDING_CONTRACT_RECOVERY_VERSION,
  SUPPORTED_RECOVERY_RESPONSE_VERSIONS,
} from './constants'
import type { RecoveryFieldComparison, RecoveryProposal } from './types'
import type { Wedding } from '@/types/wedding'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

// --- Package normalization ---
{
  const cleaned = cleanupPackageIncludedItems([
    '  • Teledysk ślubny  ',
    'Teledysk ślubny',
    '1. Film ślubny',
    '',
    '  ',
    '- Galeria internetowa;',
  ])
  assertEq(cleaned.length, 3, 'dedupe + empty drop')
  assertEq(cleaned[0], 'Teledysk ślubny', 'bullet prefix stripped')
  assertEq(cleaned[1], 'Film ślubny', 'numbered prefix stripped')
  assertEq(cleaned[2], 'Galeria internetowa', 'trailing punct stripped')
}

{
  const desc =
    'Teledysk ślubny. Film ślubny. Minimum 600 zdjęć po obróbce.'
  const refined = refinePackageItemsAgainstDescription([desc], desc)
  assert(refined.length >= 2, 'giant item split when duplicating description')
}

{
  const custom = cleanupPackageIncludedItems([
    'Drone highlight 60 sekund (usługa niestandardowa)',
    'Drone highlight 60 sekund (usługa niestandardowa)',
  ])
  assertEq(custom.length, 1, 'custom item preserved once')
  assertEq(
    custom[0],
    'Drone highlight 60 sekund (usługa niestandardowa)',
    'custom wording preserved',
  )
}

{
  const order = cleanupPackageIncludedItems(['A', 'B', 'C', 'a'])
  assertEq(order.join('|'), 'A|B|C', 'order preserved, case-insensitive dedupe')
}

// --- Evidence sanitizers ---
{
  const long = 'x'.repeat(400)
  const capped = sanitizeEvidenceQuote(long, 160)
  assert(capped.length <= 161, 'quote capped')
  assert(capped.endsWith('…'), 'ellipsis on cap')
}

{
  const evidence = sanitizeEvidenceArray(
    [
      { quote: '  Kinga Testowa, tel. 530  ', page: 1, section: null },
      { quote: 'Kinga Testowa, tel. 530', page: 1, section: null },
      { quote: 'inna cytata', page: 2, section: null },
    ],
    { maxItems: 1 },
  )
  assertEq(evidence.length, 1, 'scalar max 1 evidence')
  assert(Boolean(evidence[0]?.page === 1), 'page retained')
}

{
  const field = coalesceRedundantRawValue({
    value: 'Kinga',
    rawValue: 'Kinga',
    confidence: 0.9,
    evidence: [{ quote: 'Kinga' }],
    warnings: [],
  })
  assertEq(field.rawValue, null, 'identical rawValue nullified')
}

{
  const money = coalesceRedundantRawValue({
    value: 8550,
    rawValue: '8.550,00 zł',
    confidence: 0.9,
    evidence: [{ quote: '8.550,00 zł' }],
    warnings: [],
  })
  assertEq(money.rawValue, '8.550,00 zł', 'formatted money rawValue kept')
}

{
  const date = coalesceRedundantRawValue({
    value: '2026-04-11',
    rawValue: '11 kwietnia 2026',
    confidence: 0.9,
    evidence: [{ quote: '11 kwietnia 2026' }],
    warnings: [],
  })
  assertEq(date.rawValue, '11 kwietnia 2026', 'Polish date rawValue kept')
}

// --- UI evidence grouping ---
{
  const quote =
    'Kinga Tchórz, zam. ul. Pomorska 12/4, 31-000 Kraków, tel. 530 702 125'
  const fields = [
    {
      fieldKey: 'clients.partner1.fullName',
      label: 'Imię i nazwisko',
      sectionKey: 'clients' as const,
      currentValue: null,
      extractedValue: 'Kinga Tchórz',
      normalizedCurrentValue: null,
      normalizedExtractedValue: 'Kinga Tchórz',
      confidence: 0.9,
      state: 'missing_current' as const,
      selectedAction: 'use_extracted' as const,
      evidence: [{ quote, page: 1, section: null }],
      warnings: [] as string[],
    },
    {
      fieldKey: 'clients.partner1.phone',
      label: 'Telefon',
      sectionKey: 'clients' as const,
      currentValue: null,
      extractedValue: '530702125',
      normalizedCurrentValue: null,
      normalizedExtractedValue: '530702125',
      confidence: 0.9,
      state: 'missing_current' as const,
      selectedAction: 'use_extracted' as const,
      evidence: [{ quote: `  ${quote}  `, page: 1, section: null }],
      warnings: [] as string[],
    },
    {
      fieldKey: 'wedding.date',
      label: 'Data ślubu',
      sectionKey: 'wedding' as const,
      currentValue: null,
      extractedValue: '2028-06-03',
      normalizedCurrentValue: null,
      normalizedExtractedValue: '2028-06-03',
      confidence: 0.9,
      state: 'missing_current' as const,
      selectedAction: 'use_extracted' as const,
      evidence: [{ quote: 'ślub 03.06.2028', page: 1, section: null }],
      warnings: [] as string[],
    },
  ] satisfies RecoveryFieldComparison[]
  const { fieldRefs, sharedSources } = groupSectionEvidence(fields)
  assertEq(sharedSources.length, 1, 'identical quotes share one source')
  assertEq(sharedSources[0]?.label, 'Źródło 1', 'shared label')
  assertEq(
    fieldRefs.get('clients.partner1.fullName')?.sharedSourceId,
    'src-1',
    'fullName refs shared',
  )
  assertEq(
    fieldRefs.get('wedding.date')?.sharedSourceId,
    null,
    'distinct quote stays unique',
  )
  assertEq(
    fieldRefs.get('wedding.date')?.uniqueEvidence?.quote,
    'ślub 03.06.2028',
    'unique quote preserved',
  )
}

// --- Confirmation grouping / defaults ---
{
  const wedding: Wedding = {
    id: 'w1',
    couple: {
      partner1: 'Anna',
      partner2: '',
      email: '',
      phone: '',
      city: '',
      venue: '',
    },
    date: '2026-04-12',
    status: 'active',
    workflowStage: 'contract',
    packageName: '',
    price: 7550,
    packageItems: [],
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#000000',
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  const extraction = emptyContractRecoveryExtraction()
  extraction.clients.partner1.phone.value = '530702125'
  extraction.clients.partner1.phone.confidence = 0.9
  extraction.clients.partner1.phone.evidence = [{ quote: 'tel. 530 702 125' }]
  extraction.wedding.weddingDate.value = '2028-06-03'
  extraction.wedding.weddingDate.confidence = 0.9
  extraction.wedding.weddingDate.evidence = [{ quote: 'ślub 03.06.2028' }]
  extraction.finances.totalContractValue.value = 8550
  extraction.finances.totalContractValue.confidence = 0.9
  extraction.finances.totalContractValue.evidence = [{ quote: '8550' }]
  extraction.contractedPackage.name.value = 'Złoty Film'
  extraction.contractedPackage.name.confidence = 0.9
  extraction.contractedPackage.name.evidence = [{ quote: 'pakiet Złoty Film' }]
  extraction.contractedPackage.includedItems = [
    { text: 'Teledysk', confidence: 0.9, evidence: [{ quote: 'Teledysk' }] },
    { text: 'Film', confidence: 0.9, evidence: [{ quote: 'Film' }] },
  ]

  const proposal = buildRecoveryProposal(wedding, extraction)
  const dateField = proposal.fields.find((f) => f.fieldKey === 'wedding.date')
  assertEq(dateField?.state, 'different', 'date conflict')
  assertEq(dateField?.selectedAction, 'keep_current', 'conflict default keep')

  const phoneField = proposal.fields.find((f) => f.fieldKey === 'partner1.phone')
  assertEq(phoneField?.state, 'missing_current', 'missing current phone')
  assertEq(phoneField?.selectedAction, 'use_extracted', 'missing default use extracted')

  const priceField = proposal.fields.find((f) => f.fieldKey === 'finances.contractValue')
  assertEq(priceField?.selectedAction, 'keep_current', 'price conflict keep')

  const decided = applyDecisionsToProposal(
    proposal,
    proposal.fields.map((f) => ({
      fieldKey: f.fieldKey,
      action:
        f.fieldKey === 'wedding.date'
          ? ('use_extracted' as const)
          : f.fieldKey === 'finances.contractValue'
            ? ('keep_current' as const)
            : f.selectedAction,
    })),
    true,
  )

  const approved = decided.fields.filter((f) => f.selectedAction === 'use_extracted')
  assert(
    approved.some((f) => f.fieldKey === 'wedding.date'),
    'approved includes chosen date',
  )
  assert(
    decided.fields.some(
      (f) =>
        f.fieldKey === 'finances.contractValue' && f.selectedAction === 'keep_current',
    ),
    'kept conflict preserved',
  )
  assert(Boolean(decided.packageSnapshotProposal), 'package on confirm')
  assertEq(
    decided.packageSnapshotProposal?.includedItems.length,
    2,
    'package item count',
  )

  // Empty skipped section: no invalid fields in this fixture
  const skipped = decided.fields.filter((f) => f.state === 'invalid_extracted')
  assertEq(skipped.length, 0, 'no invalid to show')
}

// --- Version compatibility ---
{
  assert(
    SUPPORTED_RECOVERY_RESPONSE_VERSIONS.includes('2026-07-recovery-v1'),
    'v1 supported',
  )
  assertEq(
    WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION,
    '2026-07-recovery-v2',
    'current response v2',
  )
  assertEq(WEDDING_CONTRACT_RECOVERY_VERSION, '2', 'extraction version 2')

  const v1Proposal = adaptStoredProposal({
    version: '1',
    fields: [],
    sections: [],
    packageSnapshotProposal: {
      name: 'Old',
      originalDescription: 'opis',
      includedItems: ['• A', 'A', 'B'],
      coverageHours: 10,
      coverageTimeRange: null as unknown as string | null,
      deliveryDeadlineText: null,
      selectedAction: 'use_extracted',
    },
    summary: {
      toUpdate: 0,
      unchanged: 0,
      conflictsKept: 0,
      invalid: 0,
      packageSnapshot: true,
    },
  } as RecoveryProposal)

  assert(Boolean(v1Proposal?.packageSnapshotProposal), 'v1 package renders')
  assertEq(
    v1Proposal!.packageSnapshotProposal!.includedItems.join('|'),
    'A|B',
    'v1 items cleaned for display',
  )
}

// --- Schema size regression guard ---
{
  const schemaPath = resolve(
    process.cwd(),
    'supabase/functions/wedding-contract-recovery-analyze/schema.ts',
  )
  const src = readFileSync(schemaPath, 'utf8')
  const body = src
    .replace(/import[^\n]+\n/g, '')
    .replace(
      /export const RECOVERY_JSON_SCHEMA = /,
      'const RECOVERY_JSON_SCHEMA = ',
    )
    .replace(
      /WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION/g,
      JSON.stringify('2026-07-recovery-v2'),
    )
  // eslint-disable-next-line no-eval
  const schema = eval(`${body}\nRECOVERY_JSON_SCHEMA`)
  const serialized = JSON.stringify(schema)
  const chars = serialized.length
  const estTokens = Math.ceil(chars / 4)
  assert(chars < 9000, `schema size regression: ${chars} chars`)
  assert(estTokens < 2500, `schema token regression: ${estTokens}`)
  assert(Boolean(schema.$defs?.stringField), '$defs.stringField present')
  assert(Boolean(schema.$defs?.evidence), '$defs.evidence present')
  assert(
    schema.properties.document.properties.contractNumber.$ref ===
      '#/$defs/stringField',
    '$ref used for stringField',
  )
  assert(schema.additionalProperties === false, 'root additionalProperties false')
  console.log(
    `schema size OK: ${chars} chars (~${estTokens} tokens)`,
  )
}

console.log('PASS wedding contract recovery quality sprint tests')
