/**
 * Picker classification acceptance cases.
 * Run with: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/contractTemplatePicker.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  classifyTemplatesForGeneration,
  splitRecommended,
} from './contractTemplatePicker'
import { selectGenerationTemplates } from './WeddingContractGenerationService'
import { isTemplateUsableForGeneration } from './templateGenerationReadiness'
import { getContractUiStatus } from '@/features/documents/contractUi'
import type { DocumentTemplateSummary } from '@/types/documents'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function pageSource(): string {
  return readFileSync(
    resolve(process.cwd(), 'src/pages/WeddingContractGenerationPage.tsx'),
    'utf8',
  )
}

function hooksSource(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      'src/features/documents/hooks/useDocumentTemplates.ts',
    ),
    'utf8',
  )
}

function base(
  patch: Partial<DocumentTemplateSummary> &
    Pick<DocumentTemplateSummary, 'id' | 'name' | 'status'>,
): DocumentTemplateSummary {
  return {
    userId: 'user-1',
    description: null,
    docType: 'contract',
    category: null,
    isDefault: false,
    currentVersionId: 'ver-1',
    aiAnalyzedAt: new Date().toISOString(),
    questionnaireFormId: null,
    meta: {
      version: 1,
      slotBindingsReady: true,
      fieldConfigurationStatus: 'ready',
      automaticReadinessStatus: 'ready',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentVersionNumber: 1,
    componentCount: 0,
    blockCount: 0,
    variableCount: 3,
    usageCount: 0,
    sourceFileName: 'umowa.docx',
    sourceDocxPath: 'templates/u1/source.docx',
    generationReady: patch.status === 'ready',
    detectedFieldCount: patch.variableCount ?? 3,
    safeBindingCount: patch.status === 'ready' ? 3 : 0,
    unresolvedCount: 0,
    ...patch,
  }
}

/** Umowa GP-shaped row: product Gotowy with legacy incomplete flags. */
function umowaGpAleksandraB(): DocumentTemplateSummary {
  return base({
    id: 'umowa-gp-aleksandra-b',
    name: 'Umowa GP - Aleksandra B doc',
    status: 'incomplete',
    category: 'Foto',
    generationReady: false,
    safeBindingCount: 0,
    meta: {
      version: 1,
      slotBindingsReady: false,
      generationReady: false,
      fieldConfigurationStatus: 'ready',
      automaticReadinessStatus: 'ready',
      unresolvedSlotKeys: ['a', 'b'],
      fieldConfiguration: { templateId: 'umowa-gp-aleksandra-b', fields: [] },
    },
  })
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

run('Test 1 — ready template is selectable', () => {
  const c = classifyTemplatesForGeneration([
    base({ id: '1', name: 'Umowa Video 2026', status: 'ready' }),
  ])
  assert(c.selectable.length === 1, 'expected selectable')
  assert(c.incomplete.length === 0, 'not incomplete')
})

run('Test 2 — incomplete DB status with automatic ready is selectable (Umowa GP shape)', () => {
  const c = classifyTemplatesForGeneration([
    base({
      id: '2',
      name: 'Umowa Video',
      status: 'incomplete',
      generationReady: false,
      meta: {
        version: 1,
        slotBindingsReady: false,
        fieldConfigurationStatus: 'ready',
        automaticReadinessStatus: 'ready',
        unresolvedSlotKeys: ['a', 'b', 'c'],
      },
      variableCount: 5,
    }),
  ])
  assert(c.selectable.length === 1, 'must be selectable — legacy incomplete must not hide')
  assert(c.incomplete.length === 0, 'must not be incomplete bucket')
})

run('Test 3 — missing package metadata still selectable', () => {
  const c = classifyTemplatesForGeneration([
    base({
      id: '3',
      name: 'Umowa',
      status: 'ready',
      category: null,
    }),
  ])
  const split = splitRecommended(c.selectable, null)
  assert(split.other.length === 1, 'still visible without package')
  assert(split.recommended.length === 0, 'no fake recommended')
})

run('Test 4 — package mismatch goes to Other, not hidden', () => {
  const c = classifyTemplatesForGeneration([
    base({
      id: '4',
      name: 'Umowa Foto',
      status: 'ready',
      category: 'Foto',
    }),
    base({
      id: '5',
      name: 'Umowa Video Mini',
      status: 'ready',
      category: 'Video',
    }),
  ])
  const split = splitRecommended(c.selectable, 'Video Premium')
  assert(
    split.recommended.some((r) => r.template.id === '5'),
    'video recommended',
  )
  assert(
    split.other.some((r) => r.template.id === '4'),
    'photo still in other',
  )
})

run('Test 5 — PDF source still selectable when generation path exists', () => {
  const c = classifyTemplatesForGeneration([
    base({
      id: '6',
      name: 'PDF Contract',
      status: 'ready',
      sourceFileName: 'umowa.pdf',
      sourceDocxPath: 'templates/u1/source.pdf',
    }),
  ])
  assert(c.selectable.length === 1, 'pdf with path selectable')
})

run('Test 7 — draft with automatic ready field config is selectable', () => {
  const c = classifyTemplatesForGeneration([
    base({
      id: '7',
      name: 'Draft after analysis',
      status: 'draft',
      generationReady: false,
      meta: {
        version: 1,
        slotBindingsReady: false,
        fieldConfigurationStatus: 'ready',
        automaticReadinessStatus: 'ready',
        unresolvedSlotKeys: ['x'],
      },
    }),
  ])
  assert(c.selectable.length === 1, 'draft + automatic ready → selectable')
  assert(c.incomplete.length === 0, 'not incomplete')
})

// --- Regression A–S (wedding picker ↔ global Gotowy) ---

run('A — template marked ready globally appears in wedding picker', () => {
  const t = umowaGpAleksandraB()
  assert(getContractUiStatus(t) === 'ready', 'global Gotowy')
  const c = classifyTemplatesForGeneration([t])
  assert(c.selectable.some((d) => d.template.id === t.id), 'in picker')
})

run('B — global card and picker use the same readiness function', () => {
  const t = umowaGpAleksandraB()
  assert(isTemplateUsableForGeneration(t), 'usable')
  assert(getContractUiStatus(t) === 'ready', 'Gotowy')
  assert(
    classifyTemplatesForGeneration([t]).selectable.length === 1,
    'picker uses same rule',
  )
})

run('C — obsolete configurationCompleted does not hide ready template', () => {
  const t = base({
    id: 'c',
    name: 'C',
    status: 'ready',
    meta: {
      version: 1,
      fieldConfigurationStatus: 'ready',
      automaticReadinessStatus: 'ready',
      configurationCompleted: false,
    } as DocumentTemplateSummary['meta'],
  })
  assert(isTemplateUsableForGeneration(t), 'usable')
  assert(classifyTemplatesForGeneration([t]).selectable.length === 1, 'selectable')
})

run('D — obsolete mappingCompleted does not hide ready template', () => {
  const t = base({
    id: 'd',
    name: 'D',
    status: 'ready',
    meta: {
      version: 1,
      fieldConfigurationStatus: 'ready',
      automaticReadinessStatus: 'ready',
      mappingCompleted: false,
    } as DocumentTemplateSummary['meta'],
  })
  assert(classifyTemplatesForGeneration([t]).selectable.length === 1, 'selectable')
})

run('E — slotBindingsReady false does not hide automatically ready template', () => {
  const t = umowaGpAleksandraB()
  assert(t.meta.slotBindingsReady === false, 'precondition')
  assert(isTemplateUsableForGeneration(t), 'usable')
  assert(classifyTemplatesForGeneration([t]).selectable.length === 1, 'selectable')
})

run('F — generationReady false does not hide recoverable ready template', () => {
  const t = umowaGpAleksandraB()
  assert(t.generationReady === false, 'precondition')
  assert(isTemplateUsableForGeneration(t), 'usable')
  assert(classifyTemplatesForGeneration([t]).selectable.length === 1, 'selectable')
})

run('G — archived template is hidden', () => {
  const t = umowaGpAleksandraB()
  t.status = 'archived'
  assert(!isTemplateUsableForGeneration(t), 'not usable')
  assert(classifyTemplatesForGeneration([t]).selectable.length === 0, 'hidden')
  assert(classifyTemplatesForGeneration([t]).archived.length === 1, 'archived bucket')
})

run('H — fatal analysis-error template is hidden', () => {
  const t = base({
    id: 'h',
    name: 'Broken',
    status: 'needs_review',
    aiAnalyzedAt: null,
    variableCount: 0,
    generationReady: false,
    meta: {
      version: 1,
      automaticReadinessStatus: 'error',
      automaticAttentionIssues: [
        {
          code: 'analysis_failed',
          message: 'Nie udało się przeanalizować dokumentu.',
        },
      ],
      fieldConfigurationStatus: undefined,
    },
  })
  assert(!isTemplateUsableForGeneration(t), 'not usable')
  assert(classifyTemplatesForGeneration([t]).selectable.length === 0, 'hidden')
})

run('I — no exact package match still shows ready templates', () => {
  const t = umowaGpAleksandraB()
  const selection = classifyTemplatesForGeneration([t])
  const split = splitRecommended(selection.selectable, 'Video Mini', {
    packageName: 'Video Mini',
  })
  assert(
    split.recommended.length + split.other.length === 1,
    'still visible without exact package match',
  )
})

run('J — package match affects rank, not availability', () => {
  const foto = umowaGpAleksandraB()
  const video = base({
    id: 'video-mini',
    name: 'Umowa Video Mini',
    status: 'ready',
    category: 'Video Mini',
    meta: {
      version: 1,
      fieldConfigurationStatus: 'ready',
      automaticReadinessStatus: 'ready',
      associatedPackageId: 'pkg-video-mini',
    },
  })
  const c = classifyTemplatesForGeneration([foto, video])
  assert(c.selectable.length === 2, 'both available')
  const split = splitRecommended(c.selectable, 'Video Mini', {
    packageName: 'Video Mini',
    packageId: 'pkg-video-mini',
  })
  assert(split.recommended[0]?.template.id === 'video-mini', 'package ranks first')
  assert(
    split.other.some((r) => r.template.id === foto.id) ||
      split.recommended.some((r) => r.template.id === foto.id),
    'foto still listed',
  )
})

run('K — type match affects rank, not availability', () => {
  const foto = base({
    id: 'foto',
    name: 'Foto',
    status: 'ready',
    meta: {
      version: 1,
      fieldConfigurationStatus: 'ready',
      automaticReadinessStatus: 'ready',
      templateServiceType: 'foto',
    },
  })
  const video = base({
    id: 'video',
    name: 'Video',
    status: 'ready',
    meta: {
      version: 1,
      fieldConfigurationStatus: 'ready',
      automaticReadinessStatus: 'ready',
      templateServiceType: 'video',
    },
  })
  const c = classifyTemplatesForGeneration([foto, video])
  assert(c.selectable.length === 2, 'both available')
  const split = splitRecommended(c.selectable, null, { serviceType: 'video' })
  assert(split.recommended[0]?.template.id === 'video', 'type ranks first')
})

run('L — wedding generation uses package contract (no manual picker)', () => {
  const page = pageSource()
  assert(
    page.includes('resolvePackageContractForWedding'),
    'package contract resolver wired',
  )
  assert(
    page.includes('Przygotowujemy umowę pakietu') ||
      page.includes('Przygotowujemy generator umowy'),
    'loading copy for package resolution',
  )
  assert(
    page.includes("status === 'missing_contract'"),
    'missing package contract product state',
  )
  assert(page.includes('Przejdź do pakietu'), 'package CTA')
  assert(!page.includes('generation-template'), 'no manual template radio picker')
  const resolveSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/documents/template/packageContractResolve.ts',
    ),
    'utf8',
  )
  assert(
    resolveSrc.includes('nie ma jeszcze przypisanej umowy'),
    'product-level missing message',
  )
})

run('M — picker works without first opening template detail', () => {
  const t = umowaGpAleksandraB()
  // Summary-only row (as returned by listSummaries) is enough.
  assert(isTemplateUsableForGeneration(t), 'summary usable')
  assert(classifyTemplatesForGeneration([t]).selectable.length === 1, 'no detail required')
})

run('N — package resolution loading does not show missing-contract CTA as success', () => {
  const page = pageSource()
  assert(page.includes('packageContractQuery.isLoading'), 'loading gate')
  assert(
    page.includes("status === 'missing_contract'") &&
      page.includes('Przejdź do pakietu'),
    'missing contract gated product CTA',
  )
})

run('O — package contract upload invalidates package + template caches', () => {
  const section = readFileSync(
    resolve(process.cwd(), 'src/features/studio/PackageContractSection.tsx'),
    'utf8',
  )
  assert(
    section.includes("queryKey: ['studio-packages']") &&
      section.includes('documentTemplateKeys.all'),
    'package upload invalidates caches',
  )
  const hooks = hooksSource()
  assert(
    hooks.includes("summaries: (userId: string | null) =>") &&
      hooks.includes("['document-template-summaries', userId]"),
    'Umowy summaries key remains shared',
  )
})

run('P — same template ID is returned by global list and picker repository', () => {
  const globalList = [umowaGpAleksandraB()]
  const picker = classifyTemplatesForGeneration(globalList)
  assert(picker.selectable[0]?.template.id === globalList[0]!.id, 'same id')
})

run('Q — current version/source artifact checks are consistent', () => {
  const missingVersion = umowaGpAleksandraB()
  missingVersion.currentVersionId = null
  assert(!isTemplateUsableForGeneration(missingVersion), 'no version')
  assert(
    classifyTemplatesForGeneration([missingVersion]).selectable.length === 0,
    'missing version not selectable',
  )

  const missingSource = umowaGpAleksandraB()
  missingSource.sourceDocxPath = null
  assert(!isTemplateUsableForGeneration(missingSource), 'no source')
  assert(
    classifyTemplatesForGeneration([missingSource]).selectable.length === 0,
    'missing source not selectable',
  )
})

run('R — Umowa GP scenario returns at least one selectable template', () => {
  const c = classifyTemplatesForGeneration([umowaGpAleksandraB()])
  assert(c.selectable.length >= 1, 'at least one selectable')
})

run('S — package contract proceeds to Sprawdź dane (page wiring)', () => {
  const page = pageSource()
  assert(page.includes('Sprawdź dane'), 'verify step present')
  assert(page.includes('prepareVerification'), 'auto verify from package contract')
  assert(page.includes('packageResolution.templateId'), 'uses package template')
  const t = umowaGpAleksandraB()
  const selection = selectGenerationTemplates([t], 'Video Mini')
  assert(selection.preselectedTemplateId === t.id, 'legacy picker still ranks package match')
})

if (!process.exitCode) {
  console.log('\nAll picker classification tests passed.')
}
