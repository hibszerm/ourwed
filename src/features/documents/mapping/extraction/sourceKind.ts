import type { DocumentExtractInput } from './documentTextExtractor'

/** Independent copy — safe when a consumer may transfer/detach the buffer. */
export function cloneArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return buffer.slice(0)
}

/** True when the ArrayBuffer can no longer be read (e.g. transferred to a worker). */
export function isArrayBufferDetached(buffer: ArrayBuffer): boolean {
  const withFlag = buffer as ArrayBuffer & { detached?: boolean }
  if (typeof withFlag.detached === 'boolean') return withFlag.detached
  try {
    // Accessing a detached buffer via TypedArray throws in modern engines.
    // eslint-disable-next-line no-new
    new Uint8Array(buffer)
    return false
  } catch {
    return true
  }
}

export async function toArrayBuffer(
  input: DocumentExtractInput,
): Promise<ArrayBuffer> {
  if (input instanceof ArrayBuffer) return input
  if (input instanceof Uint8Array) {
    const copy = new Uint8Array(input.byteLength)
    copy.set(input)
    return copy.buffer
  }
  return input.arrayBuffer()
}

export type SourceDocumentKind = 'docx' | 'doc' | 'pdf' | 'unknown'

export function detectSourceKind(
  fileName: string | null | undefined,
  bytes?: ArrayBuffer | null,
): SourceDocumentKind {
  const name = (fileName ?? '').toLowerCase()
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx')) return 'docx'
  if (name.endsWith('.doc')) return 'doc'

  if (bytes && bytes.byteLength >= 4) {
    const u8 = new Uint8Array(bytes)
    // PDF
    if (
      u8[0] === 0x25 &&
      u8[1] === 0x50 &&
      u8[2] === 0x44 &&
      u8[3] === 0x46
    ) {
      return 'pdf'
    }
    // ZIP / OOXML
    if (u8[0] === 0x50 && u8[1] === 0x4b) return 'docx'
    // OLE Compound File (legacy .doc)
    if (
      u8[0] === 0xd0 &&
      u8[1] === 0xcf &&
      u8[2] === 0x11 &&
      u8[3] === 0xe0
    ) {
      return 'doc'
    }
  }
  return 'unknown'
}

export function contentTypeForKind(kind: SourceDocumentKind): string {
  switch (kind) {
    case 'pdf':
      return 'application/pdf'
    case 'doc':
      return 'application/msword'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    default:
      return 'application/octet-stream'
  }
}

export function assertSupportedSourceFile(file: File) {
  const kind = detectSourceKind(file.name)
  if (kind === 'unknown') {
    throw new Error('Dodaj plik w formacie DOCX, DOC lub PDF.')
  }
}
