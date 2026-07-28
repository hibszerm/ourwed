import { extractDocumentStructure } from '@/features/documents/mapping/extraction/unifiedDocumentExtractor'
import type { SourceDocumentKind } from '@/features/documents/mapping/extraction/sourceKind'
import type { DocumentTextAvailability, ExtractedDocumentText } from './types'
import { ContractRecoveryError } from './errors'
import { classifyTextAvailability } from './textAvailability'

function mapKindToMethod(kind: SourceDocumentKind): 'pdf_text' | 'docx_text' {
  return kind === 'pdf' ? 'pdf_text' : 'docx_text'
}

function buildSectionsFromStructure(
  plainText: string,
  kind: SourceDocumentKind,
): ExtractedDocumentText['sections'] {
  if (!plainText.trim()) return []
  const chunks = plainText.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean)
  return chunks.map((text, index) => ({
    index,
    text,
    page: kind === 'pdf' ? index + 1 : null,
  }))
}

export async function extractSourceContractText(input: {
  bytes: ArrayBuffer
  fileName: string
  mimeType: string
}): Promise<ExtractedDocumentText> {
  const warnings: string[] = []
  let availability: DocumentTextAvailability = 'text_available'

  try {
    const { kind, structure } = await extractDocumentStructure(
      input.bytes,
      input.fileName,
    )

    if (kind === 'doc') {
      throw new ContractRecoveryError('CONTRACT_RECOVERY_UNSUPPORTED_FILE')
    }

    const plainText = structure.plainText ?? ''
    availability = classifyTextAvailability(plainText)

    return {
      fileName: input.fileName,
      mimeType: input.mimeType,
      plainText,
      sections: buildSectionsFromStructure(plainText, kind),
      extractionMethod: mapKindToMethod(kind),
      warnings,
      availability,
    }
  } catch (err) {
    if (err instanceof ContractRecoveryError) throw err
    const message = err instanceof Error ? err.message.toLowerCase() : ''
    if (message.includes('password') || message.includes('encrypted')) {
      availability = 'password_protected'
      throw new ContractRecoveryError('CONTRACT_RECOVERY_PASSWORD_PROTECTED_PDF')
    }
    availability = 'parse_failed'
    throw new ContractRecoveryError('CONTRACT_RECOVERY_DOCUMENT_PARSE_FAILED')
  }
}
