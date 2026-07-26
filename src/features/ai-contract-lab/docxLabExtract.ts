import JSZip from 'jszip'
import { cloneArrayBuffer } from '@/features/documents/mapping/extraction/sourceKind'
import { extractDocxParagraphsIncludingEmpty } from '@/features/documents/template/extractDocxParagraphs'
import { AI_CONTRACT_LAB_MAX_BYTES } from '@/features/ai-contract-lab/aiContractLabFlags'
import type {
  DocumentTextAnchor,
  DocxLabSourceMeta,
} from '@/features/ai-contract-lab/aiContractLabTypes'

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export async function hashArrayBuffer(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function validateLabDocxFile(file: File): string | null {
  const name = file.name.toLowerCase()
  if (!name.endsWith('.docx')) {
    return 'Dozwolony jest wyłącznie plik .docx.'
  }
  if (name.endsWith('.doc') && !name.endsWith('.docx')) {
    return 'Pliki .doc nie są obsługiwane.'
  }
  if (file.size <= 0) return 'Plik jest pusty.'
  if (file.size > AI_CONTRACT_LAB_MAX_BYTES) {
    return 'Plik przekracza limit 20 MB.'
  }
  if (
    file.type &&
    file.type !== DOCX_MIME &&
    file.type !== 'application/octet-stream' &&
    file.type !== 'application/zip'
  ) {
    return 'Nieprawidłowy typ MIME pliku.'
  }
  return null
}

export async function assertValidDocxBytes(
  bytes: ArrayBuffer,
): Promise<{ tableCount: number; hasHeader: boolean; hasFooter: boolean }> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(cloneArrayBuffer(bytes))
  } catch {
    throw new Error('Plik nie jest prawidłowym archiwum DOCX (ZIP).')
  }
  const docFile = zip.file('word/document.xml')
  if (!docFile) {
    throw new Error('Brak word/document.xml — plik nie jest prawidłowym DOCX.')
  }
  const xml = await docFile.async('string')
  if (!xml.includes('<w:document') && !xml.includes('w:document')) {
    throw new Error('word/document.xml jest nieczytelny.')
  }
  const tableCount = (xml.match(/<w:tbl\b/g) ?? []).length
  const hasHeader = Boolean(
    zip.file('word/header1.xml') ||
      Object.keys(zip.files).some((p) => /word\/header\d*\.xml$/.test(p)),
  )
  const hasFooter = Boolean(
    zip.file('word/footer1.xml') ||
      Object.keys(zip.files).some((p) => /word\/footer\d*\.xml$/.test(p)),
  )
  return { tableCount, hasHeader, hasFooter }
}

/** Stable body paragraph anchors — application-level IDs, not raw XML. */
export async function extractLabDocumentAnchors(
  bytes: ArrayBuffer,
): Promise<DocumentTextAnchor[]> {
  const [paragraphs, labMetadata] = await Promise.all([
    extractDocxParagraphsIncludingEmpty(bytes),
    extractLabRunMetadata(bytes),
  ])
  return paragraphs.map((p, i) => {
    const prev = paragraphs[i - 1]?.text ?? ''
    const next = paragraphs[i + 1]?.text ?? ''
    const metadata = labMetadata.get(p.index)
    return {
      anchorId: `body:p${p.index}`,
      container: 'body' as const,
      paragraphIndex: p.index,
      runStart: 0,
      runEnd: Math.max(0, p.text.length),
      text: p.text,
      contextBefore: prev.slice(-160),
      contextAfter: next.slice(0, 160),
      runSegments:
        metadata?.text === p.text ? metadata.runSegments : undefined,
      listMarker: metadata?.listMarker ?? false,
    }
  })
}

async function extractLabRunMetadata(bytes: ArrayBuffer): Promise<
  Map<
    number,
    {
      text: string
      listMarker: boolean
      runSegments: NonNullable<DocumentTextAnchor['runSegments']>
    }
  >
> {
  const zip = await JSZip.loadAsync(cloneArrayBuffer(bytes))
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml || typeof DOMParser === 'undefined') return new Map()
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const paragraphs = Array.from(doc.getElementsByTagNameNS('*', 'p'))
  const result = new Map<
    number,
    {
      text: string
      listMarker: boolean
      runSegments: NonNullable<DocumentTextAnchor['runSegments']>
    }
  >()

  paragraphs.forEach((paragraph, paragraphIndex) => {
    let offset = 0
    const runSegments: NonNullable<DocumentTextAnchor['runSegments']> = []
    const runNodes = Array.from(paragraph.getElementsByTagNameNS('*', 'r'))
    runNodes.forEach((run, runIndex) => {
      const parts = Array.from(run.childNodes)
        .filter((node) => {
          const localName = (node as Element).localName
          return localName === 't' || localName === 'tab'
        })
        .map((node) => ((node as Element).localName === 'tab' ? '\t' : node.textContent ?? ''))
      const text = parts.join('')
      if (!text) return
      const start = offset
      offset += text.length
      const properties = run.getElementsByTagNameNS('*', 'rPr')[0]
      runSegments.push({
        runIndex,
        start,
        end: offset,
        text,
        bold: Boolean(properties?.getElementsByTagNameNS('*', 'b').length),
        italic: Boolean(properties?.getElementsByTagNameNS('*', 'i').length),
      })
    })
    result.set(paragraphIndex, {
      text: runSegments.map((segment) => segment.text).join(''),
      listMarker: paragraph.getElementsByTagNameNS('*', 'numPr').length > 0,
      runSegments,
    })
  })
  return result
}

export async function inspectLabDocx(
  file: File,
  bytes: ArrayBuffer,
): Promise<{ meta: DocxLabSourceMeta; anchors: DocumentTextAnchor[] }> {
  const err = validateLabDocxFile(file)
  if (err) throw new Error(err)
  const structure = await assertValidDocxBytes(bytes)
  const anchors = await extractLabDocumentAnchors(bytes)
  const sourceHash = await hashArrayBuffer(bytes)
  const nonEmpty = anchors.filter((a) => a.text.trim()).length
  return {
    meta: {
      fileName: file.name,
      sizeBytes: file.size,
      sourceHash,
      paragraphCount: anchors.length,
      nonEmptyParagraphCount: nonEmpty,
      tableCount: structure.tableCount,
      hasHeader: structure.hasHeader,
      hasFooter: structure.hasFooter,
    },
    anchors,
  }
}

/** Analysis payload for OpenAI — anchors + field catalog only (no raw DOCX). */
export {
  buildDocumentAnalysisPayload,
  validateAiPayloadSize,
} from '@/features/ai-contract-lab/aiContractLabPayload'

