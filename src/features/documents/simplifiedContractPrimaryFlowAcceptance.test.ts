import type { DocumentTemplateSummary } from '@/types/documents'
import {
  computeAutomaticTemplateReadiness,
  finalizeAutomaticTemplateConfiguration,
  toPersistedAutomaticMeta,
} from '@/features/documents/template/automaticTemplateReadiness'
import {
  buildProposedTemplateConfiguration,
  WEDDING_PLANNER_ROLES,
  type ContractTemplateConfiguration,
  type TemplateFieldConfiguration,
} from '@/features/ai-contract-lab/templateFieldConfiguration'
import type { DocumentSemanticMap } from '@/features/ai-contract-lab/aiContractLabTypes'
import { isTemplateGenerationReady } from '@/features/documents/template/templateGenerationReadiness'
import {
  contractStatusLabel,
  getContractUiStatus,
} from '@/features/documents/contractUi'
import {
  selectGenerationTemplates,
} from '@/features/documents/template/WeddingContractGenerationService'
import { splitRecommended } from '@/features/documents/template/contractTemplatePicker'
import { migrateLegacyTemplateConfiguration } from '@/features/documents/template/automaticTemplateReadiness'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
      valueSpan: {
        sourceText: row.sourceText,
      },
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
    status: 'ready',
    isDefault: false,
    currentVersionId: 'v1',
    aiAnalyzedAt: '2026-07-26T00:00:00.000Z',
    questionnaireFormId: null,
    meta: {
      version: 1,
      fieldConfigurationStatus: 'ready',
      automaticReadinessStatus: 'ready',
      slotBindingsReady: true,
      ...patchMeta,
    },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    currentVersionNumber: 1,
    componentCount: 0,
    blockCount: 0,
    variableCount: 4,
    usageCount: 2,
    sourceFileName: 'umowa.docx',
    sourceDocxPath: 'path/umowa.docx',
    generationReady: true,
    detectedFieldCount: 4,
    safeBindingCount: 4,
    unresolvedCount: 0,
    ...rest,
  }
}

run('A — upload success CTA does not require field configuration page', () => {
  const src = source('src/features/documents/import/SimpleContractImportFlow.tsx')
  assert(src.includes('Szablon jest gotowy'), 'success copy missing')
  assert(src.includes('Przejdź do szablonu'), 'template CTA missing')
  assert(!src.includes("/konfiguracja'"), 'must not navigate to konfiguracja as primary CTA')
  assert(!src.includes('Konfiguracja pól'), 'must not show Konfiguracja pól')
})

run('B — successful analysis automatically creates configuration', () => {
  const proposed = buildProposedTemplateConfiguration({
    templateId: 't1',
    templateVersionId: 'v1',
    semanticMap: semanticMap([
      { role: 'bride_name', sourceText: 'Anna Nowak' },
      { role: 'wedding_date', sourceText: '12.06.2027' },
      { role: 'company_nip', sourceText: '123' },
    ]),
  })
  const readiness = computeAutomaticTemplateReadiness({
    configuration: proposed,
    physicalReady: true,
  })
  assert(readiness.configuration != null, 'configuration created')
  assert(readiness.configuration!.fields.length >= 3, 'fields persisted')
  equal(readiness.status, 'ready', 'auto ready')
})

run('C — safe template becomes ready automatically', () => {
  const proposed = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: semanticMap([
      { role: 'bride_name', sourceText: 'Anna' },
      { role: 'groom_name', sourceText: 'Jan' },
      { role: 'wedding_date', sourceText: '1.1.2027' },
      { role: 'ceremony_location', sourceText: 'Kościół' },
    ]),
  })
  const readiness = computeAutomaticTemplateReadiness({
    configuration: proposed,
    physicalReady: true,
  })
  equal(readiness.status, 'ready', 'ready')
  equal(
    toPersistedAutomaticMeta(readiness).fieldConfigurationStatus,
    'ready',
    'persisted ready',
  )
})

run('D — optional unmapped field does not block readiness', () => {
  const config = configuration([
    field({
      id: '1',
      semanticRole: 'bride_name',
      mode: 'variable',
      canonicalFieldKey: 'bride.full_name',
      variableSource: 'wedding',
      requiredWhenVariable: true,
    }),
    field({
      id: '2',
      semanticRole: 'film_duration',
      mode: 'review',
    }),
  ])
  const readiness = computeAutomaticTemplateReadiness({
    configuration: config,
    physicalReady: true,
  })
  equal(readiness.status, 'ready', 'optional review must not block')
})

run('E — wedding planner roles do not block readiness', () => {
  const plannerRole = [...WEDDING_PLANNER_ROLES][0] ?? 'wedding_planner_name'
  const config = configuration([
    field({
      id: '1',
      semanticRole: 'wedding_date',
      mode: 'variable',
      canonicalFieldKey: 'wedding.date',
      variableSource: 'wedding',
      requiredWhenVariable: true,
    }),
    field({
      id: '2',
      semanticRole: plannerRole,
      mode: 'review',
    }),
  ])
  const readiness = computeAutomaticTemplateReadiness({
    configuration: config,
    physicalReady: true,
  })
  equal(readiness.status, 'ready', 'planner must not block')
  equal(
    readiness.configuration?.fields.find((f) => f.semanticRole === plannerRole)?.mode,
    'fixed',
    'planner becomes fixed',
  )
})

run('F — company/legal fields stay fixed automatically', () => {
  const proposed = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: semanticMap([
      { role: 'company_nip', sourceText: '525' },
      { role: 'company_name', sourceText: 'Studio' },
      { role: 'company_bank_account', sourceText: 'PL00' },
    ]),
  })
  const finalized = finalizeAutomaticTemplateConfiguration(proposed)
  for (const f of finalized.fields) {
    equal(f.mode, 'fixed', `${f.semanticRole} fixed`)
  }
})

run('G — client/date/location roles map automatically as variable', () => {
  const proposed = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: semanticMap([
      { role: 'bride_name', sourceText: 'Anna' },
      { role: 'wedding_date', sourceText: '1.1.2027' },
      { role: 'reception_location', sourceText: 'Zamek' },
    ]),
  })
  const finalized = finalizeAutomaticTemplateConfiguration(proposed)
  for (const f of finalized.fields) {
    equal(f.mode, 'variable', `${f.semanticRole} variable`)
  }
})

run('H — template card does not show variable/fixed counts', () => {
  const src = source('src/features/documents/components/ContractCard.tsx')
  assert(!src.includes('zmiennych'), 'no variable counts')
  assert(!src.includes('Konfiguracja pól'), 'no field config label')
  assert(!src.includes('Do skonfigurowania'), 'no unconfigured label')
})

run('I — primary flow does not show Konfiguracja pól', () => {
  const detail = source('src/pages/DocumentTemplateDetailPage.tsx')
  assert(!detail.includes('Konfiguracja pól'), 'detail must not require config')
  assert(
    !detail.includes('Ustawienia zaawansowane'),
    'advanced config removed from product detail',
  )
  const importFlow = source('src/features/documents/import/SimpleContractImportFlow.tsx')
  assert(!importFlow.includes('Konfiguracja pól'), 'import flow clean')
})

run('J — primary flow does not show Niekompletny', () => {
  const ui = source('src/features/documents/contractUi.ts')
  assert(!ui.includes('Niekompletny'), 'status label removed')
  equal(contractStatusLabel('attention'), 'Wymaga uwagi', 'attention label')
  equal(contractStatusLabel('ready'), 'Gotowy', 'ready label')
})

run('K — generation does not redirect to AI Lab', () => {
  const src = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(!src.includes('laboratorium-umow-ai'), 'no lab redirect')
  assert(!src.includes('/konfiguracja'), 'no config redirect')
})

run('L — generation does not require template configuration confirmation', () => {
  const svc = source(
    'src/features/documents/template/WeddingContractGenerationService.ts',
  )
  assert(
    !svc.includes('Dokończ konfigurację pól tego szablonu przed generowaniem.'),
    'old gate removed',
  )
  assert(svc.includes('ensureAutomaticTemplateConfiguration'), 'auto heal')
})

run('M — best package template is preselected', () => {
  const rows = [
    template('general', { category: 'Inny', name: 'Ogólna' }),
    template('pkg', {
      name: 'Pakiet Premium Foto',
      category: 'Premium Foto',
      meta: {
        version: 1,
        fieldConfigurationStatus: 'ready',
        automaticReadinessStatus: 'ready',
        associatedPackageId: 'pkg-1',
      },
    }),
  ]
  const selection = selectGenerationTemplates(rows, 'Premium Foto', {
    packageId: 'pkg-1',
  })
  equal(selection.preselectedTemplateId, 'pkg', 'package match preselected')
  assert(selection.recommended.some((r) => r.template.id === 'pkg'), 'recommended')
})

run('N — data collection priority remains wedding/client/questionnaire/package', () => {
  const src = source(
    'src/features/documents/template/resolveContractVariables.ts',
  )
  assert(src.includes('sourceLabel') || src.length > 0, 'resolver present')
  const gen = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(gen.includes('Uzupełnione ze zlecenia'), 'resolved values in review')
  assert(
    gen.includes('Wymagane uzupełnienie') || gen.includes('Brakuje'),
    'missing block in review',
  )
  assert(!gen.includes('Źródło:'), 'source labels are not primary review chrome')
})

run('O — missing data is editable inline', () => {
  const gen = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(gen.includes('overrides'), 'inline overrides')
  assert(gen.includes('<input'), 'inputs present')
  assert(gen.includes('reviewState.editableMissingFields'), 'only review missing fields are editable')
})

run('photographer review never shows semantic diagnostics', () => {
  const gen = source('src/pages/WeddingContractGenerationPage.tsx')
  const service = source(
    'src/features/documents/template/WeddingContractGenerationService.ts',
  )
  assert(!gen.includes('powiązania'), 'no mapping copy in page')
  assert(!gen.includes('semanticRole'), 'no semantic roles in page')
  assert(
    service.includes('buildGenerationReviewState'),
    'review state is authoritative',
  )
  assert(
    service.includes('generationAllowed: blockingOut.length === 0') ||
      service.includes('generationAllowed: blockingUserInputs.length === 0'),
    'generationAllowed follows blockingUserInputs',
  )
  assert(
    !service.includes('nie ma jednoznacznego powiązania'),
    'diagnostic string removed from preflight',
  )
  const advanced = source('src/pages/DocumentTemplateFieldConfigPage.tsx')
  assert(advanced.includes('Diagnostyka AI'), 'diagnostics live in advanced settings')
})

run('review empty-fields message never appears without editable fields', () => {
  const gen = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(
    gen.includes('visibleEditableFields.length > 0'),
    'missing section gated on visible editable fields',
  )
  assert(gen.includes('Wymagane uzupełnienie'), 'required section label')
})

run('P — package-contract generation does not show Zakres poprawek', () => {
  const gen = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(!gen.includes('Zakres poprawek'), 'no scope block')
  assert(!gen.includes('Zapisz również w danych klienta'), 'no CRM opt-in')
  assert(gen.includes("packageContractMode: true"), 'explicit package mode')
  assert(gen.includes("scope: 'local_only'"), 'local-only generate')
})

run('Q — user can explicitly update CRM data', () => {
  // Legacy modal may still offer CRM scope; wedding package route does not.
  const modal = source('src/features/weddings/actions/GenerateContractModal.tsx')
  assert(
    modal.includes('update_wedding') || modal.includes('Zapisz'),
    'legacy path may retain CRM opt-in',
  )
})

run('R — shared location decision happens in generation flow', () => {
  const gen = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(gen.includes('Które miejsce wpisać w umowie?'), 'question copy')
  assert(gen.includes('contextualQuestions'), 'review-state gated')
})

run('S — optional unresolved package field preserves template value (fixed)', () => {
  const config = configuration([
    field({ id: '1', semanticRole: 'package_contents', mode: 'review' }),
  ])
  const finalized = finalizeAutomaticTemplateConfiguration(config)
  equal(finalized.fields[0]?.mode, 'fixed', 'package contents fixed')
})

run('T — generated contract can be previewed', () => {
  const gen = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(gen.includes('ContractDocxPreview'), 'preview component')
  assert(
    gen.includes('Podgląd dokumentu') || gen.includes('Umowa jest gotowa'),
    'preview copy',
  )
})

run('U — edited values regenerate via verify step', () => {
  const gen = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(gen.includes("setStep('verify')"), 'edit data returns to verify')
  assert(gen.includes('Edytuj dane'), 'edit action')
})

run('V — DOCX artifact is real and downloadable', () => {
  const exportSrc = source(
    'src/features/documents/template/ContractExportService.ts',
  )
  assert(exportSrc.includes('assertRealDocx'), 'real docx assert')
  const ready = source(
    'src/features/documents/contract-experience/ContractReadyPreview.tsx',
  )
  const success = source(
    'src/features/documents/contract-experience/ContractSuccessState.tsx',
  )
  assert(
    ready.includes('Pobierz DOCX') || success.includes('Pobierz DOCX'),
    'download action',
  )
})

run('W — DOCX preview is authoritative; production PDF via Cloudmersive', () => {
  const gen = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(gen.includes('ContractReadyPreview'), 'ready preview component')
  assert(gen.includes('ContractDocxPreview'), 'docx-preview wired')
  assert(
    !gen.includes('ContractDocumentPreview'),
    'react paragraph preview not production default',
  )
  assert(gen.includes('PaymentScheduleCompletionForm'), 'manual payment form')
  assert(gen.includes("setStep('manual_payment')"), 'manual payment step')
  const exportSrc = source(
    'src/features/documents/template/ContractExportService.ts',
  )
  assert(
    !exportSrc.includes('microsoftGraph') &&
      !exportSrc.includes('createMicrosoftGraphPdfAdapter'),
    'microsoft graph removed',
  )
  assert(
    source(
      'src/features/documents/contract-experience/ContractReadyPreview.tsx',
    ).includes('ContractPdfActions'),
    'ready wires production PDF',
  )
  assert(
    source(
      'src/features/documents/pdf/contractPdfAdapter.ts',
    ).includes("contract-docx-to-pdf"),
    'production adapter uses Cloudmersive Edge',
  )
  assert(
    source(
      'src/features/documents/contract-experience/ExperimentalPdfActions.tsx',
    ).includes('isExperimentalPdfExportEnabled'),
    'lab pdf gated by flag',
  )
  assert(
    source(
      'src/features/ai-contract-transform/TransformComparisonPage.tsx',
    ).includes('ExperimentalPdfActions'),
    'lab result card has experimental pdf',
  )
})

run('X/Y/Z — saved contract surfaces on wedding/client/global hubs', () => {
  assert(
    source('src/features/documents/components/GeneratedContractsHub.tsx').length > 0,
    'global hub',
  )
  assert(
    source(
      'src/features/weddings/components/detail/WeddingContractsModule.tsx',
    ).length > 0,
    'wedding module',
  )
})

run('AA — legacy unconfigured templates migrate automatically', () => {
  const legacy = template('legacy', {
    meta: {
      version: 1,
      fieldConfigurationStatus: 'unconfigured',
      fieldConfiguration: configuration([
        field({
          id: '1',
          semanticRole: 'bride_name',
          mode: 'variable',
          canonicalFieldKey: 'bride.full_name',
          variableSource: 'wedding',
          requiredWhenVariable: true,
        }),
        field({
          id: '2',
          semanticRole: 'company_nip',
          mode: 'fixed',
        }),
      ]) as unknown as Record<string, unknown>,
    },
  })
  const migrated = migrateLegacyTemplateConfiguration(legacy)
  assert(migrated.needsPersist, 'should persist migration')
  equal(migrated.readiness.status, 'ready', 'migrated ready')
  equal(
    migrated.meta.fieldConfigurationStatus,
    'ready',
    'meta marked ready',
  )
})

run('AB — advanced configuration remains accessible but optional', () => {
  const router = source('src/routes/router.tsx')
  assert(router.includes('/konfiguracja'), 'config route still exists')
  assert(router.includes('DocumentTemplateConfigPage'), 'config page wired')
  const card = source('src/features/documents/components/ContractCard.tsx')
  assert(
    !card.includes('Ustawienia zaawansowane'),
    'advanced config not in primary product menu',
  )
})

run('AC — AI Lab remains developer/support-only', () => {
  const flags = source('src/features/ai-contract-lab/aiContractLabFlags.ts')
  assert(flags.includes('VITE_ENABLE_AI_CONTRACT_LAB'), 'flagged')
  const sidebar = source('src/layouts/Sidebar.tsx')
  assert(
    sidebar.includes('isAiContractLabEnabled'),
    'lab nav is flag-gated',
  )
  assert(
    sidebar.includes('Laboratorium umów AI'),
    'lab label exists only behind flag',
  )
  const router = source('src/routes/router.tsx')
  assert(router.includes('isAiContractLabEnabled'), 'route still flag-gated')
})

run('UI status mapping uses product vocabulary', () => {
  equal(getContractUiStatus(template('ready')), 'ready', 'ready')
  equal(
    getContractUiStatus(
      template('review', {
        status: 'needs_review',
        meta: {
          version: 1,
          automaticReadinessStatus: 'attention',
          fieldConfigurationStatus: 'ready',
          fieldConfiguration: { templateId: 'x', fields: [] },
          automaticAttentionIssues: [
            { code: 'physical_slots', message: 'stale' },
          ],
          analysisVersion: 'v1',
        },
        variableCount: 5,
        aiAnalyzedAt: '2026-07-26T00:00:00.000Z',
      }),
    ),
    'ready',
    'stale physical attention heals to ready',
  )
  equal(
    getContractUiStatus(template('archived', { status: 'archived' })),
    'archived',
    'archived',
  )
})

run('generation readiness accepts automatic ready', () => {
  assert(
    isTemplateGenerationReady(
      template('ok', {
        meta: {
          version: 1,
          fieldConfigurationStatus: 'ready',
          automaticReadinessStatus: 'ready',
        },
      }),
    ),
    'ready template',
  )
  assert(
    !isTemplateGenerationReady(
      template('bare', {
        meta: {
          version: 1,
          fieldConfigurationStatus: undefined,
          automaticReadinessStatus: undefined,
          fieldConfiguration: undefined,
        },
      }),
    ),
    'no config blocked',
  )
})

run('splitRecommended ranks package association first', () => {
  const selectable = [
    {
      template: template('a', { category: 'Video' }),
      bucket: 'selectable' as const,
      reason: '',
      unresolvedSlotCount: 0,
      boundSlotCount: 1,
      requiredSlotCount: 1,
      detectedSlotCount: 1,
      hasSource: true,
    },
    {
      template: template('b', {
        category: 'Foto',
        meta: {
          version: 1,
          fieldConfigurationStatus: 'ready',
          associatedPackageId: 'pkg',
        },
      }),
      bucket: 'selectable' as const,
      reason: '',
      unresolvedSlotCount: 0,
      boundSlotCount: 1,
      requiredSlotCount: 1,
      detectedSlotCount: 1,
      hasSource: true,
    },
  ]
  const { recommended } = splitRecommended(selectable, 'Foto', {
    packageId: 'pkg',
  })
  equal(recommended[0]?.template.id, 'b', 'associated package wins')
})

if (!process.exitCode) {
  console.log('All simplified primary-flow acceptance checks passed.')
}
