/**
 * Variable-vs-invariant product model regressions (A–AF subset + PrimePhoto).
 */

import type {
  ContractCanonicalField,
  DocumentTextAnchor,
  LabReplacementRow,
  SemanticMappingRow,
} from '@/features/ai-contract-lab/aiContractLabTypes'
import { PRIMEPHOTO_CIVIL_PARTNERSHIP_FILM_ANCHORS } from '@/features/ai-contract-lab/fixtures/primephotoCivilPartnershipFilmContract'
import {
  classifyFieldMutability,
  DEFAULT_TEMPLATE_VARIABLE_CONFIG,
  isRoleReplaceable,
  TEMPLATE_INVARIANT_REASON,
} from '@/features/ai-contract-lab/templateFieldPolicy'
import {
  parseDocumentPaymentSchedule,
  runStructuralCompatibilityAudit,
} from '@/features/ai-contract-lab/phaseCStructuralCompatibility'
import { buildPhysicalPatchPlan } from '@/features/ai-contract-lab/phaseCPhysicalPatchPlan'
import { reconcileSharedLocationPatches } from '@/features/ai-contract-lab/sharedLocationPolicy'
import {
  resolveRunAwareEmail,
  resolveRunAwarePhone,
} from '@/features/ai-contract-lab/runAwareClientResolution'
import { parsePackageContent } from '@/features/ai-contract-lab/structuredPackageContent'
import {
  resolveBankAccountEvidence,
  resolveTypedSourceSpan,
} from '@/features/ai-contract-lab/resolveTypedSourceSpan'
import { normalizeSemanticRole } from '@/features/ai-contract-lab/semanticRoleCatalog'
import {
  phaseCAllowsGeneration,
  runPhaseCDocumentReadyAudit,
} from '@/features/ai-contract-lab/phaseCAudit'
import { mapSemanticMapToWeddingPlan } from '@/features/ai-contract-lab/mapSemanticRolesToWedding'
import { createContractGenerationContext } from '@/features/ai-contract-lab/contractGenerationContext'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function run(name: string, test: () => void | Promise<void>) {
  try {
    await test()
    console.log(`PASS  ${name}`)
  } catch (error) {
    console.error(`FAIL  ${name}`)
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

function getAnchor(paragraphIndex: number): DocumentTextAnchor {
  const anchor = PRIMEPHOTO_CIVIL_PARTNERSHIP_FILM_ANCHORS.find(
    (item) => item.paragraphIndex === paragraphIndex,
  )
  if (!anchor) throw new Error(`Missing fixture paragraph ${paragraphIndex}`)
  return anchor
}

function makeRow(input: {
  id: string
  anchor: DocumentTextAnchor
  originalText: string
  proposedValue: string
  role: string
  fieldKey?: string
  start?: number
  end?: number
  decision?: LabReplacementRow['decision']
}): LabReplacementRow {
  const start = input.start ?? input.anchor.text.indexOf(input.originalText)
  const end = input.end ?? start + input.originalText.length
  return {
    replacementId: input.id,
    anchorId: input.anchor.anchorId,
    originalText: input.originalText,
    canonicalFieldKey: input.fieldKey ?? null,
    proposedValue: input.proposedValue,
    semanticRole: input.role,
    reason: 'regression',
    confidence: 0.98,
    confidenceLabel: 'Wysoka',
    source: 'wedding',
    decision: input.decision ?? 'approved',
    manualValue: null,
    missingId: null,
    requiresUserReview: false,
    contextSnippet: input.anchor.text,
    spanStatus: 'exact',
    spanMessage: null,
    aiProposedSourceText: input.originalText,
    spanCandidates: [],
    spanStart: start,
    spanEnd: end,
    prefixContext: input.anchor.text.slice(0, Math.max(0, start)),
    suffixContext: input.anchor.text.slice(Math.max(0, end)),
  }
}

function canonical(key: string, value: string | number): ContractCanonicalField {
  return {
    key,
    label: key,
    category: key.startsWith('company.')
      ? 'company'
      : key.startsWith('package.')
        ? 'package'
        : 'client',
    value,
    formattedValue: String(value),
    dataType: typeof value === 'number' ? 'money' : 'text',
    source: 'test',
  }
}

function missingClientMapping(input: {
  anchor: DocumentTextAnchor
  role: string
  documentValue: string
  fieldKey: string
}): SemanticMappingRow {
  return {
    anchorId: input.anchor.anchorId,
    semanticRole: input.role,
    semanticLabel: input.role,
    confidence: 0.99,
    confidenceBand: 'review',
    documentLabel: null,
    sourceText: input.documentValue,
    documentValue: input.documentValue,
    canonicalValue: null,
    derivedValue: null,
    previewValue: null,
    mappedFieldKey: input.fieldKey,
    mappedDisplay: null,
    status: 'REVIEW',
    replacementStatus: 'missing_value',
    reason: 'canonical client value missing',
    groupId: null,
    valueKind: 'text',
    exactPatchSpan: input.documentValue,
    canonicalRule: null,
    patchable: false,
    temporalKind: null,
    semanticConfidence: 0.99,
    patchConfidence: 0,
    confidenceReasons: ['missing canonical client value'],
    patchPreview: null,
  }
}

await run('A–J — company/contractor fields are template-invariant', () => {
  for (const role of [
    'company_name',
    'company_tax_id',
    'company_registration_number',
    'company_address',
    'company_email',
    'company_phone',
    'company_website',
    'bank_account',
    'partner_name',
    'contractor_person_pesel',
  ]) {
    assert(
      classifyFieldMutability(role) === 'template_invariant',
      `${role} must be template_invariant`,
    )
    assert(
      !isRoleReplaceable(role, DEFAULT_TEMPLATE_VARIABLE_CONFIG),
      `${role} must not be replaceable`,
    )
  }

  const result = runStructuralCompatibilityAudit({
    rows: [
      makeRow({
        id: 'company-name',
        anchor: getAnchor(11),
        originalText: 'PRIMEPHOTO s.c.',
        proposedValue: 'Video Productions',
        role: 'company_name',
        fieldKey: 'company.name',
      }),
    ],
    anchors: PRIMEPHOTO_CIVIL_PARTNERSHIP_FILM_ANCHORS,
    canonicalEntityType: 'sole_proprietorship',
    templateConfig: DEFAULT_TEMPLATE_VARIABLE_CONFIG,
  })
  assert(
    !result.blockers.some((b) =>
      [
        'legal_entity_structure_mismatch',
        'unsafe_identity_block_patch',
        'unresolved_required_business_value',
      ].includes(b.code),
    ),
    'Normal mode must not run company conversion blockers',
  )
})

await run('K–N — client data stays variable; missing groom address blocks', () => {
  for (const role of [
    'bride_name',
    'groom_name',
    'bride_address',
    'groom_address',
    'bride_phone',
    'bride_email',
  ]) {
    assert(
      classifyFieldMutability(role) === 'wedding_variable',
      `${role} must be wedding_variable`,
    )
  }

  const anchor = getAnchor(22)
  const result = runStructuralCompatibilityAudit({
    rows: [],
    anchors: [anchor],
    mappingRows: [
      missingClientMapping({
        anchor,
        role: 'groom_address',
        documentValue: anchor.text.replace(/^adres zamieszkania:\s*/i, ''),
        fieldKey: 'client.groom_address',
      }),
    ],
  })
  assert(
    result.blockers.some((b) => b.code === 'missing_canonical_client_data'),
    'Expected missing_canonical_client_data',
  )
  assert(
    !result.blockers.some((b) => b.code === 'missing_canonical_personal_data'),
    'Contractor personal-data code must not be used for clients',
  )
})

await run('O–P — fragmented bride phone and email resolve across runs', () => {
  const anchor = getAnchor(19)
  const phone = resolveRunAwarePhone({ anchor })
  assert(phone, 'Expected phone match')
  assert(phone.normalizedValue === '600828797', `phone digits got ${phone.normalizedValue}`)
  assert(phone.exactSourceText.includes('6'), 'phone span must cover source digits')

  const email = resolveRunAwareEmail({ anchor })
  assert(email, 'Expected email match')
  assert(
    email.normalizedValue === 'katarzyna@dobrowolska.pl',
    `email got ${email.normalizedValue}`,
  )
})

await run('Q — package_price normalizes to contract_value', () => {
  assert(
    normalizeSemanticRole('package_price') === 'contract_value',
    'package_price alias must normalize',
  )
})

await run('R — structured film attributes resolve', () => {
  const parsed = parsePackageContent(getAnchor(46).text)
  assert(parsed.type === 'asset', 'Expected asset')
  assert(parsed.subtype === 'main_film', 'Expected main_film')
  assert(parsed.deliveryMethod === 'digital', 'Expected digital delivery')
  assert(parsed.format === 'digital_file', 'Expected digital_file')
  assert(parsed.durationMinutesMax === 20, 'Expected max 20 minutes')
})

await run('S — working hours 12:00–23:00 resolve', () => {
  const typed = resolveTypedSourceSpan({
    anchorId: getAnchor(155).anchorId,
    anchorText: getAnchor(155).text,
    semanticRole: 'working_hours',
    valueKind: 'text',
    proposedSourceText: '12:00 - 23:00',
  })
  assert(typed?.exactSourceText.includes('12:00'), 'Expected start time')
  assert(typed?.exactSourceText.includes('23:00'), 'Expected end time')
})

await run('T–V — shared location never emits three patches', () => {
  const anchor = getAnchor(38)
  const source = 'ZINNAR CASTLE'
  const base = makeRow({
    id: 'loc-a',
    anchor,
    originalText: source,
    proposedValue: 'Rezydencja Testowa',
    role: 'ceremony_location',
  })
  const prep = {
    ...base,
    replacementId: 'loc-b',
    semanticRole: 'preparation_location',
  }
  const reception = {
    ...base,
    replacementId: 'loc-c',
    semanticRole: 'reception_location',
  }

  const same = reconcileSharedLocationPatches({
    rows: [base, prep, reception],
    anchors: [anchor],
  })
  assert(same.rows.length === 1, 'Identical shared locations → one patch')
  assert(same.reviewItems.length === 0, 'No review when values match')

  const conflict = reconcileSharedLocationPatches({
    rows: [
      base,
      { ...prep, proposedValue: 'Inne przygotowania' },
      { ...reception, proposedValue: 'Inne przyjęcie' },
    ],
    anchors: [anchor],
  })
  assert(conflict.rows.every((r) => r.decision !== 'approved' || conflict.suppressedReplacementIds.includes(r.replacementId) || r.requiresUserReview), 'Differing shared locations must not silently approve three patches')
  assert(conflict.reviewItems.length === 1, 'Expected shared location review')
  assert(
    conflict.reviewItems[0]?.code === 'shared_location_requires_decision',
    'Expected shared_location_requires_decision',
  )

  const physical = buildPhysicalPatchPlan({
    rows: conflict.rows.filter((r) => !conflict.suppressedReplacementIds.includes(r.replacementId)),
    anchors: [anchor],
  })
  assert(physical.rows.length <= 1, 'At most one physical shared-location patch')
})

await run('W–X — fixed payment and delivery remain unchanged', () => {
  assert(
    !isRoleReplaceable('deposit_amount', DEFAULT_TEMPLATE_VARIABLE_CONFIG),
    'deposit fixed by default',
  )
  assert(
    !isRoleReplaceable('delivery_deadline', DEFAULT_TEMPLATE_VARIABLE_CONFIG),
    'delivery fixed by default',
  )

  const payment = runStructuralCompatibilityAudit({
    rows: [],
    anchors: [getAnchor(96), getAnchor(98), getAnchor(99), getAnchor(100)],
    canonicalFields: [canonical('package.contract_value', 9500)],
    templateConfig: DEFAULT_TEMPLATE_VARIABLE_CONFIG,
  })
  assert(
    !payment.blockers.some((b) => b.code === 'payment_schedule_structure_mismatch'),
    'Fixed payment mode must not create schedule mismatch',
  )

  const delivery = runStructuralCompatibilityAudit({
    rows: [
      makeRow({
        id: 'delivery',
        anchor: getAnchor(48),
        originalText: '180',
        proposedValue: '4',
        role: 'delivery_deadline',
        fieldKey: 'package.delivery_term',
      }),
    ],
    anchors: [getAnchor(48)],
    canonicalFields: [canonical('package.delivery_term', '4 miesiące')],
    templateConfig: DEFAULT_TEMPLATE_VARIABLE_CONFIG,
  })
  assert(
    !delivery.blockers.some(
      (b) =>
        b.code === 'unsafe_variable_temporal_patch' ||
        b.code === 'unsafe_temporal_unit_change',
    ),
    'Fixed delivery must not create temporal unit blockers',
  )
})

await run('Y — variable delivery requires full temporal phrase', () => {
  const result = runStructuralCompatibilityAudit({
    rows: [
      makeRow({
        id: 'delivery-number',
        anchor: getAnchor(48),
        originalText: '180',
        proposedValue: '4',
        role: 'delivery_deadline',
        fieldKey: 'package.delivery_term',
      }),
    ],
    anchors: [getAnchor(48)],
    canonicalFields: [canonical('package.delivery_term', '4 miesiące')],
    templateConfig: {
      ...DEFAULT_TEMPLATE_VARIABLE_CONFIG,
      deliveryTermMode: 'variable',
    },
  })
  assert(
    result.blockers.some((b) => b.code === 'unsafe_variable_temporal_patch'),
    'Variable delivery numeric-only patch must fail',
  )
})

await run('Z — legal clauses / bank account stay invariant evidence', () => {
  const bank = resolveBankAccountEvidence(getAnchor(103).text)
  assert(bank?.bankName === 'ING Bank Śląski', 'Bank name separated')
  assert(bank.account.normalizedValue?.length === 26, 'NRB 26 digits')
  assert(!isRoleReplaceable('bank_account'), 'Bank account not replaceable')
  assert(
    classifyFieldMutability('legal_reference') === 'legal_invariant',
    'Legal reference invariant',
  )
})

await run('AA–AB — migration-only identity checks stay isolated', () => {
  const normal = runStructuralCompatibilityAudit({
    rows: [
      makeRow({
        id: 'company',
        anchor: getAnchor(11),
        originalText: 'PRIMEPHOTO s.c.',
        proposedValue: 'Other Co',
        role: 'company_name',
      }),
    ],
    anchors: PRIMEPHOTO_CIVIL_PARTNERSHIP_FILM_ANCHORS,
    canonicalEntityType: 'sole_proprietorship',
  })
  assert(normal.blockers.every((b) => b.code !== 'legal_entity_structure_mismatch'), 'no entity mismatch')
  assert(normal.blockers.every((b) => b.code !== 'unsafe_identity_block_patch'), 'no identity block')

  const migration = runStructuralCompatibilityAudit({
    rows: [
      makeRow({
        id: 'company',
        anchor: getAnchor(11),
        originalText: 'PRIMEPHOTO s.c.',
        proposedValue: 'Other Co',
        role: 'company_name',
      }),
    ],
    anchors: PRIMEPHOTO_CIVIL_PARTNERSHIP_FILM_ANCHORS,
    canonicalEntityType: 'sole_proprietorship',
    templateConfig: {
      ...DEFAULT_TEMPLATE_VARIABLE_CONFIG,
      templateMigrationMode: true,
    },
  })
  assert(
    migration.blockers.some((b) => b.code === 'legal_entity_structure_mismatch'),
    'Migration mode may still detect entity mismatch',
  )
})

await run('AC–AD — generation gate depends on client completeness, not company', () => {
  const companyOnly = runPhaseCDocumentReadyAudit({
    rows: [
      makeRow({
        id: 'company',
        anchor: getAnchor(11),
        originalText: 'PRIMEPHOTO s.c.',
        proposedValue: 'Other Co',
        role: 'company_name',
        decision: 'rejected',
      }),
    ],
    anchors: PRIMEPHOTO_CIVIL_PARTNERSHIP_FILM_ANCHORS,
    templateConfig: DEFAULT_TEMPLATE_VARIABLE_CONFIG,
  })
  assert(
    companyOnly.structuralCompatibility.status !== 'FAIL' ||
      !companyOnly.structuralCompatibility.blockers.some((b) =>
        b.code.includes('identity') || b.code.includes('legal_entity'),
      ),
    'Rejected company patch must not create identity blockers in normal mode',
  )

  const missingClient = runPhaseCDocumentReadyAudit({
    rows: [],
    anchors: [getAnchor(22)],
    mappingRows: [
      missingClientMapping({
        anchor: getAnchor(22),
        role: 'groom_address',
        documentValue: 'ul. Świętego Tomasza 35/2A, 31-027 Kraków',
        fieldKey: 'client.groom_address',
      }),
    ],
  })
  assert(!phaseCAllowsGeneration(missingClient), 'Missing client data must block generation')
})

await run('Phase B maps company fields as UNCHANGED template invariants', () => {
  const anchors = [getAnchor(11), getAnchor(12), getAnchor(103), getAnchor(15)]
  const { mappingRows } = mapSemanticMapToWeddingPlan({
    semanticMap: {
      analysisVersion: '2.1.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'film',
      },
      semanticAnchors: [
        {
          anchorId: getAnchor(11).anchorId,
          semanticRole: 'company_name',
          confidence: 0.99,
          valueSpan: { sourceText: 'PRIMEPHOTO s.c.' },
        },
        {
          anchorId: getAnchor(12).anchorId,
          semanticRole: 'company_nip',
          confidence: 0.99,
          valueSpan: { sourceText: '6321999826' },
        },
        {
          anchorId: getAnchor(12).anchorId,
          semanticRole: 'company_regon',
          confidence: 0.99,
          valueSpan: { sourceText: '241889811' },
        },
        {
          anchorId: getAnchor(103).anchorId,
          semanticRole: 'bank_account',
          confidence: 0.99,
          valueSpan: { sourceText: '72 1050 1302 1000 0092 3121 6509' },
        },
        {
          anchorId: getAnchor(15).anchorId,
          semanticRole: 'company_website',
          confidence: 0.99,
          valueSpan: { sourceText: 'www.primephoto.pl' },
        },
      ],
      unresolved: [],
      warnings: [],
    },
    fields: [
      canonical('company.name', 'Video Productions'),
      canonical('company.nip', '9999999999'),
      canonical('company.regon', '111111111'),
      canonical('company.bank_account', '11 1111 1111 1111 1111 1111 1111'),
    ],
    anchors,
    generationContext: createContractGenerationContext({
      now: new Date('2026-07-26T12:00:00+02:00'),
      timezone: 'Europe/Warsaw',
    }),
  })

  for (const row of mappingRows) {
    assert(row.status === 'UNCHANGED', `${row.semanticRole} must be UNCHANGED`)
    assert(
      row.reason === TEMPLATE_INVARIANT_REASON,
      `${row.semanticRole} reason must be template invariant`,
    )
    assert(row.patchable === false, `${row.semanticRole} must not be patchable`)
  }
  assert(
    mappingRows.every((r) => r.mappedFieldKey == null),
    'Invariant fields must not request canonical mapping targets',
  )
})

await run('AF — payment schedule parser still isolates legal penalties', () => {
  const schedule = parseDocumentPaymentSchedule([getAnchor(140)])
  assert(schedule.entries.length === 0, 'Penalty must not become installment')
})
