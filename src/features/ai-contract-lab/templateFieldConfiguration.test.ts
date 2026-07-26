/**
 * Template Field Configuration — acceptance tests A–AO (subset executed).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildProposedTemplateConfiguration,
  computeTemplateConfigurationReadiness,
  getEffectiveFieldMode,
  migrateTemplateConfiguration,
  templateAllowsGeneration,
  toContractTemplateVariableConfig,
  validateTemplateConfigurationForSave,
  type ContractTemplateConfiguration,
  type TemplateFieldConfiguration,
} from '@/features/ai-contract-lab/templateFieldConfiguration'
import { mapSemanticMapToWeddingPlan } from '@/features/ai-contract-lab/mapSemanticRolesToWedding'
import { createContractGenerationContext } from '@/features/ai-contract-lab/contractGenerationContext'
import { reconcileSharedLocationPatches } from '@/features/ai-contract-lab/sharedLocationPolicy'
import { PRIMEPHOTO_CIVIL_PARTNERSHIP_FILM_ANCHORS } from '@/features/ai-contract-lab/fixtures/primephotoCivilPartnershipFilmContract'
import type {
  DocumentSemanticMap,
  DocumentTextAnchor,
  LabReplacementRow,
} from '@/features/ai-contract-lab/aiContractLabTypes'

const root = process.cwd()

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function run(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    throw err
  }
}

function sampleSemanticMap(): DocumentSemanticMap {
  return {
    analysisVersion: '2.0.0',
    documentSummary: {
      documentType: 'contract',
      language: 'pl',
      detectedPartyRoles: ['contractor', 'client'],
      detectedBusinessContext: 'film',
    },
    semanticAnchors: [
      {
        anchorId: 'body:p1',
        semanticRole: 'company_name',
        confidence: 0.99,
        valueSpan: { sourceText: 'PRIMEPHOTO s.c.' },
      },
      {
        anchorId: 'body:p2',
        semanticRole: 'company_tax_id',
        confidence: 0.99,
        valueSpan: { sourceText: '9452182345' },
      },
      {
        anchorId: 'body:p3',
        semanticRole: 'bride_name',
        confidence: 0.98,
        valueSpan: { sourceText: 'Katarzyna Dobrowolska' },
      },
      {
        anchorId: 'body:p4',
        semanticRole: 'groom_name',
        confidence: 0.98,
        valueSpan: { sourceText: 'Jan Kowalski' },
      },
      {
        anchorId: 'body:p5',
        semanticRole: 'bride_phone',
        confidence: 0.95,
        valueSpan: { sourceText: '600 828 797' },
      },
      {
        anchorId: 'body:p6',
        semanticRole: 'wedding_date',
        confidence: 0.99,
        valueSpan: { sourceText: '12.07.2025' },
      },
      {
        anchorId: 'body:p7',
        semanticRole: 'ceremony_location',
        confidence: 0.97,
        valueSpan: { sourceText: 'ZINNAR CASTLE' },
      },
      {
        anchorId: 'body:p8',
        semanticRole: 'delivery_deadline',
        confidence: 0.96,
        valueSpan: { sourceText: '180 dni roboczych' },
      },
      {
        anchorId: 'body:p9',
        semanticRole: 'payment_schedule',
        confidence: 0.95,
        valueSpan: { sourceText: '6300 zł i 2700 zł' },
      },
      {
        anchorId: 'body:p10',
        semanticRole: 'package_contents',
        confidence: 0.94,
        valueSpan: { sourceText: 'FILM do 20 minut' },
      },
      {
        anchorId: 'body:p11',
        semanticRole: 'bank_account',
        confidence: 0.99,
        valueSpan: { sourceText: '12 3456 7890' },
      },
      {
        anchorId: 'body:p12',
        semanticRole: 'legal_reference',
        confidence: 0.9,
        valueSpan: { sourceText: 'kodeks cywilny' },
      },
      {
        anchorId: 'body:p13',
        semanticRole: 'additional_service',
        confidence: 0.8,
        valueSpan: { sourceText: 'dopłata za godzinę' },
      },
    ],
    unresolved: [],
    warnings: [],
  }
}

function field(
  config: ContractTemplateConfiguration,
  role: string,
): TemplateFieldConfiguration | undefined {
  return config.fields.find((f) => f.semanticRole === role)
}

await run('A — default configuration is created after analysis', () => {
  const config = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: sampleSemanticMap(),
  })
  assert(config.fields.length >= 10, 'Expected proposed fields')
  assert(
    config.status === 'requires_review' || config.status === 'unconfigured',
    'Proposed config is not auto-ready',
  )
})

await run('B–G — defaults: company/legal fixed; client/date/location variable', () => {
  const config = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: sampleSemanticMap(),
  })
  assert(field(config, 'company_name')?.mode === 'fixed', 'company fixed')
  assert(field(config, 'bank_account')?.mode === 'fixed', 'bank fixed')
  assert(field(config, 'legal_reference')?.mode === 'fixed', 'legal fixed')
  assert(field(config, 'bride_name')?.mode === 'variable', 'bride variable')
  assert(field(config, 'bride_phone')?.mode === 'variable', 'phone variable')
  assert(field(config, 'wedding_date')?.mode === 'variable', 'date variable')
  assert(field(config, 'ceremony_location')?.mode === 'variable', 'loc variable')
})

await run('H–J — payment/delivery/package contents default fixed', () => {
  const config = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: sampleSemanticMap(),
  })
  assert(config.paymentMode === 'fixed', 'paymentMode fixed')
  assert(config.deliveryTermMode === 'fixed', 'deliveryTermMode fixed')
  assert(field(config, 'payment_schedule')?.mode === 'fixed', 'schedule fixed')
  assert(field(config, 'delivery_deadline')?.mode === 'fixed', 'delivery fixed')
  assert(field(config, 'package_item')?.mode === 'fixed', 'contents fixed')
})

await run('K–N — explicit user config overrides; ignored creates no replacement', () => {
  let config = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: sampleSemanticMap(),
  })
  config = {
    ...config,
    fields: config.fields.map((f) =>
      f.semanticRole === 'company_name'
        ? { ...f, mode: 'variable' as const, configuredBy: 'user' as const, variableSource: 'manual' as const, canonicalFieldKey: 'company.name' }
        : f.semanticRole === 'bride_name'
          ? { ...f, mode: 'ignored' as const, configuredBy: 'user' as const }
          : f.semanticRole === 'delivery_deadline'
            ? { ...f, mode: 'variable' as const, configuredBy: 'user' as const, variableSource: 'package' as const, canonicalFieldKey: 'package.delivery_term' }
            : f,
    ),
    status: 'configured',
  }

  const company = getEffectiveFieldMode({
    semanticRole: 'company_name',
    templateConfiguration: config,
  })
  assert(company.mode === 'variable' && company.configuredBy === 'user', 'user override wins')

  const mapped = mapSemanticMapToWeddingPlan({
    semanticMap: {
      ...sampleSemanticMap(),
      semanticAnchors: sampleSemanticMap().semanticAnchors.filter((a) =>
        ['company_name', 'bride_name', 'delivery_deadline'].includes(a.semanticRole),
      ),
    },
    fields: [
      {
        key: 'package.delivery_term',
        label: 'Termin',
        category: 'package',
        value: '6 miesięcy',
        formattedValue: '6 miesięcy',
        dataType: 'duration',
        source: 'test',
      },
    ],
    anchors: [
      { anchorId: 'body:p1', container: 'body', paragraphIndex: 1, runStart: 0, runEnd: 1, text: 'PRIMEPHOTO s.c.', contextBefore: '', contextAfter: '' },
      { anchorId: 'body:p3', container: 'body', paragraphIndex: 3, runStart: 0, runEnd: 1, text: 'Katarzyna Dobrowolska', contextBefore: '', contextAfter: '' },
      { anchorId: 'body:p8', container: 'body', paragraphIndex: 8, runStart: 0, runEnd: 1, text: '180 dni roboczych od dnia ślubu', contextBefore: '', contextAfter: '' },
    ],
    generationContext: createContractGenerationContext({
      now: new Date('2026-07-26T10:00:00Z'),
    }),
    fieldConfiguration: config,
    templateConfig: { deliveryTermMode: 'variable' },
  })

  assert(
    mapped.mappingRows.find((r) => r.semanticRole === 'bride_name')?.status ===
      'UNCHANGED',
    'ignored bride → unchanged',
  )
  assert(
    !mapped.analysis.replacements.some((r) =>
      r.canonicalFieldKey?.includes('bride'),
    ),
    'ignored creates no bride replacement',
  )
})

await run('O–Q — readiness and generation blockers', () => {
  const draft = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: sampleSemanticMap(),
  })
  assert(!templateAllowsGeneration(draft), 'AH unconfigured blocks generation')
  assert(
    computeTemplateConfigurationReadiness(draft).status !== 'ready',
    'O review/incomplete readiness',
  )

  const readyFields = draft.fields.map((f) =>
    f.mode === 'review'
      ? { ...f, mode: 'fixed' as const, configuredBy: 'user' as const }
      : { ...f, configuredBy: 'user' as const },
  )
  const ready: ContractTemplateConfiguration = {
    ...draft,
    fields: readyFields,
    status: 'configured',
  }
  const readiness = computeTemplateConfigurationReadiness(ready)
  assert(readiness.status === 'ready', 'AI ready when configured')
  assert(templateAllowsGeneration(ready), 'AI generation allowed when ready')

  // Fixed missing canonical does not block (Q) — readiness ignores fixed fields
  assert(
    !readiness.blockingIssues.some((i) => i.includes('PRIMEPHOTO')),
    'fixed company does not block',
  )
})

await run('R — protected fixed client requires confirmation', () => {
  const draft = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: sampleSemanticMap(),
  })
  const withFixedBride: ContractTemplateConfiguration = {
    ...draft,
    fields: draft.fields.map((f) =>
      f.mode === 'review'
        ? { ...f, mode: 'fixed' as const, configuredBy: 'user' as const }
        : f.semanticRole === 'bride_name'
          ? { ...f, mode: 'fixed', configuredBy: 'user' }
          : { ...f, configuredBy: 'user' as const },
    ),
  }
  const bad = validateTemplateConfigurationForSave({
    config: withFixedBride,
    markReady: true,
  })
  assert(!bad.ok, 'requires confirmation')
  assert(
    bad.errors.some((e) => /ryzyko|stał/i.test(e)),
    'error mentions risk',
  )
  const ok = validateTemplateConfigurationForSave({
    config: withFixedBride,
    markReady: true,
    confirmedFixedProtectedIds: [field(withFixedBride, 'bride_name')!.id],
  })
  assert(
    ok.config.fields.find((f) => f.semanticRole === 'bride_name')
      ?.fixedClientRiskConfirmed === true,
    'confirmed persists',
  )
})

await run('S–V — shared location policies never emit three patches', () => {
  const anchor: DocumentTextAnchor = {
    anchorId: 'body:loc',
    container: 'body',
    paragraphIndex: 1,
    runStart: 0,
    runEnd: 1,
    text: 'przygotowania, ceremonia, przyjęcie: ZINNAR',
    contextBefore: '',
    contextAfter: '',
  }
  const base = (role: string, value: string): LabReplacementRow => ({
    replacementId: role,
    anchorId: anchor.anchorId,
    originalText: 'ZINNAR',
    proposedValue: value,
    canonicalFieldKey: `location.${role}`,
    semanticRole: role,
    reason: 'test',
    confidence: 0.9,
    confidenceLabel: 'Wysoka',
    source: 'wedding',
    decision: 'approved',
    manualValue: null,
    missingId: null,
    requiresUserReview: false,
    contextSnippet: anchor.text,
    spanStatus: 'exact',
    spanMessage: null,
    aiProposedSourceText: 'ZINNAR',
    spanCandidates: [],
    spanStart: 40,
    spanEnd: 46,
  })
  const rows = [
    base('preparation_location', 'A'),
    base('ceremony_location', 'B'),
    base('reception_location', 'C'),
  ]

  const ask = reconcileSharedLocationPatches({
    rows,
    anchors: [anchor],
    policy: { mode: 'ask_each_time' },
  })
  assert(ask.reviewItems.length === 1, 'S ask_each_time review')
  assert(ask.rows.filter((r) => r.decision === 'approved').length === 0, 'no three patches')

  const combine = reconcileSharedLocationPatches({
    rows,
    anchors: [anchor],
    policy: { mode: 'combine_locations' },
  })
  assert(combine.rows.length === 1, 'T combine → one replacement')
  assert(combine.reviewItems.length === 0, 'combine no review')

  const single = reconcileSharedLocationPatches({
    rows,
    anchors: [anchor],
    policy: { mode: 'use_single_location', preferredLocationRole: 'ceremony' },
  })
  assert(single.rows.length === 1, 'U single → one replacement')
  assert(single.rows[0]?.proposedValue === 'B', 'uses ceremony')
})

await run('W–Y — payment/delivery modes via toContractTemplateVariableConfig', () => {
  const draft = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: sampleSemanticMap(),
  })
  const fixed = toContractTemplateVariableConfig({
    ...draft,
    paymentMode: 'fixed',
    deliveryTermMode: 'fixed',
    status: 'configured',
  })
  assert(fixed.paymentMode === 'fixed', 'W payment fixed')
  assert(fixed.deliveryTermMode === 'fixed', 'Y delivery fixed')

  const withValue: ContractTemplateConfiguration = {
    ...draft,
    paymentMode: 'fixed',
    fields: draft.fields.map((f) =>
      f.semanticRole === 'contract_value' || f.semanticRole === 'package_price'
        ? {
            ...f,
            semanticRole: 'contract_value',
            mode: 'variable',
            configuredBy: 'user',
            variableSource: 'package',
            canonicalFieldKey: 'package.contract_value',
          }
        : f,
    ),
  }
  // ensure contract_value field exists
  if (!field(withValue, 'contract_value')) {
    withValue.fields.push({
      id: 'cv',
      templateId: 't1',
      semanticRole: 'contract_value',
      displayName: 'Wartość',
      category: 'payments',
      mode: 'variable',
      variableSource: 'package',
      requiredWhenVariable: false,
      detectedAnchorIds: [],
      sourceExamples: [],
      configuredBy: 'user',
      canonicalFieldKey: 'package.contract_value',
    })
  }
  const override = toContractTemplateVariableConfig(withValue)
  assert(override.packageFields?.contractValue === true, 'X contract value override')
  assert(override.paymentMode === 'fixed', 'payment section stays fixed')
})

await run('AA–AB — config reused; heuristics do not override user', () => {
  const first = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: sampleSemanticMap(),
  })
  const userFixedDelivery: ContractTemplateConfiguration = {
    ...first,
    fields: first.fields.map((f) =>
      f.semanticRole === 'delivery_deadline'
        ? { ...f, mode: 'fixed', configuredBy: 'user' }
        : f,
    ),
    status: 'configured',
  }
  const second = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: sampleSemanticMap(),
    existing: userFixedDelivery,
  })
  assert(
    field(second, 'delivery_deadline')?.mode === 'fixed' &&
      field(second, 'delivery_deadline')?.configuredBy === 'user',
    'AA/AB user decision carried forward',
  )
})

await run('AC–AE — version migration', () => {
  const previous = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: sampleSemanticMap(),
  })
  const prevUser: ContractTemplateConfiguration = {
    ...previous,
    fields: previous.fields.map((f) => ({
      ...f,
      configuredBy: 'user' as const,
      mode: f.mode === 'review' ? ('fixed' as const) : f.mode,
    })),
    status: 'configured',
  }
  const nextMap = sampleSemanticMap()
  nextMap.semanticAnchors.push({
    anchorId: 'body:p99',
    semanticRole: 'groom_email',
    confidence: 0.9,
    valueSpan: { sourceText: 'jan@example.com' },
  })
  const nextProposed = buildProposedTemplateConfiguration({
    templateId: 't1',
    templateVersionId: 'v2',
    semanticMap: nextMap,
  })
  const migrated = migrateTemplateConfiguration({
    previous: prevUser,
    nextProposed,
  })
  assert(
    migrated.status === 'requires_review',
    'AE new client field requires review',
  )
  assert(
    migrated.matches.some((m) => m.kind === 'added'),
    'added detection present',
  )
  assert(
    migrated.configuration.fields.some(
      (f) => f.semanticRole === 'company_name' && f.mode === 'fixed',
    ),
    'AC confident matches carried',
  )
})

await run('AF — readiness counts', () => {
  const config = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: sampleSemanticMap(),
  })
  const r = computeTemplateConfigurationReadiness(config)
  assert(
    r.variableCount + r.fixedCount + r.ignoredCount + r.reviewCount ===
      config.fields.length,
    'counts sum to fields',
  )
})

await run('AJ–AK — PrimePhoto company fixed / client variable', () => {
  const map: DocumentSemanticMap = {
    analysisVersion: '2.0.0',
    documentSummary: {
      documentType: 'contract',
      language: 'pl',
      detectedPartyRoles: [],
      detectedBusinessContext: 'film',
    },
    semanticAnchors: [
      {
        anchorId: PRIMEPHOTO_CIVIL_PARTNERSHIP_FILM_ANCHORS[11]?.anchorId ?? 'a',
        semanticRole: 'company_name',
        confidence: 0.99,
        valueSpan: { sourceText: 'PRIMEPHOTO s.c.' },
      },
      {
        anchorId: 'b',
        semanticRole: 'bride_name',
        confidence: 0.99,
        valueSpan: { sourceText: 'Katarzyna' },
      },
    ],
    unresolved: [],
    warnings: [],
  }
  const config = buildProposedTemplateConfiguration({
    templateId: 'prime',
    semanticMap: map,
  })
  assert(field(config, 'company_name')?.mode === 'fixed', 'AJ company fixed')
  assert(field(config, 'bride_name')?.mode === 'variable', 'AK bride variable')
})

await run('AM–AO — Phase A / production surfaces untouched', () => {
  const prompt = join(
    root,
    'supabase/functions/ai-contract-lab-analyze/prompt.ts',
  )
  const transform = join(
    root,
    'src/features/documents/template/ContractTransformationService.ts',
  )
  const genModal = join(
    root,
    'src/features/weddings/actions/GenerateContractModal.tsx',
  )
  assert(existsSync(prompt), 'Phase A prompt exists')
  assert(existsSync(transform), 'renderer exists')
  assert(existsSync(genModal), 'generator modal exists')
  const promptSrc = readFileSync(prompt, 'utf8')
  assert(
    !promptSrc.includes('fieldConfiguration'),
    'AM Phase A prompt unchanged by field config',
  )
  const transformSrc = readFileSync(transform, 'utf8')
  assert(
    !transformSrc.includes('templateFieldConfiguration'),
    'AN production renderer untouched',
  )
  const genSrc = readFileSync(genModal, 'utf8')
  assert(
    !genSrc.includes('templateFieldConfiguration'),
    'AO production generator untouched',
  )
})

console.log('template field configuration: done')
