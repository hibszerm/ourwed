import type {
  DocumentTemplateMeta,
  PackageSnapshot,
  WeddingDocument,
  WeddingDocumentDraft,
} from '@/types/documents'
import type { Wedding } from '@/types/wedding'

export type GeneratedWeddingContractStatus = 'draft' | 'ready'

export interface ContractArtifact {
  id: string
  format: 'docx' | 'pdf'
  generationVersion: number
  fileName: string
  filePath: string
  createdAt: string
  snapshotJson: Record<string, unknown>
  downloadUrl?: string
}

export interface GeneratedWeddingContract {
  draft: WeddingDocumentDraft
  weddingId: string
  templateId: string
  templateVersionId: string
  generationVersion: number | null
  status: GeneratedWeddingContractStatus
  artifacts: ContractArtifact[]
  createdAt: string
  updatedAt: string
}

export interface ContractSourceDataSnapshot {
  wedding: Wedding
  client: Wedding['couple']
  package: PackageSnapshot
  manualOverrides: Record<string, string>
}

export interface ContractArtifactSnapshot {
  schemaVersion: 1
  kind: 'generated_wedding_contract'
  status: 'ready'
  sourceDataSnapshot: ContractSourceDataSnapshot
  template: {
    templateId: string
    templateVersionId: string
  }
  provenance: {
    configuration: {
      status: DocumentTemplateMeta['fieldConfigurationStatus'] | null
      configurationVersion: number | null
      updatedAt: string | null
    }
    replacement: {
      resolvedValues: Record<string, string>
      omittedKeys: string[]
    }
    audit: {
      generatedAt: string
      executionSnapshot: Record<string, string | null> | null
      summary: Record<string, unknown>
    }
  }
  generationVersion: number
}

export function sanitizeContractFileName(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/\p{Cc}/gu, '')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[ .-]+/, '')
    .replace(/[ .-]+$/g, '')
    .trim()
    .slice(0, 100)
    .replace(/[ .-]+$/g, '')
  return normalized || 'umowa'
}

export function nextGenerationVersion(
  documents: Pick<WeddingDocument, 'versionNumber'>[],
): number {
  return (
    documents.reduce(
      (highest, document) => Math.max(highest, document.versionNumber),
      0,
    ) + 1
  )
}

export function buildContractArtifactSnapshot(input: {
  wedding: Wedding
  packageSnapshot: PackageSnapshot
  manualOverrides: Record<string, string>
  templateId: string
  templateVersionId: string
  templateMeta?: DocumentTemplateMeta | null
  resolvedValues: Record<string, string>
  omittedKeys: string[]
  generationVersion: number
  generatedAt?: string
  executionSnapshot?: Record<string, string | null> | null
  auditSummary?: Record<string, unknown>
}): ContractArtifactSnapshot {
  const fieldConfiguration = input.templateMeta?.fieldConfiguration as
    | { configurationVersion?: unknown; updatedAt?: unknown }
    | undefined
  return {
    schemaVersion: 1,
    kind: 'generated_wedding_contract',
    status: 'ready',
    sourceDataSnapshot: {
      wedding: structuredClone(input.wedding),
      client: structuredClone(input.wedding.couple),
      package: structuredClone(input.packageSnapshot),
      manualOverrides: { ...input.manualOverrides },
    },
    template: {
      templateId: input.templateId,
      templateVersionId: input.templateVersionId,
    },
    provenance: {
      configuration: {
        status: input.templateMeta?.fieldConfigurationStatus ?? null,
        configurationVersion:
          typeof fieldConfiguration?.configurationVersion === 'number'
            ? fieldConfiguration.configurationVersion
            : null,
        updatedAt:
          typeof fieldConfiguration?.updatedAt === 'string'
            ? fieldConfiguration.updatedAt
            : null,
      },
      replacement: {
        resolvedValues: { ...input.resolvedValues },
        omittedKeys: [...input.omittedKeys],
      },
      audit: {
        generatedAt: input.generatedAt ?? new Date().toISOString(),
        executionSnapshot: input.executionSnapshot
          ? { ...input.executionSnapshot }
          : null,
        summary: { ...(input.auditSummary ?? {}) },
      },
    },
    generationVersion: input.generationVersion,
  }
}

export function groupGeneratedWeddingContracts(
  drafts: WeddingDocumentDraft[],
  documents: WeddingDocument[],
): GeneratedWeddingContract[] {
  const documentsByDraft = new Map<string, WeddingDocument[]>()
  for (const document of documents) {
    if (!document.draftId) continue
    const current = documentsByDraft.get(document.draftId) ?? []
    current.push(document)
    documentsByDraft.set(document.draftId, current)
  }

  return drafts
    .map((draft) => {
      const rows = documentsByDraft.get(draft.id) ?? []
      const generationVersion =
        rows.reduce(
          (highest, document) => Math.max(highest, document.versionNumber),
          0,
        ) || null
      const updatedAt = rows.reduce(
        (latest, document) =>
          document.createdAt > latest ? document.createdAt : latest,
        draft.updatedAt,
      )
      return {
        draft,
        weddingId: draft.weddingId,
        templateId: draft.templateId,
        templateVersionId: draft.templateVersionId,
        generationVersion,
        status: rows.length > 0 ? 'ready' : 'draft',
        artifacts: rows.map((document) => ({
          id: document.id,
          format: document.format,
          generationVersion: document.versionNumber,
          fileName: document.fileName,
          filePath: document.filePath,
          createdAt: document.createdAt,
          snapshotJson: document.snapshotJson,
        })),
        createdAt: draft.createdAt,
        updatedAt,
      } satisfies GeneratedWeddingContract
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
