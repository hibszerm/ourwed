import {
  MAX_SOURCE_CONTRACT_BYTES,
  SOURCE_CONTRACT_DOCX_MIME,
  SOURCE_CONTRACT_PDF_MIME,
} from './constants'
import { ContractRecoveryError } from './errors'

const DOCX_EXT = '.docx'
const PDF_EXT = '.pdf'

export type SourceContractFileValidation =
  | { ok: true; mimeType: string; extension: 'docx' | 'pdf' }
  | { ok: false; code: 'CONTRACT_RECOVERY_UNSUPPORTED_FILE' | 'CONTRACT_RECOVERY_FILE_TOO_LARGE' }

export function validateSourceContractFile(file: File): SourceContractFileValidation {
  if (file.size <= 0 || file.size > MAX_SOURCE_CONTRACT_BYTES) {
    return { ok: false, code: 'CONTRACT_RECOVERY_FILE_TOO_LARGE' }
  }

  const lower = file.name.trim().toLowerCase()
  const isDocx = lower.endsWith(DOCX_EXT)
  const isPdf = lower.endsWith(PDF_EXT)

  if (!isDocx && !isPdf) {
    return { ok: false, code: 'CONTRACT_RECOVERY_UNSUPPORTED_FILE' }
  }

  if (isDocx) {
    const mimeOk = !file.type || file.type === SOURCE_CONTRACT_DOCX_MIME
    if (!mimeOk) {
      return { ok: false, code: 'CONTRACT_RECOVERY_UNSUPPORTED_FILE' }
    }
    return { ok: true, mimeType: SOURCE_CONTRACT_DOCX_MIME, extension: 'docx' }
  }

  const mimeOk =
    !file.type ||
    file.type === SOURCE_CONTRACT_PDF_MIME ||
    file.type === 'application/x-pdf'
  if (!mimeOk) {
    return { ok: false, code: 'CONTRACT_RECOVERY_UNSUPPORTED_FILE' }
  }
  return { ok: true, mimeType: SOURCE_CONTRACT_PDF_MIME, extension: 'pdf' }
}

export function assertValidSourceContractFile(file: File): {
  mimeType: string
  extension: 'docx' | 'pdf'
} {
  const result = validateSourceContractFile(file)
  if (!result.ok) {
    throw new ContractRecoveryError(result.code)
  }
  return { mimeType: result.mimeType, extension: result.extension }
}

export function sanitizeStoredFileName(
  originalName: string,
  extension: 'docx' | 'pdf',
): string {
  const base = originalName.replace(/[^\w.\-ąćęłńóśźżĄĆĘŁŃÓŚŹŻ ]+/gi, '_').trim()
  const withoutExt = base.replace(/\.(docx|pdf)$/i, '')
  return `${withoutExt || 'umowa'}.${extension}`
}
