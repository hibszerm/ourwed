const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export type ContractUploadValidation =
  | { ok: true }
  | { ok: false; message: string }

/** User-facing contract imports accept only non-empty modern Word documents. */
export function validateContractDocx(file: File): ContractUploadValidation {
  if (file.size <= 0) {
    return { ok: false, message: 'Wybrany plik jest pusty.' }
  }

  const hasDocxName = file.name.trim().toLowerCase().endsWith('.docx')
  const hasAllowedMime = !file.type || file.type === DOCX_MIME
  if (!hasDocxName || !hasAllowedMime) {
    return {
      ok: false,
      message: 'Dodaj niepusty plik w formacie DOCX.',
    }
  }

  return { ok: true }
}
