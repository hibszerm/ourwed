/**
 * Regression: automatic configuration persist + readiness after successful analysis.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/automaticConfigurationRegression.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { DocumentSemanticMap } from '@/features/ai-contract-lab/aiContractLabTypes'
import {
  WEDDING_PLANNER_ROLES,
  type ContractTemplateConfiguration,
  type TemplateFieldConfiguration,
} from '@/features/ai-contract-lab/templateFieldConfiguration'
import {
  automaticStatusFromTemplate,
  buildAutomaticReadyConfiguration,
  computeAutomaticTemplateReadiness,
  evaluateDocumentPreparationState,
  finalizeAutomaticTemplateConfiguration,
  migrateLegacyTemplateConfiguration,
  toPersistedAutomaticMeta,
} from '@/features/documents/template/automaticTemplateReadiness'
import { semanticMapFromSlotMap } from '@/features/documents/template/slotMapSemanticBridge'
import { emptySlotMap, type TemplateSlotMap } from '@/features/documents/template/types'
import type { DocumentTemplateSummary } from '@/types/documents'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function equal<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function semanticMap(
  roles: Array<{ role: string; sourceText: string }>,
): DocumentSemanticMap {
  return {
    analysisVersion: 'test@1',
    documentSummary: {
      documentType: 'contract',
      language: 'pl',
      detectedPartyRoles: [],
      detectedBusinessContext: 'wedding',
    },
    semanticAnchors: roles.map((row, index) => ({
      anchorId: `a${index}`,
      semanticRole: row.role,
      confidence: 0.9,
      valueSpan: { sourceText: row.sourceText },
    })),
    warnings: [],
  }
}

function field(
  patch: Partial<TemplateFieldConfiguration> &
    Pick<TemplateFieldConfiguration, 'id' | 'semanticRole' | 'mode'>,
): TemplateFieldConfiguration {
  return {
    templateId: 't1',
    displayName: patch.semanticRole,
    category: 'other',
    requiredWhenVariable: false,
    detectedAnchorIds: [],
    sourceExamples: [],
    configuredBy: 'system',
    ...patch,
  }
}

function configuration(
  fields: TemplateFieldConfiguration[],
): ContractTemplateConfiguration {
  return {
    templateId: 't1',
    templateVersionId: 'v1',
    configurationVersion: 1,
    status: 'configured',
    fields,
    paymentMode: 'fixed',
    deliveryTermMode: 'fixed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function template(
  id: string,
  patch: Partial<DocumentTemplateSummary> = {},
): DocumentTemplateSummary {
  const { meta: patchMeta, ...rest } = patch
  return {
    id,
    userId: 'u1',
    name: id,
    description: null,
    docType: 'contract',
    category: 'Foto',
    status: 'incomplete',
    isDefault: false,
    currentVersionId: 'v1',
    aiAnalyzedAt: '2026-07-26T00:00:00.000Z',
    questionnaireFormId: null,
    meta: {
      version: 1,
      slotBindingsReady: false,
      generationReady: false,
      analysisVersion: 'contract-analysis@1',
      slotCounters: {
        detectedSlotCount: 22,
        requiredSlotCount: 10,
        optionalSlotCount: 12,
        boundRequiredSlotCount: 8,
        unresolvedRequiredSlotCount: 2,
        ambiguousSlotCount: 0,
        falsePositiveCount: 0,
      },
      ...patchMeta,
    },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    currentVersionNumber: 1,
    componentCount: 0,
    blockCount: 0,
    variableCount: 22,
    usageCount: 0,
    sourceFileName: 'umowa.docx',
    sourceDocxPath: 'path/umowa.docx',
    generationReady: false,
    detectedFieldCount: 22,
    safeBindingCount: 8,
    unresolvedCount: 2,
    ...rest,
  }
}

run('A — successful analysis with detected fields auto-persists ready config', () => {
  const readiness = buildAutomaticReadyConfiguration({
    templateId: 't1',
    templateVersionId: 'v1',
    semanticMap: semanticMap([
      { role: 'bride_name', sourceText: 'Aleksandra' },
      { role: 'wedding_date', sourceText: '12.06.2027' },
      { role: 'company_nip', sourceText: '525' },
    ]),
    preparation: evaluateDocumentPreparationState({
      aiAnalyzedAt: 'present',
      detectedFieldCount: 22,
      analysisVersion: 'v1',
      slotBindingsReady: false,
      generationReady: false,
    }),
  })
  equal(readiness.status, 'ready', 'ready despite incomplete bindings')
  assert(readiness.configuration != null, 'config present')
  equal(
    toPersistedAutomaticMeta(readiness).fieldConfigurationStatus,
    'ready',
    'persisted ready',
  )
})

run('B — upload does not finish before configuration persistence', () => {
  const flow = source('src/features/documents/import/SimpleContractImportFlow.tsx')
  const save = flow.indexOf('await saveTemplateFieldConfiguration({')
  const done = flow.indexOf("setPhase('done')")
  assert(save >= 0 && done > save, 'persist before done')
})

run('C — authoritative identifiers are templateId + templateVersionId', () => {
  const readiness = buildAutomaticReadyConfiguration({
    templateId: 'tmpl-abc',
    templateVersionId: 'ver-xyz',
    semanticMap: semanticMap([{ role: 'bride_name', sourceText: 'A' }]),
  })
  equal(readiness.configuration?.templateId, 'tmpl-abc', 'templateId')
  equal(readiness.configuration?.templateVersionId, 'ver-xyz', 'versionId')
  const ensure = source(
    'src/features/documents/template/ensureAutomaticTemplateConfiguration.ts',
  )
  assert(ensure.includes('templateId = document_templates.id'), 'docs identity')
  assert(ensure.includes('templateVersionId = document_template_versions.id'), 'version identity')
})

run('D — missing automatic configuration rebuilt from slot map analysis', () => {
  const slotMap: TemplateSlotMap = {
    ...emptySlotMap(),
    slots: [
      {
        id: 's1',
        registryKey: 'bride_full_name',
        label: 'Panna młoda',
        enabled: true,
        physicallyBound: true,
        sourceHint: 'couple',
        occurrences: 1,
      },
      {
        id: 's2',
        registryKey: 'wedding_date',
        label: 'Data',
        enabled: true,
        physicallyBound: true,
        sourceHint: 'wedding',
        occurrences: 1,
      },
    ],
  }
  const map = semanticMapFromSlotMap({
    templateId: 't1',
    templateVersionId: 'v1',
    slotMap,
  })
  assert(map.semanticAnchors.length === 2, 'anchors from slots')
  const readiness = buildAutomaticReadyConfiguration({
    templateId: 't1',
    templateVersionId: 'v1',
    semanticMap: map,
  })
  equal(readiness.status, 'ready', 'rebuilt ready')
})

run('E/F — self-heal migration is idempotent (single meta blob, no duplicates)', () => {
  const config = configuration([
    field({
      id: '1',
      semanticRole: 'bride_name',
      mode: 'variable',
      canonicalFieldKey: 'bride.full_name',
      variableSource: 'wedding',
      requiredWhenVariable: true,
    }),
  ])
  const legacy = template('gp', {
    meta: {
      version: 1,
      fieldConfiguration: config as unknown as Record<string, unknown>,
      fieldConfigurationStatus: 'unconfigured',
      automaticReadinessStatus: 'attention',
      automaticAttentionIssues: [
        {
          code: 'physical_slots',
          message:
            'Nie udało się przygotować pól dokumentu. Wgraj ponownie plik DOCX lub uruchom analizę jeszcze raz.',
        },
      ],
      slotBindingsReady: false,
      analysisVersion: 'v1',
      slotCounters: {
        detectedSlotCount: 22,
        requiredSlotCount: 10,
        optionalSlotCount: 12,
        boundRequiredSlotCount: 8,
        unresolvedRequiredSlotCount: 2,
        ambiguousSlotCount: 0,
        falsePositiveCount: 0,
      },
    },
  })
  const first = migrateLegacyTemplateConfiguration(legacy)
  assert(first.needsPersist, 'first migrate persists')
  equal(first.readiness.status, 'ready', 'healed ready')
  assert(
    !(first.meta.automaticAttentionIssues ?? []).some(
      (i) => i.code === 'physical_slots',
    ),
    'physical_slots cleared',
  )
  const second = migrateLegacyTemplateConfiguration({
    ...legacy,
    meta: first.meta,
  })
  assert(!second.needsPersist, 'second call idempotent')
  equal(second.readiness.status, 'ready', 'still ready')
})

run('G — stale readiness recalculated automatically', () => {
  const status = automaticStatusFromTemplate(
    template('stale', {
      meta: {
        version: 1,
        automaticReadinessStatus: 'attention',
        fieldConfigurationStatus: 'ready',
        fieldConfiguration: configuration([
          field({
            id: '1',
            semanticRole: 'bride_name',
            mode: 'variable',
            canonicalFieldKey: 'bride.full_name',
            variableSource: 'wedding',
          }),
        ]) as unknown as Record<string, unknown>,
        automaticAttentionIssues: [
          {
            code: 'physical_slots',
            message: 'Nie udało się przygotować pól dokumentu.',
          },
        ],
        analysisVersion: 'v1',
        slotBindingsReady: false,
      },
    }),
  )
  equal(status, 'ready', 'stale attention becomes ready')
})

run('H — optional unmapped field does not abort automatic config', () => {
  const readiness = computeAutomaticTemplateReadiness({
    configuration: configuration([
      field({ id: '1', semanticRole: 'film_duration', mode: 'review' }),
      field({
        id: '2',
        semanticRole: 'bride_name',
        mode: 'variable',
        canonicalFieldKey: 'bride.full_name',
        variableSource: 'wedding',
      }),
    ]),
    preparation: evaluateDocumentPreparationState({
      aiAnalyzedAt: 'x',
      detectedFieldCount: 2,
    }),
  })
  equal(readiness.status, 'ready', 'optional review ok')
})

run('I — wedding planner fields do not abort automatic config', () => {
  const planner = [...WEDDING_PLANNER_ROLES][0]!
  const finalized = finalizeAutomaticTemplateConfiguration(
    configuration([
      field({ id: '1', semanticRole: planner, mode: 'review' }),
      field({
        id: '2',
        semanticRole: 'wedding_date',
        mode: 'variable',
        canonicalFieldKey: 'wedding.date',
        variableSource: 'wedding',
      }),
    ]),
  )
  equal(
    finalized.fields.find((f) => f.semanticRole === planner)?.mode,
    'fixed',
    'planner fixed',
  )
})

run('J — preserved fixed fields do not abort', () => {
  const readiness = computeAutomaticTemplateReadiness({
    configuration: configuration([
      field({ id: '1', semanticRole: 'company_nip', mode: 'fixed' }),
    ]),
    preparation: evaluateDocumentPreparationState({
      aiAnalyzedAt: 'x',
      detectedFieldCount: 1,
    }),
  })
  equal(readiness.status, 'ready', 'fixed ok')
})

run('K — generation-time manual fields do not abort', () => {
  const readiness = computeAutomaticTemplateReadiness({
    configuration: configuration([
      field({
        id: '1',
        semanticRole: 'bride_address',
        mode: 'variable',
        variableSource: 'manual',
        requiredWhenVariable: true,
      }),
    ]),
    preparation: evaluateDocumentPreparationState({
      aiAnalyzedAt: 'x',
      detectedFieldCount: 1,
    }),
  })
  equal(readiness.status, 'ready', 'manual ok')
})

run('L/M — per-field fallback; only fatal physical blocks', () => {
  const prepOk = evaluateDocumentPreparationState({
    aiAnalyzedAt: 'x',
    detectedFieldCount: 22,
    slotBindingsReady: false,
  })
  equal(prepOk.fatalPhysicalFailure, false, 'incomplete bindings not fatal')
  equal(prepOk.documentPrepared, true, 'document prepared')
  const prepFatal = evaluateDocumentPreparationState({
    hasSourceDocx: false,
    detectedFieldCount: 0,
    aiAnalyzedAt: null,
  })
  equal(prepFatal.fatalPhysicalFailure, true, 'no source+analysis fatal')
})

run('N — existing analysis does not show wgraj ponownie DOCX', () => {
  const readiness = computeAutomaticTemplateReadiness({
    configuration: configuration([
      field({
        id: '1',
        semanticRole: 'bride_name',
        mode: 'variable',
        canonicalFieldKey: 'bride.full_name',
        variableSource: 'wedding',
      }),
    ]),
    physicalReady: false,
    preparation: evaluateDocumentPreparationState({
      aiAnalyzedAt: 'x',
      detectedFieldCount: 22,
      slotBindingsReady: false,
    }),
  })
  const meta = toPersistedAutomaticMeta(readiness)
  assert(
    !(meta.automaticAttentionIssues ?? []).some((i) =>
      i.message.includes('Wgraj ponownie'),
    ),
    'no re-upload message',
  )
  equal(readiness.status, 'ready', 'ready')
})

run('O — recoverable internal state does not show Wymaga uwagi', () => {
  equal(
    automaticStatusFromTemplate(
      template('gp', {
        meta: {
          version: 1,
          automaticReadinessStatus: 'attention',
          fieldConfigurationStatus: 'ready',
          fieldConfiguration: configuration([
            field({ id: '1', semanticRole: 'bride_name', mode: 'variable' }),
          ]) as unknown as Record<string, unknown>,
          automaticAttentionIssues: [
            { code: 'physical_slots', message: 'Wgraj ponownie' },
          ],
          analysisVersion: 'v1',
          slotBindingsReady: false,
        },
      }),
    ),
    'ready',
    'product status ready',
  )
})

run('P — repaired template becomes Gotowy', () => {
  const migrated = migrateLegacyTemplateConfiguration(
    template('gp', {
      meta: {
        version: 1,
        fieldConfiguration: configuration([
          field({
            id: '1',
            semanticRole: 'bride_name',
            mode: 'variable',
            canonicalFieldKey: 'bride.full_name',
            variableSource: 'wedding',
          }),
        ]) as unknown as Record<string, unknown>,
        fieldConfigurationStatus: 'requires_review',
        automaticReadinessStatus: 'attention',
        automaticAttentionIssues: [
          { code: 'physical_slots', message: 'fail' },
        ],
        analysisVersion: 'v1',
        slotBindingsReady: false,
      },
    }),
  )
  equal(migrated.readiness.status, 'ready', 'gotowy')
  equal(migrated.meta.automaticReadinessStatus, 'ready', 'meta ready')
})

run('Q — generation calls ensureAutomaticTemplateConfiguration', () => {
  const src = source(
    'src/features/documents/template/WeddingContractGenerationService.ts',
  )
  assert(src.includes('ensureAutomaticTemplateConfiguration'), 'generation heals')
})

run('R — detail page heals on load', () => {
  const src = source('src/pages/DocumentTemplateDetailPage.tsx')
  assert(src.includes('ensureAutomaticTemplateConfiguration'), 'detail heals')
  assert(src.includes('Przygotowujemy szablon'), 'healing copy')
})

run('S — persistence adapter uses template meta keyed by templateId', () => {
  const persist = source(
    'src/features/ai-contract-lab/persistTemplateFieldConfiguration.ts',
  )
  assert(persist.includes('documentTemplateService.update(input.templateId'), 'update by templateId')
  assert(persist.includes('evaluateDocumentPreparationState'), 'prep-aware')
})

run('T — ownership uses template service update (RLS owner path)', () => {
  const ensure = source(
    'src/features/documents/template/ensureAutomaticTemplateConfiguration.ts',
  )
  assert(ensure.includes('documentTemplateService.update(templateId'), 'owner update')
})

run('U/V — primary template screen hides detected count and analysis version', () => {
  const detail = source('src/pages/DocumentTemplateDetailPage.tsx')
  assert(!detail.includes('Wykryte zmienne'), 'no detected vars')
  assert(!detail.includes('Wersja analizy'), 'no analysis version')
})

run('W — advanced settings still show diagnostics', () => {
  const adv = source('src/pages/DocumentTemplateFieldConfigPage.tsx')
  assert(adv.includes('Diagnostyka AI'), 'diagnostics')
  assert(adv.includes('Wykryte zmienne'), 'count in advanced')
})

run('X — retry reruns automatic preparation without re-upload', () => {
  const detail = source('src/pages/DocumentTemplateDetailPage.tsx')
  assert(detail.includes('Spróbuj ponownie'), 'retry action')
  assert(detail.includes('setHealNonce'), 'retry heals')
  assert(!detail.includes('Wgraj ponownie plik DOCX'), 'no reupload CTA')
})

if (!process.exitCode) {
  console.log('All automatic-configuration regression checks passed.')
}
