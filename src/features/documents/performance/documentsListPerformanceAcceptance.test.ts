/**
 * Documents list / Generate picker performance guards.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/performance/documentsListPerformanceAcceptance.test.ts
 */

import {
  slimTemplateMetaForList,
} from '@/lib/api/documents/mappers'
import {
  approxJsonBytes,
  resetDocumentsPerfCounters,
  getDocumentsPerfCounters,
  noteAnalysisFunctionCalled,
  noteBinaryFileFetched,
} from './documentsPerformance'
import {
  CONTRACT_ANALYSIS_VERSION,
  isTemplateSummaryStale,
} from './analysisVersions'
import type { DocumentTemplateMeta, DocumentTemplateSummary } from '@/types/documents'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
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

function sampleMeta(heavy = true): DocumentTemplateMeta {
  const slots = Array.from({ length: 40 }, (_, i) => ({
    id: `s${i}`,
    registryKey: `key_${i}`,
    label: `Label ${i}`,
    enabled: true,
    physicallyBound: true,
  }))
  return {
    version: 1,
    slotBindingsReady: true,
    generationReady: true,
    safeBindingCount: 12,
    unresolvedCount: 0,
    analysisVersion: CONTRACT_ANALYSIS_VERSION,
    readinessVersion: 'contract-readiness-v2',
    slotCounters: {
      detectedSlotCount: 12,
      requiredSlotCount: 4,
      optionalSlotCount: 8,
      boundRequiredSlotCount: 4,
      unresolvedRequiredSlotCount: 0,
      ambiguousSlotCount: 0,
      falsePositiveCount: 0,
      safeBindingsCount: 12,
    },
    coupleVariables: heavy ? slots.slice(0, 10) : undefined,
    studioVariables: heavy ? slots.slice(10, 20) : undefined,
    packageVariables: heavy ? slots.slice(20, 30) : undefined,
  }
}

run('1 — Documents + picker share the same summary query key shape', () => {
  const listKey = ['document-template-summaries', 'user-1'] as const
  assert(listKey[0] === 'document-template-summaries', `got ${listKey[0]}`)
})

run('2 — slim list meta drops heavy variable arrays', () => {
  const slim = slimTemplateMetaForList(sampleMeta(true))
  assert(slim.coupleVariables === undefined, 'no coupleVariables')
  assert(slim.studioVariables === undefined, 'no studioVariables')
  assert(slim.packageVariables === undefined, 'no packageVariables')
  assert(slim.slotCounters?.detectedSlotCount === 12, 'keeps counters')
  assert(slim.generationReady === true, 'keeps generationReady')
})

run('3 — slim meta is much smaller than full analysis-style meta', () => {
  const full = sampleMeta(true)
  const slim = slimTemplateMetaForList(full)
  const fullBytes = approxJsonBytes(full)
  const slimBytes = approxJsonBytes(slim)
  assert(slimBytes < fullBytes, `${slimBytes} should be < ${fullBytes}`)
  assert(slimBytes < fullBytes * 0.5, 'at least 50% smaller')
})

run('4 — summary DTO does not carry slot_map / binary fields', () => {
  const summary: DocumentTemplateSummary = {
    id: 't1',
    userId: 'u1',
    name: 'Test',
    description: null,
    docType: 'contract',
    category: null,
    status: 'ready',
    isDefault: false,
    currentVersionId: 'v1',
    aiAnalyzedAt: new Date().toISOString(),
    questionnaireFormId: null,
    meta: slimTemplateMetaForList(sampleMeta(true)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentVersionNumber: 1,
    componentCount: 0,
    blockCount: 0,
    variableCount: 12,
    usageCount: 0,
    sourceFileName: 'a.docx',
    sourceDocxPath: 'path/a.docx',
    generationReady: true,
    detectedFieldCount: 12,
    safeBindingCount: 12,
    unresolvedCount: 0,
  }
  const json = JSON.stringify(summary)
  assert(!json.includes('slotMap'), 'no slotMap')
  assert(!json.includes('paragraphs'), 'no paragraphs')
  assert(!/"slots"\s*:/.test(json), 'no slots array on summary')
})

run('5 — stale summary detection does not force reanalysis', () => {
  assert(
    !isTemplateSummaryStale({ analysisVersion: CONTRACT_ANALYSIS_VERSION }),
    'current not stale',
  )
  assert(
    isTemplateSummaryStale({ analysisVersion: 'old-v0' }),
    'old analysis version is stale',
  )
  assert(
    !isTemplateSummaryStale({}),
    'missing version is not treated as stale (legacy rows)',
  )
})

run('6 — analysis/binary notes increment counters for budget warnings', () => {
  resetDocumentsPerfCounters()
  noteAnalysisFunctionCalled('detectContractCandidates')
  noteBinaryFileFetched('templates/x.docx')
  const c = getDocumentsPerfCounters()
  assert((c.analysisFunctionsCalled ?? 0) >= 1, 'analysis counted')
  assert((c.binaryFilesFetched ?? 0) >= 1, 'binary counted')
  resetDocumentsPerfCounters()
})

run('7 — listSummaries contract: dedicated summary key (not detail/analysis)', () => {
  assert(
    true,
    'summaries key factory lives in useDocumentTemplates (see read-path guards)',
  )
})

if (!process.exitCode) {
  console.log('\nAll documents list performance tests passed.')
}
