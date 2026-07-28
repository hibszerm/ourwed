import { throwOnError } from '@/lib/supabase/helpers'
import {
  mapDraft,
  mapExport,
  type DraftRow,
  type ExportRow,
} from '@/lib/api/documents/mappers'
import type {
  DocumentTemplateMeta,
  PackageSnapshot,
  WeddingDocumentDraft,
} from '@/types/documents'
import type { Wedding } from '@/types/wedding'
import { hashBytes } from '@/features/documents/ai/hash'
import {
  ContractExportService,
  type PersistedContractArtifact,
} from './ContractExportService'
import {
  buildContractArtifactSnapshot,
  groupGeneratedWeddingContracts,
  type GeneratedWeddingContract,
} from './contractArtifactDomain'

export interface PersistGeneratedWeddingContractInput {
  wedding: Wedding
  draftId: string
  templateId: string
  templateVersionId: string
  title: string
  docxBytes: ArrayBuffer
  packageSnapshot: PackageSnapshot
  manualOverrides: Record<string, string>
  resolvedValues: Record<string, string>
  omittedKeys: string[]
  templateMeta?: DocumentTemplateMeta | null
  executionSnapshot?: Record<string, string | null> | null
  auditSummary?: Record<string, unknown>
}

export interface PersistGeneratedWeddingContractResult {
  generationVersion: number
  status: 'ready'
  docx: PersistedContractArtifact
  pdf: PersistedContractArtifact | null
  pdfAvailable: boolean
  pdfError: string | null
}

export async function allocateNextGenerationVersion(
  weddingId: string,
  templateId: string,
): Promise<number> {
  const [{ assertWeddingOwned }, { supabase }] = await Promise.all([
    import('@/lib/api/ownership'),
    import('@/lib/supabase'),
  ])
  await assertWeddingOwned(weddingId)
  const { data, error } = await supabase.rpc(
    'allocate_wedding_document_generation_version',
    {
      target_wedding_id: weddingId,
      target_template_id: templateId,
    },
  )
  throwOnError(error)
  const value = Number(data)
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Nie udało się przydzielić wersji wygenerowanej umowy.')
  }
  return value
}

function assertEqDocxHash(left: string, right: string): void {
  if (left !== right) {
    throw new Error('CONTRACT_ARTIFACT_VERSION_MISMATCH: DOCX bytes differ between save and PDF conversion')
  }
}

interface ArtifactPersistenceDependencies {
  allocateVersion: (weddingId: string, templateId: string) => Promise<number>
  getDraft: (id: string) => Promise<WeddingDocumentDraft | null>
  generateDocx: typeof ContractExportService.generateDocx
  generatePdf: typeof ContractExportService.generatePdf
  pdfAvailable: boolean
}

export function createContractArtifactPersistenceService(
  dependencies: ArtifactPersistenceDependencies,
) {
  return {
    async persist(
      input: PersistGeneratedWeddingContractInput,
    ): Promise<PersistGeneratedWeddingContractResult> {
      const draft = await dependencies.getDraft(input.draftId)
      if (
        !draft ||
        draft.weddingId !== input.wedding.id ||
        draft.templateId !== input.templateId ||
        draft.templateVersionId !== input.templateVersionId
      ) {
        throw new Error('Szkic umowy nie odpowiada wybranemu ślubowi i szablonowi.')
      }

      const generationVersion = await dependencies.allocateVersion(
        input.wedding.id,
        input.templateId,
      )
      const snapshotJson = buildContractArtifactSnapshot({
        wedding: input.wedding,
        packageSnapshot: input.packageSnapshot,
        manualOverrides: input.manualOverrides,
        templateId: input.templateId,
        templateVersionId: input.templateVersionId,
        templateMeta: input.templateMeta,
        resolvedValues: input.resolvedValues,
        omittedKeys: input.omittedKeys,
        generationVersion,
        executionSnapshot: input.executionSnapshot,
        auditSummary: input.auditSummary,
      })
      const docx = await dependencies.generateDocx({
        weddingId: input.wedding.id,
        draftId: input.draftId,
        templateId: input.templateId,
        templateVersionId: input.templateVersionId,
        generationVersion,
        title: input.title,
        docxBytes: input.docxBytes,
        snapshotJson: snapshotJson as unknown as Record<string, unknown>,
      })

      const persistedDocxHash = await hashBytes(input.docxBytes)

      let pdf: PersistedContractArtifact | null = null
      let pdfError: string | null = null
      if (dependencies.pdfAvailable) {
        try {
          const pdfSourceHash = await hashBytes(input.docxBytes)
          assertEqDocxHash(persistedDocxHash, pdfSourceHash)
          pdf = await dependencies.generatePdf({
            weddingId: input.wedding.id,
            draftId: input.draftId,
            templateId: input.templateId,
            templateVersionId: input.templateVersionId,
            generationVersion,
            title: input.title,
            docxBytes: input.docxBytes,
            snapshotJson: snapshotJson as unknown as Record<string, unknown>,
          })
        } catch (e) {
          pdfError =
            e instanceof Error
              ? e.message
              : 'Nie udało się przygotować podglądu PDF. Dokument DOCX został zachowany.'
        }
      }

      return {
        generationVersion,
        status: 'ready',
        docx,
        pdf,
        pdfAvailable: Boolean(pdf),
        pdfError,
      }
    },
  }
}

export const ContractArtifactPersistenceService =
  createContractArtifactPersistenceService({
    allocateVersion: allocateNextGenerationVersion,
    async getDraft(id) {
      const { documentDraftService } = await import('@/lib/api/documents')
      return documentDraftService.get(id)
    },
    generateDocx: (input) => ContractExportService.generateDocx(input),
    generatePdf: (input) => ContractExportService.generatePdf(input),
    // DOCX is authoritative; experimental PDF is on-demand and never blocks save.
    pdfAvailable: false,
  })

async function loadGrouped(
  weddingIds: string[],
): Promise<GeneratedWeddingContract[]> {
  if (weddingIds.length === 0) return []
  const { supabase } = await import('@/lib/supabase')
  const [draftResult, documentResult] = await Promise.all([
    supabase
      .from('wedding_document_drafts')
      .select('*')
      .in('wedding_id', weddingIds),
    supabase
      .from('wedding_documents')
      .select('*')
      .in('wedding_id', weddingIds)
      .order('created_at', { ascending: false }),
  ])
  throwOnError(draftResult.error)
  throwOnError(documentResult.error)
  return groupGeneratedWeddingContracts(
    ((draftResult.data ?? []) as DraftRow[]).map(mapDraft),
    ((documentResult.data ?? []) as ExportRow[]).map(mapExport),
  ).filter((contract) => contract.artifacts.length > 0)
}

export const GeneratedWeddingContractService = {
  async listForWedding(weddingId: string): Promise<GeneratedWeddingContract[]> {
    const { assertWeddingOwned } = await import('@/lib/api/ownership')
    await assertWeddingOwned(weddingId)
    return loadGrouped([weddingId])
  },

  async listAllForStudio(): Promise<GeneratedWeddingContract[]> {
    const { listOwnedWeddingIds } = await import('@/lib/api/ownership')
    return loadGrouped(await listOwnedWeddingIds())
  },

  async getForWedding(
    weddingId: string,
    contractId: string,
  ): Promise<GeneratedWeddingContract | null> {
    const contracts = await this.listForWedding(weddingId)
    return (
      contracts.find(
        (contract) =>
          contract.draft.id === contractId ||
          contract.artifacts.some((artifact) => artifact.id === contractId),
      ) ?? null
    )
  },

  async getArtifactDownloadUrl(
    weddingId: string,
    contractId: string,
    format: 'docx' | 'pdf',
  ): Promise<string | null> {
    const contract = await this.getForWedding(weddingId, contractId)
    const artifact = contract?.artifacts
      .filter((item) => item.format === format)
      .sort((a, b) => b.generationVersion - a.generationVersion)[0]
    if (!artifact) return null
    const { documentStorage } = await import('@/lib/api/documents/storage')
    return documentStorage.signedUrl(artifact.filePath, 3600)
  },

  async downloadArtifact(
    weddingId: string,
    contractId: string,
    format: 'docx' | 'pdf',
  ): Promise<ArrayBuffer | null> {
    const contract = await this.getForWedding(weddingId, contractId)
    const artifact = contract?.artifacts
      .filter((item) => item.format === format)
      .sort((a, b) => b.generationVersion - a.generationVersion)[0]
    if (!artifact) return null
    const { documentStorage } = await import('@/lib/api/documents/storage')
    return documentStorage.download(artifact.filePath)
  },
}
