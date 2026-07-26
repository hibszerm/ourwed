/**
 * Structural compatibility suite — updated for wedding-variable product model.
 * Company conversion checks run only when templateMigrationMode = true.
 */

import type {
  ContractCanonicalField,
  DocumentTextAnchor,
  LabReplacementRow,
} from '@/features/ai-contract-lab/aiContractLabTypes'
import { PRIMEPHOTO_CIVIL_PARTNERSHIP_FILM_ANCHORS } from '@/features/ai-contract-lab/fixtures/primephotoCivilPartnershipFilmContract'
import { runStructuralCompatibilityAudit } from '@/features/ai-contract-lab/phaseCStructuralCompatibility'
import { buildPhysicalPatchPlan } from '@/features/ai-contract-lab/phaseCPhysicalPatchPlan'
import { DEFAULT_TEMPLATE_VARIABLE_CONFIG } from '@/features/ai-contract-lab/templateFieldPolicy'
import {
  phaseCAllowsGeneration,
  runPhaseCDocumentReadyAudit,
} from '@/features/ai-contract-lab/phaseCAudit'

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
}): LabReplacementRow {
  const start = input.anchor.text.indexOf(input.originalText)
  const end = start + input.originalText.length
  return {
    replacementId: input.id,
    anchorId: input.anchor.anchorId,
    originalText: input.originalText,
    canonicalFieldKey: input.fieldKey ?? null,
    proposedValue: input.proposedValue,
    semanticRole: input.role,
    reason: 'structural regression',
    confidence: 0.98,
    confidenceLabel: 'Wysoka',
    source: 'wedding',
    decision: 'approved',
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
    prefixContext: input.anchor.text.slice(0, start),
    suffixContext: input.anchor.text.slice(end),
  }
}

function canonical(key: string, value: string | number): ContractCanonicalField {
  return {
    key,
    label: key,
    category: 'package',
    value,
    formattedValue: String(value),
    dataType: typeof value === 'number' ? 'money' : 'text',
    source: 'test',
  }
}

const companyRow = makeRow({
  id: 'company-name',
  anchor: getAnchor(11),
  originalText: 'PRIMEPHOTO s.c.',
  proposedValue: 'NOWA MARKA',
  role: 'company_name',
  fieldKey: 'company.name',
})

await run('Normal mode — no legal-entity mismatch for company patches', () => {
  const result = runStructuralCompatibilityAudit({
    rows: [companyRow],
    anchors: PRIMEPHOTO_CIVIL_PARTNERSHIP_FILM_ANCHORS,
    canonicalEntityType: 'sole_proprietorship',
    templateConfig: DEFAULT_TEMPLATE_VARIABLE_CONFIG,
  })
  assert(
    !result.blockers.some((b) => b.code === 'legal_entity_structure_mismatch'),
    'Normal wedding generation must not emit legal_entity_structure_mismatch',
  )
})

await run('Migration mode — entity mismatch still available behind flag', () => {
  const result = runStructuralCompatibilityAudit({
    rows: [companyRow],
    anchors: PRIMEPHOTO_CIVIL_PARTNERSHIP_FILM_ANCHORS,
    canonicalEntityType: 'sole_proprietorship',
    templateConfig: {
      ...DEFAULT_TEMPLATE_VARIABLE_CONFIG,
      templateMigrationMode: true,
    },
  })
  assert(
    result.blockers.some((b) => b.code === 'legal_entity_structure_mismatch'),
    'Expected legal_entity_structure_mismatch in migration mode',
  )
})

await run('Shared location equal targets merge to one physical patch', () => {
  const anchor = getAnchor(38)
  const source = 'ZINNAR CASTLE'
  const base = makeRow({
    id: 'location-a',
    anchor,
    originalText: source,
    proposedValue: 'Rezydencja Testowa',
    role: 'ceremony_location',
  })
  const same = {
    ...base,
    replacementId: 'location-b',
    semanticRole: 'reception_location',
  }
  const merged = buildPhysicalPatchPlan({
    rows: [base, same],
    anchors: [anchor],
  })
  assert(merged.rows.length === 1, 'Equal target should emit one patch')
})

await run('Fixed payment mode — no schedule structure mismatch', () => {
  const result = runStructuralCompatibilityAudit({
    rows: [],
    anchors: [getAnchor(96), getAnchor(98), getAnchor(99), getAnchor(100)],
    canonicalFields: [canonical('package.contract_value', 9500)],
    templateConfig: DEFAULT_TEMPLATE_VARIABLE_CONFIG,
  })
  assert(
    !result.blockers.some((b) => b.code === 'payment_schedule_structure_mismatch'),
    'Fixed payment templates must not block on installment topology',
  )
})

await run('Structural FAIL from missing client data blocks generation', () => {
  const audit = runPhaseCDocumentReadyAudit({
    rows: [],
    anchors: [getAnchor(22)],
    mappingRows: [
      {
        anchorId: getAnchor(22).anchorId,
        semanticRole: 'groom_address',
        semanticLabel: 'groom_address',
        confidence: 0.99,
        confidenceBand: 'review',
        documentLabel: null,
        sourceText: getAnchor(22).text,
        documentValue: getAnchor(22).text,
        canonicalValue: null,
        derivedValue: null,
        previewValue: null,
        mappedFieldKey: 'client.groom_address',
        mappedDisplay: null,
        status: 'REVIEW',
        replacementStatus: 'missing_value',
        reason: 'missing',
        groupId: null,
        valueKind: 'text',
        exactPatchSpan: getAnchor(22).text,
        canonicalRule: null,
        patchable: false,
        temporalKind: null,
        semanticConfidence: 0.99,
        patchConfidence: 0,
        confidenceReasons: [],
        patchPreview: null,
      },
    ],
  })
  assert(audit.structuralCompatibility.status === 'FAIL', 'Expected FAIL')
  assert(
    !phaseCAllowsGeneration({ ...audit, qualityScore: 98, audit: 'PASS', blockers: [] }),
    'Structural FAIL must block generation',
  )
})
