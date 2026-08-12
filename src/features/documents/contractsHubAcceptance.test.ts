import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { productionAnalysisToSemanticMap } from './ai/productionAnalysisToSemanticMap'
import { validateContractDocx } from './import/contractUploadValidation'
import { buildProposedTemplateConfiguration } from '../ai-contract-lab/templateFieldConfiguration'
import { isTemplateGenerationReady } from './template/templateGenerationReadiness'
import type { AiDocumentAnalysisResult } from './ai/types'
import type { DocumentTemplateSummary } from '@/types/documents'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (error) {
    console.error(`FAIL  ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

run('DOCX validation rejects empty and non-DOCX files', () => {
  assert(
    !validateContractDocx(new File([], 'umowa.docx')).ok,
    'empty DOCX must fail',
  )
  assert(
    !validateContractDocx(new File(['pdf'], 'umowa.pdf', { type: 'application/pdf' }))
      .ok,
    'PDF must fail',
  )
  assert(
    validateContractDocx(
      new File(['docx'], 'umowa.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).ok,
    'non-empty DOCX must pass',
  )
})

run('canonical routes: packages own templates, weddings own contracts', () => {
  const root = process.cwd()
  const router = readFileSync(resolve(root, 'src/routes/router.tsx'), 'utf8')
  const sidebar = readFileSync(resolve(root, 'src/layouts/Sidebar.tsx'), 'utf8')
  const hub = readFileSync(
    resolve(root, 'src/features/documents/components/GeneratedContractsHub.tsx'),
    'utf8',
  )
  for (const route of [
    '/sluby/:weddingId/umowy/nowa',
    '/sluby/:weddingId/umowy/:contractId',
    '/studio/pakiety',
    '/ustawienia/dokumenty/szablony/:id',
  ]) {
    assert(router.includes(`path: '${route}'`), `missing route ${route}`)
  }
  assert(
    router.includes("Navigate to=\"/studio/pakiety\""),
    'standalone Contracts hub must redirect to packages',
  )
  assert(
    !sidebar.includes("to: '/umowy', label: 'Umowy'"),
    'sidebar must not expose standalone Umowy',
  )
  assert(
    sidebar.includes("to: '/studio/pakiety', label: 'Pakiety'"),
    'sidebar must expose Pakiety',
  )
  assert(
    !sidebar.includes('Eksperymentalne') &&
      !sidebar.includes('nav-ai-contract-lab'),
    'experimental tools must be hidden from customer sidebar',
  )
  assert(
    hub.includes('Nie ma jeszcze wygenerowanych umów'),
    'generated contracts hub keeps a calm empty state',
  )
})

run('legacy Contracts upload page no longer auto-redirects away on mount', () => {
  const focusedImport = readFileSync(
    resolve(process.cwd(), 'src/pages/DocumentTemplateNewPage.tsx'),
    'utf8',
  )
  assert(
    focusedImport.includes('Wybierz DOCX') &&
      !focusedImport.includes("navigate('/umowy', { replace: true })"),
    'direct import route must show its own DOCX picker',
  )
})

run('production registry fields create deterministic default configuration', () => {
  const analysis: AiDocumentAnalysisResult = {
    schemaVersion: '1',
    model: 'test',
    promptVersion: '1',
    analyzerId: 'production',
    analyzerVersion: '1',
    documentType: 'contract',
    overallConfidence: 0.9,
    fields: [
      {
        id: 'b',
        label: 'Data ślubu',
        registryKey: 'wedding.date',
        value: '12.06.2027',
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        id: 'a',
        label: 'Nieznane',
        registryKey: null,
        confidence: 0.5,
        status: 'suggested',
      },
    ],
    sections: [],
    clauses: [],
    warnings: [],
    analyzedAt: '2026-07-26T00:00:00.000Z',
    sourceTextLength: 20,
  }
  const semanticMap = productionAnalysisToSemanticMap(analysis)
  assert(semanticMap.semanticAnchors.length === 1, 'only registry field is bridged')
  const config = buildProposedTemplateConfiguration({
    templateId: 'template-1',
    templateVersionId: 'version-1',
    semanticMap,
  })
  assert(config.fields.length === 1, 'one config field expected')
  assert(config.fields[0]?.mode === 'variable', 'wedding date defaults to variable')
  assert(config.templateVersionId === 'version-1', 'real version is retained')
})

run('unified readiness requires source, version, and automatic ready', () => {
  const base = {
    generationReady: true,
    status: 'ready' as const,
    currentVersionId: 'v1',
    sourceDocxPath: 'templates/x.docx',
    aiAnalyzedAt: '2026-07-26T00:00:00.000Z',
    variableCount: 1,
    meta: { version: 1 },
  } as Pick<
    DocumentTemplateSummary,
    | 'generationReady'
    | 'status'
    | 'meta'
    | 'currentVersionId'
    | 'sourceDocxPath'
    | 'aiAnalyzedAt'
    | 'variableCount'
  >
  assert(!isTemplateGenerationReady(base), 'unconfigured template must be blocked')
  assert(
    isTemplateGenerationReady({
      ...base,
      meta: {
        version: 1,
        fieldConfigurationStatus: 'ready',
        automaticReadinessStatus: 'ready',
      },
    }),
    'automatic ready should pass',
  )
  assert(
    isTemplateGenerationReady(
      {
        ...base,
        aiAnalyzedAt: '2026-07-26T00:00:00.000Z',
      },
      {
        allowLegacyWithoutFieldConfiguration: true,
      },
    ),
    'legacy compatibility must be explicit',
  )
})

if (!process.exitCode) {
  console.log('\nAll contracts hub acceptance tests passed.')
}
