import { CURRENT_BRIEF_GENERATOR_VERSION } from '@/features/wedding-brief/briefGeneratorVersion'
import { createBrowserSafeId } from '@/lib/utils/createBrowserSafeId'
import { assertBriefPdfBytes } from '@/features/wedding-brief/assertBriefPdfBytes'
import {
  buildCanonicalBriefSource,
  type CanonicalBriefSource,
} from '@/features/wedding-brief/canonicalBriefSource'
import { hashCanonicalBriefSource } from '@/features/wedding-brief/hashCanonicalBriefSource'
import { loadWeddingBriefSourceSnapshot } from '@/features/wedding-brief/loadWeddingBriefSource'
import { buildWeddingBriefPdfData } from '@/features/wedding-brief/buildWeddingBriefPdfData'
import type { BuildWeddingBriefPdfDataInput } from '@/features/wedding-brief/buildWeddingBriefPdfData'
import { convertWeddingBriefHtmlToPdf } from '@/features/wedding-brief/convertWeddingBriefHtmlToPdf'
import { renderWeddingBriefFooterHtml } from '@/features/wedding-brief/renderWeddingBriefFooterHtml'
import {
  buildWeddingBriefFilename,
  renderWeddingBriefHtml,
} from '@/features/wedding-brief/renderWeddingBriefHtml'
import {
  weddingBriefService,
  weddingBriefStoragePath,
  type WeddingBriefRecord,
} from '@/lib/api/weddingBriefService'
import { devWarnArgs } from '@/lib/debug/devConsole'

export class BriefSourceChangedError extends Error {
  readonly code = 'BRIEF_SOURCE_CHANGED'
  constructor() {
    super('BRIEF_SOURCE_CHANGED')
    this.name = 'BriefSourceChangedError'
  }
}

export type WeddingBriefGenerateSuccess = {
  record: WeddingBriefRecord
  bytes: ArrayBuffer
  fileName: string
}

export type WeddingBriefWorkflowDeps = {
  loadSnapshot: (weddingId: string) => Promise<BuildWeddingBriefPdfDataInput>
  hashSource: (source: CanonicalBriefSource) => Promise<string>
  generatePdfBytes: (input: {
    html: string
    footerHtml: string
    filename: string
  }) => Promise<ArrayBuffer>
  getCurrent: (weddingId: string) => Promise<WeddingBriefRecord | null>
  persistCurrent: typeof weddingBriefService.persistCurrent
  uploadPdf: (path: string, bytes: ArrayBuffer) => Promise<void>
  downloadPdf: (path: string) => Promise<ArrayBuffer>
  removeFile: (path: string) => Promise<void>
  tryRemoveFile: (path: string, reason: string) => Promise<void>
  studioUserId: () => Promise<string>
  randomId: () => string
  now: () => Date
  generatorVersion: number
}

function defaultDeps(): WeddingBriefWorkflowDeps {
  return {
    loadSnapshot: loadWeddingBriefSourceSnapshot,
    hashSource: hashCanonicalBriefSource,
    generatePdfBytes: ({ html, footerHtml, filename }) =>
      convertWeddingBriefHtmlToPdf({ html, filename, footerHtml }),
    getCurrent: (weddingId) => weddingBriefService.getCurrent(weddingId),
    persistCurrent: (input) => weddingBriefService.persistCurrent(input),
    uploadPdf: (path, bytes) => weddingBriefService.uploadPdf(path, bytes),
    downloadPdf: (path) => weddingBriefService.downloadPdf(path),
    removeFile: (path) => weddingBriefService.removeFile(path),
    tryRemoveFile: (path, reason) => weddingBriefService.tryRemoveFile(path, reason),
    studioUserId: () => weddingBriefService.studioUserId(),
    randomId: () => createBrowserSafeId(),
    now: () => new Date(),
    generatorVersion: CURRENT_BRIEF_GENERATOR_VERSION,
  }
}

export function createWeddingBriefWorkflow(
  deps: WeddingBriefWorkflowDeps = defaultDeps(),
) {
  const generateInFlight = new Map<string, Promise<WeddingBriefGenerateSuccess>>()

  async function generateAndPersist(
    weddingId: string,
  ): Promise<WeddingBriefGenerateSuccess> {
    const snapshot = await deps.loadSnapshot(weddingId)
    const source = buildCanonicalBriefSource(snapshot)
    const sourceHash = await deps.hashSource(source)
    const generatedAt = deps.now()
    const data = buildWeddingBriefPdfData({ ...snapshot, generatedAt })
    const filename = buildWeddingBriefFilename(data)
    const html = renderWeddingBriefHtml(data)
    const footerHtml = renderWeddingBriefFooterHtml(data)
    const bytes = await deps.generatePdfBytes({ html, footerHtml, filename })
    assertBriefPdfBytes(bytes)

    const previous = await deps.getCurrent(weddingId)
    const userId = await deps.studioUserId()
    const fileId = deps.randomId()
    const filePath = weddingBriefStoragePath(userId, weddingId, fileId)

    await deps.uploadPdf(filePath, bytes)

    const currentSnapshot = await deps.loadSnapshot(weddingId)
    const currentHash = await deps.hashSource(
      buildCanonicalBriefSource(currentSnapshot),
    )
    if (currentHash !== sourceHash) {
      await deps.tryRemoveFile(filePath, 'stale-generation-source-changed')
      throw new BriefSourceChangedError()
    }

    let record: WeddingBriefRecord
    try {
      record = await deps.persistCurrent({
        weddingId,
        filePath,
        fileName: filename,
        sourceHash,
        generatorVersion: deps.generatorVersion,
        generatedAt: generatedAt.toISOString(),
        byteSize: bytes.byteLength,
      })
    } catch (error) {
      await deps.tryRemoveFile(filePath, 'persist-failed')
      throw error
    }

    if (record.filePath !== filePath) {
      await deps.tryRemoveFile(filePath, 'lost-persist-race')
      const winnerBytes = await deps.downloadPdf(record.filePath)
      return { record, bytes: winnerBytes, fileName: record.fileName }
    }

    const oldPath = previous?.filePath
    if (oldPath && oldPath !== filePath) {
      try {
        await deps.removeFile(oldPath)
      } catch (error) {
        devWarnArgs('[wedding-brief] old file delete failed; new brief remains current', {
          oldPath,
          filePath,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return { record, bytes, fileName: filename }
  }

  async function generateAndPersistOnce(
    weddingId: string,
  ): Promise<WeddingBriefGenerateSuccess> {
    const existing = generateInFlight.get(weddingId)
    if (existing) return existing
    const pending = generateAndPersist(weddingId).finally(() => {
      generateInFlight.delete(weddingId)
    })
    generateInFlight.set(weddingId, pending)
    return pending
  }

  return {
    generateAndPersist: generateAndPersistOnce,
  }
}

export const weddingBriefWorkflow = createWeddingBriefWorkflow()
