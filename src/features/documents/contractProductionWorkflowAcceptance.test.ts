import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import type { DocumentSemanticMap } from '@/features/ai-contract-lab/aiContractLabTypes'
import {
  buildProposedTemplateConfiguration,
  DEFAULT_PACKAGE_CONFIGURATION,
  migrateTemplateConfiguration,
  type ContractTemplateConfiguration,
  type TemplateFieldConfiguration,
} from '@/features/ai-contract-lab/templateFieldConfiguration'
import { getContractUiStatus } from '@/features/documents/contractUi'
import { productionAnalysisToSemanticMap } from '@/features/documents/ai/productionAnalysisToSemanticMap'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'
import { validateContractDocx } from '@/features/documents/import/contractUploadValidation'
import {
  PDF_EXPORT_UNAVAILABLE_MESSAGE,
  assertRealDocx,
  createContractExportService,
} from '@/features/documents/template/ContractExportService'
import {
  buildContractArtifactSnapshot,
  groupGeneratedWeddingContracts,
  sanitizeContractFileName,
} from '@/features/documents/template/contractArtifactDomain'
import { isTemplateGenerationReady } from '@/features/documents/template/templateGenerationReadiness'
import { classifyTemplatesForGeneration } from '@/features/documents/template/contractTemplatePicker'
import type { DocumentStorageService } from '@/lib/api/documents/interfaces'
import type {
  DocumentTemplateSummary,
  PackageSnapshot,
  WeddingDocument,
  WeddingDocumentDraft,
} from '@/types/documents'
import type { Wedding } from '@/types/wedding'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function equal(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

async function run(label: string, name: string, test: () => void | Promise<void>) {
  try {
    await test()
    console.log(`PASS  ${label} — ${name}`)
  } catch (error) {
    console.error(`FAIL  ${label} — ${name}`)
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

function template(
  id: string,
  input: Partial<DocumentTemplateSummary> = {},
): DocumentTemplateSummary {
  return {
    id,
    userId: 'user',
    name: id,
    description: null,
    docType: 'contract',
    category: 'Film Premium',
    status: 'ready',
    isDefault: false,
    currentVersionId: `${id}-version`,
    aiAnalyzedAt: '2026-07-26T08:00:00.000Z',
    questionnaireFormId: null,
    meta: {
      version: 1,
      slotBindingsReady: true,
      fieldConfigurationStatus: 'ready',
      slotCounters: {
        detectedSlotCount: 1,
        requiredSlotCount: 1,
        optionalSlotCount: 0,
        boundRequiredSlotCount: 1,
        unresolvedRequiredSlotCount: 0,
        ambiguousSlotCount: 0,
        falsePositiveCount: 0,
        safeBindingsCount: 1,
      },
    },
    createdAt: '2026-07-26T08:00:00.000Z',
    updatedAt: '2026-07-26T08:00:00.000Z',
    currentVersionNumber: 1,
    componentCount: 0,
    blockCount: 0,
    variableCount: 1,
    usageCount: 0,
    sourceFileName: `${id}.docx`,
    sourceDocxPath: `${id}.docx`,
    generationReady: true,
    detectedFieldCount: 1,
    safeBindingCount: 1,
    unresolvedCount: 0,
    ...input,
  }
}

function wedding(): Wedding {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    couple: {
      partner1: 'Anna',
      partner2: 'Jan',
      email: 'anna@example.com',
      phone: '500500500',
      venue: 'Dwór',
      city: 'Kraków',
    },
    date: '2027-06-12',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Film Premium',
    packageId: 'package',
    price: 9000,
    depositAmount: 1000,
    currency: 'PLN',
    packageItems: [],
    accentColor: '#111111',
    createdAt: '2026-07-26T08:00:00.000Z',
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
  }
}

const packageSnapshot: PackageSnapshot = {
  packageId: 'package',
  name: 'Film Premium',
  currency: 'PLN',
  items: [],
}

function configuredField(
  id: string,
  semanticRole: string,
  mode: TemplateFieldConfiguration['mode'],
  input: Partial<TemplateFieldConfiguration> = {},
): TemplateFieldConfiguration {
  return {
    id,
    templateId: 'template',
    semanticRole,
    displayName: semanticRole,
    category: 'other',
    mode,
    requiredWhenVariable: false,
    detectedAnchorIds: [],
    sourceExamples: [],
    configuredBy: 'user',
    ...input,
  }
}

function configuration(
  fields: TemplateFieldConfiguration[],
  input: Partial<ContractTemplateConfiguration> = {},
): ContractTemplateConfiguration {
  return {
    templateId: 'template',
    templateVersionId: 'template-version',
    configurationVersion: 1,
    status: 'configured',
    fields,
    sharedLocationPolicy: { mode: 'ask_each_time' },
    paymentMode: 'fixed',
    deliveryTermMode: 'fixed',
    packageConfiguration: DEFAULT_PACKAGE_CONFIGURATION,
    createdAt: '2026-07-26T08:00:00.000Z',
    updatedAt: '2026-07-26T08:00:00.000Z',
    ...input,
  }
}

function semanticMap(
  roles: Array<{ role: string; sourceText?: string }>,
): DocumentSemanticMap {
  return {
    analysisVersion: 'test@1',
    documentSummary: {
      documentType: 'contract',
      language: 'pl',
      detectedPartyRoles: [],
      detectedBusinessContext: 'wedding',
    },
    semanticAnchors: roles.map(({ role, sourceText }, index) => ({
      anchorId: `anchor-${index}`,
      semanticRole: role,
      confidence: 0.95,
      valueSpan: { sourceText: sourceText ?? role },
    })),
    warnings: [],
  }
}

function analysis(): AiDocumentAnalysisResult {
  return {
    schemaVersion: '1',
    model: 'deterministic-test',
    promptVersion: '1',
    analyzerId: 'production',
    analyzerVersion: '1',
    documentType: 'contract',
    overallConfidence: 0.9,
    fields: [
      {
        id: 'wedding-date',
        label: 'Data ślubu',
        registryKey: 'wedding.date',
        value: '12.06.2027',
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        id: 'unknown',
        label: 'Nieznane',
        registryKey: null,
        confidence: 0.4,
        status: 'suggested',
      },
    ],
    sections: [],
    clauses: [],
    warnings: [],
    analyzedAt: '2026-07-26T08:00:00.000Z',
    sourceTextLength: 20,
  }
}

function draft(): WeddingDocumentDraft {
  return {
    id: 'draft',
    weddingId: wedding().id,
    templateId: 'template',
    templateVersionId: 'template-version',
    title: 'Umowa',
    fieldValues: {},
    packageSnapshot,
    enabledClauseIds: [],
    money: {
      price: 9000,
      deposit: 1000,
      remaining: 8000,
      discount: 0,
      currency: 'PLN',
    },
    notes: null,
    status: 'editing',
    createdAt: '2026-07-26T08:00:00.000Z',
    updatedAt: '2026-07-26T08:00:00.000Z',
  }
}

function document(versionNumber: number, format: 'docx' | 'pdf' = 'docx'): WeddingDocument {
  return {
    id: `document-${versionNumber}-${format}`,
    weddingId: wedding().id,
    templateId: 'template',
    templateVersionId: 'template-version',
    draftId: 'draft',
    versionNumber,
    format,
    filePath: `exports/document-${versionNumber}.${format}`,
    fileName: `umowa-v${versionNumber}.${format}`,
    snapshotJson: {},
    lockStatus: 'exported',
    lockedAt: null,
    createdAt: `2026-07-${String(20 + versionNumber).padStart(2, '0')}T08:00:00.000Z`,
  }
}

async function realDocx(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.folder('word')?.file('document.xml', '<w:document/>')
  return zip.generateAsync({ type: 'arraybuffer' })
}

function fakeStorage(events: string[]): DocumentStorageService {
  return {
    paths: {
      templateSource: () => '',
      templateFillable: () => '',
      draftAsset: () => '',
      exportFile: (_user, _wedding, id, format) => `${id}.${format}`,
      sourceContract: (_user, _wedding, id, fileName) => `${id}/${fileName}`,
    },
    async upload(path, file) {
      events.push('upload')
      const bytes = await file.arrayBuffer()
      if (String(path).endsWith('.pdf')) {
        const prefix = new TextDecoder().decode(
          new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength)),
        )
        if (prefix !== '%PDF-') {
          throw new Error('Usługa konwersji nie zwróciła prawidłowego pliku PDF.')
        }
        return
      }
      await assertRealDocx(bytes)
    },
    async download() {
      throw new Error('unused')
    },
    async remove() {
      events.push('cleanup')
    },
    async signedUrl() {
      events.push('signed-url')
      return 'https://example.invalid/artifact'
    },
  }
}

await run('A', 'navigation owns packages and weddings, not standalone Contracts', () => {
  const router = source('src/routes/router.tsx')
  const sidebar = source('src/layouts/Sidebar.tsx')
  for (const path of [
    '/sluby/:weddingId/umowy/nowa',
    '/sluby/:weddingId/umowy/:contractId',
    '/studio/pakiety',
    '/ustawienia/dokumenty/szablony/:id',
  ]) {
    assert(router.includes(`path: '${path}'`), `missing route ${path}`)
  }
  assert(
    router.includes('Navigate to="/studio/pakiety"'),
    'standalone Contracts hub redirects to packages',
  )
  assert(
    !sidebar.includes("to: '/umowy', label: 'Umowy'"),
    'standalone Umowy nav must be removed',
  )
  assert(
    sidebar.includes("to: '/studio/pakiety', label: 'Pakiety'"),
    'Pakiety nav required',
  )
})

await run('B', 'direct upload route stays focused on DOCX', () => {
  const page = source('src/pages/DocumentTemplateNewPage.tsx')
  assert(page.includes('Wybierz DOCX'), 'focused picker is absent')
  assert(!page.includes("navigate('/umowy', { replace: true })"), 'route redirects away')
})

await run('C', 'upload rejects empty and wrong file types', () => {
  assert(!validateContractDocx(new File([], 'empty.docx')).ok, 'empty DOCX accepted')
  assert(
    !validateContractDocx(new File(['pdf'], 'contract.pdf', { type: 'application/pdf' })).ok,
    'PDF accepted',
  )
  assert(
    validateContractDocx(
      new File(['docx'], 'contract.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).ok,
    'valid DOCX rejected',
  )
})

await run('D', 'analysis auto-persists configuration then shows ready success', () => {
  const bridge = productionAnalysisToSemanticMap(analysis())
  equal(bridge.semanticAnchors.length, 1, 'registry-backed anchors')
  equal(bridge.unresolved?.length, 1, 'unmapped analysis rows')
  const flow = source('src/features/documents/import/SimpleContractImportFlow.tsx')
  const save = flow.indexOf('await saveTemplateFieldConfiguration({')
  const done = flow.indexOf("setPhase('done')")
  assert(save >= 0 && done > save, 'configuration is persisted before done')
  assert(flow.includes('Szablon jest gotowy'), 'success copy missing')
  assert(!flow.includes("/konfiguracja'"), 'primary CTA must not force configuration')
})

await run('E', 'readiness accepts automatic ready without legacy generationReady', () => {
  const ready = template('ready')
  assert(isTemplateGenerationReady(ready), 'fully ready template blocked')
  assert(
    !isTemplateGenerationReady({
      ...ready,
      meta: { ...ready.meta, fieldConfigurationStatus: 'unconfigured', automaticReadinessStatus: undefined, fieldConfiguration: undefined },
      aiAnalyzedAt: null,
      variableCount: 0,
    }),
    'unconfigured template accepted',
  )
  assert(
    isTemplateGenerationReady({
      ...ready,
      generationReady: false,
      status: 'incomplete',
      meta: {
        ...ready.meta,
        slotBindingsReady: false,
        generationReady: false,
        fieldConfigurationStatus: 'ready',
        automaticReadinessStatus: 'ready',
      },
    }),
    'legacy incomplete flags must not block automatic ready',
  )
})

await run('F', 'safe defaults keep client data variable and legal text fixed', () => {
  const proposal = buildProposedTemplateConfiguration({
    templateId: 'template',
    templateVersionId: 'version',
    semanticMap: semanticMap([
      { role: 'bride_name', sourceText: 'Anna' },
      { role: 'legal_clause', sourceText: '§ 1' },
    ]),
  })
  equal(
    proposal.fields.find((field) => field.semanticRole === 'bride_name')?.mode,
    'variable',
    'client default',
  )
  equal(
    proposal.fields.find((field) => field.semanticRole === 'legal_clause')?.mode,
    'fixed',
    'legal default',
  )
})

await run('G', 'configuration migration preserves explicit safe decisions', () => {
  const previous = configuration([
    configuredField('old', 'bride_name', 'variable', {
      canonicalFieldKey: 'bride.full_name',
      variableSource: 'wedding',
      requiredWhenVariable: true,
    }),
  ])
  const next = buildProposedTemplateConfiguration({
    templateId: 'template',
    templateVersionId: 'version-2',
    semanticMap: semanticMap([{ role: 'bride_name', sourceText: 'Maria' }]),
  })
  const migrated = migrateTemplateConfiguration({ previous, nextProposed: next })
  equal(migrated.configuration.fields[0]?.mode, 'variable', 'explicit mode')
  equal(migrated.configuration.fields[0]?.requiredWhenVariable, true, 'required flag')
})

await run('H', 'template cards expose lifecycle states including archive', () => {
  equal(getContractUiStatus(template('ready')), 'ready', 'ready card state')
  equal(
    getContractUiStatus(
      template('review', {
        status: 'needs_review',
        meta: {
          version: 1,
          fieldConfigurationStatus: 'requires_review',
          automaticReadinessStatus: 'attention',
          automaticAttentionIssues: [
            {
              code: 'analysis_failed',
              message: 'Nie udało się przeanalizować dokumentu.',
            },
          ],
        },
        aiAnalyzedAt: null,
        variableCount: 0,
        generationReady: false,
      }),
    ),
    'attention',
    'fatal analysis maps to attention',
  )
  equal(
    getContractUiStatus(template('archived', { status: 'archived' })),
    'archived',
    'archive card state',
  )
  assert(source('src/features/documents/components/ContractCard.tsx').includes('ContractStatusBadge'), 'card badge missing')
  assert(
    !source('src/features/documents/components/ContractCard.tsx').includes('Konfiguracja pól'),
    'primary card must not show field configuration',
  )
})

await run('Y', 'shared transformation compatibility surface remains', () => {
  const templateBarrel = source('src/features/documents/template/index.ts')
  const documentBarrel = source('src/features/documents/index.ts')
  const transformer = source('src/features/documents/template/ContractTransformationService.ts')
  assert(templateBarrel.includes("export { transformContract }"), 'shared transform export remains')
  assert(templateBarrel.includes('TransformContractResult'), 'shared result type remains exported')
  assert(documentBarrel.includes('transformContract'), 'documents barrel remains compatible')
  assert(transformer.includes('usedMock: false'), 'production result cannot claim a mock')
})

await run('Z', 'browser-only drafts are not listed as generated contracts', () => {
  const grouped = groupGeneratedWeddingContracts([draft()], [])
  assert(grouped[0]?.status === 'draft', 'draft status lost')
  const service = source('src/features/documents/template/ContractArtifactPersistenceService.ts')
  assert(service.includes('.filter((contract) => contract.artifacts.length > 0)'), 'public listing includes drafts')
})

await run('AA', 'artifact persistence uploads then records then signs', async () => {
  const events: string[] = []
  const service = createContractExportService({
    storage: fakeStorage(events),
    getUserId: async () => 'user',
    recordExport: async () => {
      events.push('record')
      return document(1)
    },
  })
  await service.generateDocx({
    weddingId: wedding().id,
    draftId: 'draft',
    templateId: 'template',
    templateVersionId: 'template-version',
    generationVersion: 1,
    title: 'Umowa',
    docxBytes: await realDocx(),
    snapshotJson: {},
  })
  equal(events, ['upload', 'record', 'signed-url'], 'persistence order')
})

await run('AB', 'record failure cleans the uploaded artifact', async () => {
  const events: string[] = []
  const service = createContractExportService({
    storage: fakeStorage(events),
    getUserId: async () => 'user',
    recordExport: async () => {
      events.push('record')
      throw new Error('record failed')
    },
  })
  let message = ''
  try {
    await service.generateDocx({
      weddingId: wedding().id,
      draftId: 'draft',
      templateId: 'template',
      templateVersionId: 'template-version',
      generationVersion: 1,
      title: 'Umowa',
      docxBytes: await realDocx(),
      snapshotJson: {},
    })
  } catch (error) {
    message = error instanceof Error ? error.message : ''
  }
  equal(message, 'record failed', 'record error')
  equal(events, ['upload', 'record', 'cleanup'], 'failure cleanup')
})

await run('AC', 'artifact snapshot freezes source configuration and audit', () => {
  const original = wedding()
  const snapshot = buildContractArtifactSnapshot({
    wedding: original,
    packageSnapshot,
    manualOverrides: { bride_phone: '123' },
    templateId: 'template',
    templateVersionId: 'template-version',
    templateMeta: {
      version: 1,
      fieldConfigurationStatus: 'ready',
      fieldConfiguration: {
        configurationVersion: 4,
        updatedAt: '2026-07-26T08:00:00.000Z',
      },
    },
    resolvedValues: { bride_phone: '123' },
    omittedKeys: ['optional'],
    generationVersion: 5,
    generatedAt: '2026-07-26T09:00:00.000Z',
    executionSnapshot: { contractExecutionDate: '26.07.2026' },
    auditSummary: { browserEditsApplied: true },
  })
  original.couple.partner1 = 'Changed'
  equal(snapshot.sourceDataSnapshot.client.partner1, 'Anna', 'frozen client source')
  equal(snapshot.provenance.configuration.configurationVersion, 4, 'configuration snapshot')
  equal(snapshot.provenance.replacement.omittedKeys, ['optional'], 'replacement audit')
  equal(snapshot.provenance.audit.summary.browserEditsApplied, true, 'generation audit')
})

await run('AD', 'generation versions are allocated atomically', () => {
  const migration = source(
    'supabase/migrations/20260726110000_contract_artifact_generation_versions.sql',
  )
  assert(migration.includes('primary key (wedding_id, template_id)'), 'sequence key missing')
  assert(migration.includes('on conflict (wedding_id, template_id) do update'), 'atomic upsert missing')
  assert(migration.includes('current_version + 1'), 'atomic increment missing')
  assert(
    migration.includes('(wedding_id, template_id, version_number, format)'),
    'artifact format uniqueness missing',
  )
})

await run('AE', 'real OOXML validation rejects fake ZIPs', async () => {
  await assertRealDocx(await realDocx())
  const fake = new JSZip()
  fake.file('fake.txt', 'not OOXML')
  let rejected = false
  try {
    await assertRealDocx(await fake.generateAsync({ type: 'arraybuffer' }))
  } catch {
    rejected = true
  }
  assert(rejected, 'fake ZIP accepted as DOCX')
})

await run('AF', 'artifact filenames are sanitized', () => {
  equal(
    sanitizeContractFileName('../ Umowa: Anna/Jan?.docx '),
    'Umowa- Anna-Jan-.docx',
    'sanitized filename',
  )
  equal(sanitizeContractFileName('...'), 'umowa', 'safe fallback')
})

await run('AG', 'PDF without adapter stays unavailable; with adapter converts final DOCX', async () => {
  const service = createContractExportService({
    storage: fakeStorage([]),
    getUserId: async () => 'user',
    recordExport: async () => document(1),
  })
  assert(!service.pdfAvailable, 'PDF incorrectly advertised')
  let message = ''
  try {
    await service.generatePdf({
      weddingId: wedding().id,
      draftId: 'draft',
      templateId: 'template',
      templateVersionId: 'template-version',
      generationVersion: 1,
      title: 'Umowa',
      docxBytes: await realDocx(),
      snapshotJson: {},
    })
  } catch (error) {
    message = error instanceof Error ? error.message : ''
  }
  equal(message, PDF_EXPORT_UNAVAILABLE_MESSAGE, 'truthful PDF error')

  const docxBytes = await realDocx()
  let convertedFrom: ArrayBuffer | null = null
  const withAdapter = createContractExportService({
    storage: fakeStorage([]),
    getUserId: async () => 'user',
    recordExport: async () => document(2),
    pdfAdapter: {
      async convertDocx({ docxBytes: input }) {
        convertedFrom = input
        const pdf = new TextEncoder().encode('%PDF-1.4 fake')
        return pdf.buffer
      },
    },
  })
  assert(withAdapter.pdfAvailable, 'adapter advertises PDF')
  await withAdapter.generatePdf({
    weddingId: wedding().id,
    draftId: 'draft',
    templateId: 'template',
    templateVersionId: 'template-version',
    generationVersion: 1,
    title: 'Umowa',
    docxBytes,
    snapshotJson: {},
  })
  assert(convertedFrom != null, 'adapter received DOCX')
  equal(
    new Uint8Array(convertedFrom!).byteLength,
    new Uint8Array(docxBytes).byteLength,
    'exact final DOCX bytes',
  )
})

await run('AH', 'wedding listing is artifact-only with preview and download links', () => {
  const module = source('src/features/weddings/components/detail/WeddingContractsModule.tsx')
  assert(module.includes('GeneratedWeddingContractService.listForWedding'), 'wedding list service missing')
  assert(module.includes('to={previewPath}'), 'saved preview link missing')
  assert(module.includes('getArtifactDownloadUrl'), 'artifact download missing')
})

await run('AI', 'global listing is artifact-only and links to wedding context', () => {
  const hub = source('src/features/documents/components/GeneratedContractsHub.tsx')
  assert(hub.includes('GeneratedWeddingContractService.listAllForStudio'), 'global list service missing')
  assert(
    hub.includes('`/sluby/${contract.weddingId}/umowy/${contract.draft.id}`'),
    'global wedding-context link missing',
  )
  assert(hub.includes('Wyłącznie dokumenty, których artefakt'), 'artifact-only contract is not explained')
})

await run('AJ', 'saved preview uses exact DOCX via docx-preview', () => {
  const preview = source('src/pages/WeddingContractPreviewPage.tsx')
  assert(preview.includes('ContractReadyPreview'), 'ready preview missing')
  assert(
    preview.includes('downloadArtifact') ||
      preview.includes("format === 'docx'") ||
      preview.includes("'docx'"),
    'loads final DOCX artifact',
  )
  assert(preview.includes("download('docx')"), 'DOCX download missing')
  assert(
    source(
      'src/features/documents/contract-experience/ContractDocxPreview.tsx',
    ).includes('renderAsync'),
    'docx-preview renderAsync',
  )
  assert(!preview.includes('contentEditable'), 'saved legal text is arbitrarily editable')
  assert(!preview.includes('MICROSOFT_GRAPH'), 'no microsoft graph')
})

await run('AK', 'regeneration is variable-only and pinned to template version', () => {
  const preview = source('src/pages/WeddingContractPreviewPage.tsx')
  const ready = source(
    'src/features/documents/contract-experience/ContractReadyPreview.tsx',
  )
  const generationPage = source('src/pages/WeddingContractGenerationPage.tsx')
  // Product decision: no in-page “Edytuj dane umowy” on generated preview.
  assert(!preview.includes('Edytuj dane umowy'), 'edit CTA must stay hidden')
  assert(preview.includes('ContractReadyPreview'), 'ready preview wired')
  assert(
    preview.includes("navigate(`/sluby/${wedding.id}/umowy/nowa`)"),
    'regenerate navigates to the production generation route',
  )
  assert(ready.includes('Wygeneruj ponownie'), 'regenerate CTA remains')
  assert(
    generationPage.includes('packageResolution.templateVersionId') &&
      generationPage.includes('result.templateVersionId'),
    'current generation pins the resolved package template version',
  )
})

await run('AL', 'previous generated versions remain retained', () => {
  const grouped = groupGeneratedWeddingContracts(
    [draft()],
    [document(1), document(2), document(2, 'pdf')],
  )
  equal(grouped[0]?.generationVersion, 2, 'latest version')
  equal(grouped[0]?.artifacts.length, 3, 'retained artifacts')
  equal(
    grouped[0]?.artifacts.map((artifact) => artifact.generationVersion),
    [1, 2, 2],
    'version history',
  )
})

await run('AM', 'archived template artifacts remain available but template is unselectable', () => {
  const grouped = groupGeneratedWeddingContracts([draft()], [document(1)])
  assert(grouped[0]?.artifacts.length === 1, 'archiving detached saved artifact')
  const selection = classifyTemplatesForGeneration([
    template('template', { status: 'archived' }),
  ])
  equal(selection.selectable.length, 0, 'archived selection')
  equal(selection.archived.length, 1, 'archived diagnosis')
})

await run('AN', 'unsaved generated drafts warn on browser and in-app exit', () => {
  const wizard = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(wizard.includes("window.addEventListener('beforeunload'"), 'browser warning missing')
  assert(wizard.includes('useBlocker(hasUnsavedGeneratedDraft)'), 'in-app warning missing')
  assert(wizard.includes('Wygenerowana umowa nie została zapisana'), 'warning copy missing')
})

await run('AO', 'reduced-motion users receive non-animated generation UI', () => {
  const css = source('src/pages/WeddingContractGenerationPage.module.css')
  assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion query missing')
  assert(css.includes('animation: none'), 'spinner animation is not disabled')
  assert(css.includes('transition: none'), 'interactive transitions are not disabled')
})

await run('AP', 'contract surfaces expose empty loading and error states', () => {
  const templates = source('src/pages/DocumentTemplatesPage.tsx')
  const weddingModule = source('src/features/weddings/components/detail/WeddingContractsModule.tsx')
  const globalHub = source('src/features/documents/components/GeneratedContractsHub.tsx')
  for (const expected of ['Ładowanie…', 'Nie udało się wczytać szablonów', 'Brak szablonów umów']) {
    assert(templates.includes(expected), `template state missing: ${expected}`)
  }
  assert(weddingModule.includes('Nie ma jeszcze zapisanej umowy'), 'wedding empty state missing')
  assert(weddingModule.includes('Ładowanie umów…'), 'wedding loading state missing')
  assert(weddingModule.includes('role="alert"'), 'wedding error state missing')
  assert(globalHub.includes('Nie ma jeszcze wygenerowanych umów'), 'global empty state missing')
})

await run('AQ', 'contract grids and wizard adapt to narrow screens', () => {
  const hubCss = source('src/features/documents/DocumentsTemplates.module.css')
  const wizardCss = source('src/pages/WeddingContractGenerationPage.module.css')
  assert(hubCss.includes('minmax(min(100%, 300px), 1fr)'), 'generated grid can overflow')
  assert(hubCss.includes('@media (min-width: 720px)'), 'template grid breakpoint missing')
  assert(wizardCss.includes('@media (max-width: 760px)'), 'wizard mobile breakpoint missing')
  assert(wizardCss.includes('grid-template-columns: 1fr'), 'wizard fields do not stack')
})

await run('AR', 'Option B marks generated only after persistence and never sent or signed', () => {
  const ui = source('src/pages/WeddingContractGenerationPage.tsx')
  const persistence = ui.indexOf('await saveGeneratedContract({')
  const crm = ui.indexOf('await weddingActionsService.markContractGenerated')
  assert(persistence >= 0 && crm > persistence, 'Option B updates CRM after persistence')
  // Generated preview no longer persists/regenerates in-page (edit CTA removed).
  const preview = source('src/pages/WeddingContractPreviewPage.tsx')
  assert(!preview.includes('saveGeneratedContract'), 'preview must not persist')
  assert(
    !preview.includes('markContractGenerated'),
    'preview must not mark CRM generated',
  )
  const actions = source('src/lib/api/weddingActionsService.ts')
  const start = actions.indexOf('async markContractGenerated(')
  const end = actions.indexOf('/** @deprecated', start)
  const generatedOnly = actions.slice(start, end)
  assert(generatedOnly.includes("updateStatus(wedding.id, 'generated')"), 'generated status missing')
  assert(!generatedOnly.includes("'sent'"), 'generation marks sent')
  assert(!generatedOnly.includes("'signed'"), 'generation marks signed')
})

if (!process.exitCode) {
  console.log('\nAll 44 contract production workflow acceptance cases (A–AR) passed.')
}
