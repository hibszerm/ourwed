import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import type { DocumentStorageService } from '@/lib/api/documents/interfaces'
import type {
  PackageSnapshot,
  WeddingDocument,
  WeddingDocumentDraft,
} from '@/types/documents'
import type { Wedding } from '@/types/wedding'
import {
  PDF_EXPORT_UNAVAILABLE_MESSAGE,
  assertRealDocx,
  createContractExportService,
} from './ContractExportService'
import { createContractArtifactPersistenceService } from './ContractArtifactPersistenceService'
import {
  buildContractArtifactSnapshot,
  nextGenerationVersion,
  sanitizeContractFileName,
} from './contractArtifactDomain'

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

async function realDocx(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.folder('word')?.file('document.xml', '<w:document/>')
  return zip.generateAsync({ type: 'arraybuffer' })
}

function wedding(): Wedding {
  return {
    id: 'wedding',
    couple: {
      partner1: 'Anna',
      partner2: 'Jan',
      email: 'anna@example.com',
      phone: '500500500',
      venue: 'Dwór',
      city: 'Kraków',
    },
    date: '2026-08-01',
    status: 'active',
    workflowStage: 'contract',
    packageName: 'Film',
    packageId: 'package',
    price: 8000,
    depositAmount: 1000,
    currency: 'PLN',
    packageItems: [],
    accentColor: '#000',
    createdAt: '2026-01-01T00:00:00.000Z',
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
  name: 'Film',
  currency: 'PLN',
  items: [],
}

function document(versionNumber = 1): WeddingDocument {
  return {
    id: `document-${versionNumber}`,
    weddingId: 'wedding',
    templateId: 'template',
    templateVersionId: 'template-version',
    draftId: 'draft',
    versionNumber,
    format: 'docx',
    filePath: 'path',
    fileName: 'umowa.docx',
    snapshotJson: {},
    lockStatus: 'exported',
    lockedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function draft(): WeddingDocumentDraft {
  return {
    id: 'draft',
    weddingId: 'wedding',
    templateId: 'template',
    templateVersionId: 'template-version',
    title: 'Umowa',
    fieldValues: {},
    packageSnapshot,
    enabledClauseIds: [],
    money: {
      price: 8000,
      deposit: 1000,
      remaining: 7000,
      discount: 0,
      currency: 'PLN',
    },
    notes: null,
    status: 'editing',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function storage(events: string[]): DocumentStorageService {
  return {
    paths: {
      templateSource: () => '',
      templateFillable: () => '',
      draftAsset: () => '',
      exportFile: (_userId, _weddingId, documentId, format) =>
        `${documentId}.${format}`,
    },
    async upload(_path, file) {
      events.push('upload')
      const bytes = await file.arrayBuffer()
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
      return 'https://signed.example/docx'
    },
  }
}

await run('sanitizes contract filenames without path traversal', () => {
  equal(
    sanitizeContractFileName('../ Umowa: Anna/Jan?.docx '),
    'Umowa- Anna-Jan-.docx',
    'sanitized name',
  )
  equal(sanitizeContractFileName('...'), 'umowa', 'empty fallback')
})

await run('allocates generation versions independently from template versions', () => {
  equal(nextGenerationVersion([]), 1, 'first version')
  equal(
    nextGenerationVersion([document(2), document(7), document(3)]),
    8,
    'next generation version',
  )
})

await run('snapshot freezes exact source and provenance data', () => {
  const sourceWedding = wedding()
  const snapshot = buildContractArtifactSnapshot({
    wedding: sourceWedding,
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
    auditSummary: { browserEditsApplied: true },
  })
  sourceWedding.couple.partner1 = 'Changed'
  equal(snapshot.sourceDataSnapshot.client.partner1, 'Anna', 'frozen client')
  equal(snapshot.sourceDataSnapshot.package.name, 'Film', 'package source')
  equal(snapshot.provenance.configuration.configurationVersion, 4, 'configuration')
  equal(snapshot.generationVersion, 5, 'generation version')
  assert(!('bytes' in snapshot), 'snapshot must not contain binary bytes')
})

await run('persists real DOCX before recording and returns real metadata', async () => {
  const events: string[] = []
  const service = createContractExportService({
    storage: storage(events),
    getUserId: async () => 'user',
    recordExport: async () => {
      events.push('record')
      return document(4)
    },
  })
  const bytes = await realDocx()
  const saved = await service.generateDocx({
    weddingId: 'wedding',
    draftId: 'draft',
    templateId: 'template',
    templateVersionId: 'template-version',
    generationVersion: 4,
    title: 'Umowa',
    docxBytes: bytes,
    snapshotJson: {},
  })
  equal(events, ['upload', 'record', 'signed-url'], 'persistence order')
  await assertRealDocx(saved.bytes)
  equal(saved.document.id, 'document-4', 'artifact record')
})

await run('record failure rejects save and cleans uploaded object', async () => {
  const events: string[] = []
  const service = createContractExportService({
    storage: storage(events),
    getUserId: async () => 'user',
    recordExport: async () => {
      events.push('record')
      throw new Error('record failed')
    },
  })
  let message = ''
  try {
    await service.generateDocx({
      weddingId: 'wedding',
      draftId: 'draft',
      templateId: 'template',
      templateVersionId: 'template-version',
      generationVersion: 2,
      title: 'Umowa',
      docxBytes: await realDocx(),
      snapshotJson: {},
    })
  } catch (error) {
    message = error instanceof Error ? error.message : ''
  }
  equal(message, 'record failed', 'record error')
  equal(events, ['upload', 'record', 'cleanup'], 'failure order')
})

await run('PDF is unavailable without a configured adapter', async () => {
  const service = createContractExportService({
    storage: storage([]),
    getUserId: async () => 'user',
    recordExport: async () => document(),
  })
  let message = ''
  try {
    await service.generatePdf({
      weddingId: 'wedding',
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
  equal(message, PDF_EXPORT_UNAVAILABLE_MESSAGE, 'PDF error')
})

await run('artifact persistence requires DOCX record success', async () => {
  const events: string[] = []
  const service = createContractArtifactPersistenceService({
    allocateVersion: async () => {
      events.push('allocate')
      return 3
    },
    getDraft: async () => draft(),
    generateDocx: async () => {
      events.push('persist-docx')
      throw new Error('database unavailable')
    },
    pdfAvailable: false,
  })
  let message = ''
  try {
    await service.persist({
      wedding: wedding(),
      draftId: 'draft',
      templateId: 'template',
      templateVersionId: 'template-version',
      title: 'Umowa',
      docxBytes: await realDocx(),
      packageSnapshot,
      manualOverrides: {},
      resolvedValues: {},
      omittedKeys: [],
    })
  } catch (error) {
    message = error instanceof Error ? error.message : ''
  }
  equal(message, 'database unavailable', 'required artifact record')
  equal(events, ['allocate', 'persist-docx'], 'artifact order')
})

await run('CRM status follows artifact persistence in both UIs', async () => {
  const files = await Promise.all([
    readFile(
      new URL('../../../pages/WeddingContractGenerationPage.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../../weddings/actions/GenerateContractModal.tsx', import.meta.url),
      'utf8',
    ),
  ])
  for (const source of files) {
    const persistence = source.indexOf('await saveGeneratedContract({')
    const crm = source.indexOf('await weddingActionsService.markContractGenerated')
    assert(persistence >= 0, 'missing artifact persistence')
    assert(crm > persistence, 'CRM status must follow persisted artifact')
    assert(!source.includes('pdfDownloadUrl'), 'must not expose pseudo-PDF')
  }
})
