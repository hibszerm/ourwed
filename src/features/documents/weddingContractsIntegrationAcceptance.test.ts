import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { groupGeneratedWeddingContracts } from './template/contractArtifactDomain'
import type { WeddingDocument, WeddingDocumentDraft } from '@/types/documents'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
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

const draft = {
  id: 'draft-1',
  weddingId: 'wedding-1',
  templateId: 'template-1',
  templateVersionId: 'template-version-1',
  title: 'Umowa Anny i Jana',
  fieldValues: {},
  packageSnapshot: { packageId: null, name: '', currency: 'PLN', items: [] },
  enabledClauseIds: [],
  money: { price: 0, deposit: 0, remaining: 0, discount: 0, currency: 'PLN' },
  notes: null,
  status: 'editing',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
} satisfies WeddingDocumentDraft

run('wedding module has empty, list, open and download actions', () => {
  const module = source(
    'src/features/weddings/components/detail/WeddingContractsModule.tsx',
  )
  assert(module.includes('Nie ma jeszcze zapisanej umowy'), 'missing empty state')
  assert(module.includes('Generuj umowę'), 'missing generate action')
  assert(module.includes('Otwórz'), 'missing open action')
  assert(module.includes('Pobierz'), 'missing download menu')
  assert(module.includes('PDF niedostępny'), 'PDF must be honestly unavailable')
})

run('both wedding detail surfaces share the contracts module', () => {
  const v1 = source('src/features/weddings/detail/v1/WeddingDetailV1.tsx')
  const v2 = source(
    'src/features/weddings/detail/v2/WeddingContractFinanceWorkspace.tsx',
  )
  assert(v1.includes('<WeddingContractsModule'), 'V1 integration missing')
  assert(v2.includes('<WeddingContractsModule'), 'V2 integration missing')
})

run('generation and saved preview routes are canonical', () => {
  const router = source('src/routes/router.tsx')
  const detail = source('src/pages/WeddingDetailPage.tsx')
  assert(
    router.includes("path: '/sluby/:weddingId/umowy/nowa'"),
    'generation route missing',
  )
  assert(
    router.includes("path: '/sluby/:weddingId/umowy/:contractId'"),
    'preview route missing',
  )
  assert(
    detail.includes('navigate(`/sluby/${wedding.id}/umowy/nowa`)'),
    'wedding generate action must navigate to wizard',
  )
})

run('draft-only contracts can be distinguished from persisted artifacts', () => {
  const groupedDraft = groupGeneratedWeddingContracts([draft], [])
  assert(groupedDraft[0]?.status === 'draft', 'draft state should remain explicit')
  assert(groupedDraft[0]?.artifacts.length === 0, 'draft must have no artifacts')

  const artifact = {
    id: 'document-1',
    weddingId: draft.weddingId,
    templateId: draft.templateId,
    templateVersionId: draft.templateVersionId,
    draftId: draft.id,
    versionNumber: 2,
    format: 'docx',
    filePath: 'exports/document-1.docx',
    fileName: 'umowa-v2.docx',
    snapshotJson: {},
    lockStatus: 'exported',
    lockedAt: null,
    createdAt: '2026-01-02T10:00:00.000Z',
  } satisfies WeddingDocument
  const groupedReady = groupGeneratedWeddingContracts([draft], [artifact])
  assert(groupedReady[0]?.status === 'ready', 'artifact should make contract ready')
  assert(groupedReady[0]?.generationVersion === 2, 'version must come from artifact')

  const service = source(
    'src/features/documents/template/ContractArtifactPersistenceService.ts',
  )
  assert(
    service.includes('.filter((contract) => contract.artifacts.length > 0)'),
    'public list must hide draft-only rows',
  )
})

run('saved preview is variable-only and keeps real downloads', () => {
  const preview = source('src/pages/WeddingContractPreviewPage.tsx')
  assert(preview.includes('Uproszczony podgląd DOCX'), 'preview label missing')
  assert(preview.includes('Edytuj dane umowy'), 'variable editor missing')
  assert(
    preview.includes('Treść prawna nie') && !preview.includes('contentEditable'),
    'saved route must not expose arbitrary legal text editing',
  )
  assert(
    preview.includes('templateVersionId: contract.templateVersionId'),
    'regeneration must pin saved template version',
  )
  assert(preview.includes("download('docx')"), 'real DOCX download missing')
  assert(preview.includes('disabled={!latestPdf}'), 'PDF availability must be artifact-driven')
})

run('wizard warns about an unsaved generated draft', () => {
  const wizard = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(wizard.includes("window.addEventListener('beforeunload'"), 'beforeunload missing')
  assert(wizard.includes('useBlocker(hasUnsavedGeneratedDraft)'), 'in-app blocker missing')
})

run('global hub links into wedding context and archived templates stay excluded', () => {
  const hub = source('src/features/documents/components/GeneratedContractsHub.tsx')
  const picker = source('src/features/documents/template/contractTemplatePicker.ts')
  assert(
    hub.includes('`/sluby/${contract.weddingId}/umowy/${contract.draft.id}`'),
    'global preview link missing',
  )
  assert(
    picker.includes("template.status === 'archived'") &&
      picker.includes("return finish('archived'"),
    'archived templates must not be selectable',
  )
})

if (!process.exitCode) {
  console.log('\nAll wedding contracts integration acceptance tests passed.')
}
