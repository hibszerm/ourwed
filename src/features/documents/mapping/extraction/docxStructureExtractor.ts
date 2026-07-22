import JSZip from 'jszip'
import type { DocumentExtractInput } from './documentTextExtractor'
import type {
  DocumentBlock,
  DocumentInline,
  DocumentMarks,
  DocumentStructure,
} from '../preview/documentNodes'

const W_NS =
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

export interface DocumentStructureExtractor {
  readonly id: string
  readonly version: string
  extract(input: DocumentExtractInput): Promise<DocumentStructure>
}

function toArrayBuffer(input: DocumentExtractInput): Promise<ArrayBuffer> {
  if (input instanceof ArrayBuffer) return Promise.resolve(input)
  if (input instanceof Uint8Array) {
    const copy = new Uint8Array(input.byteLength)
    copy.set(input)
    return Promise.resolve(copy.buffer)
  }
  return input.arrayBuffer()
}

function directChildren(el: Element, localName: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === localName)
}

function firstChild(el: Element | null, localName: string): Element | null {
  if (!el) return null
  return directChildren(el, localName)[0] ?? null
}

function attr(el: Element | null, localName: string): string | null {
  if (!el) return null
  return (
    el.getAttributeNS(W_NS, localName) ??
    el.getAttribute(`w:${localName}`) ??
    el.getAttribute(localName)
  )
}

function isOn(el: Element | null): boolean {
  if (!el) return false
  const val = attr(el, 'val')
  if (val === null) return true
  return val !== '0' && val.toLowerCase() !== 'false'
}

function headingLevelFromStyle(styleVal: string | null): number | null {
  if (!styleVal) return null
  const s = styleVal.toLowerCase()
  if (s === 'title' || s === 'tytuł' || s === 'tytul') return 1
  const match =
    s.match(/^heading\s*(\d)$/i) ??
    s.match(/^nagłówek\s*(\d)$/i) ??
    s.match(/^naglowek\s*(\d)$/i) ??
    s.match(/^heading([1-6])$/i) ??
    s.match(/^nagłówek([1-6])$/i) ??
    s.match(/^naglowek([1-6])$/i)
  if (match?.[1]) {
    const n = Number.parseInt(match[1], 10)
    return Number.isFinite(n) ? Math.min(6, Math.max(1, n)) : 1
  }
  return null
}

function parseRunMarks(rPr: Element | null): DocumentMarks | undefined {
  if (!rPr) return undefined
  const bold = isOn(firstChild(rPr, 'b')) || isOn(firstChild(rPr, 'bCs'))
  const italic = isOn(firstChild(rPr, 'i')) || isOn(firstChild(rPr, 'iCs'))
  if (!bold && !italic) return undefined
  return { bold: bold || undefined, italic: italic || undefined }
}

interface ParagraphMeta {
  headingLevel: number | null
  listLevel: number | null
  numId: string | null
  listKind: 'bullet' | 'number'
}

function parseParagraphMeta(p: Element): ParagraphMeta {
  const pPr = firstChild(p, 'pPr')
  const outline = firstChild(pPr, 'outlineLvl')
  const outlineVal = outline
    ? Number.parseInt(attr(outline, 'val') ?? '', 10)
    : NaN
  const style = firstChild(pPr, 'pStyle')
  const styleVal = attr(style, 'val')
  const styleLevel = headingLevelFromStyle(styleVal)
  const headingLevel = Number.isFinite(outlineVal)
    ? Math.min(6, Math.max(1, outlineVal + 1))
    : styleLevel

  const numPr = firstChild(pPr, 'numPr')
  const ilvl = firstChild(numPr, 'ilvl')
  const numIdEl = firstChild(numPr, 'numId')
  const listLevel = numPr
    ? Number.parseInt(attr(ilvl, 'val') ?? '0', 10) || 0
    : null
  const numId = numPr ? attr(numIdEl, 'val') : null
  const styleLower = (styleVal ?? '').toLowerCase()
  const listKind: 'bullet' | 'number' =
    styleLower.includes('bullet') ||
    styleLower.includes('punkt') ||
    styleLower.includes('ul')
      ? 'bullet'
      : 'number'

  return { headingLevel, listLevel, numId, listKind }
}

function parseParagraphInlines(
  p: Element,
  offset: { value: number },
): DocumentInline[] {
  const inlines: DocumentInline[] = []

  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (child.localName === 'r') {
        const rPr = firstChild(child, 'rPr')
        const marks = parseRunMarks(rPr)
        for (const part of Array.from(child.children)) {
          if (part.localName === 't') {
            const text = part.textContent ?? ''
            if (!text) continue
            const start = offset.value
            offset.value += text.length
            inlines.push({
              type: 'text',
              text,
              marks,
              start,
              end: offset.value,
            })
          } else if (part.localName === 'tab') {
            const start = offset.value
            offset.value += 1
            inlines.push({
              type: 'text',
              text: '\t',
              marks,
              start,
              end: offset.value,
            })
          } else if (part.localName === 'br' || part.localName === 'cr') {
            const start = offset.value
            offset.value += 1
            inlines.push({ type: 'break', start, end: offset.value })
          }
        }
      } else if (child.localName === 'hyperlink') {
        walk(child)
      }
    }
  }

  walk(p)
  return inlines
}

function collectParagraphs(root: Element): Element[] {
  const out: Element[] = []
  const visit = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (child.localName === 'p') {
        out.push(child)
      } else if (
        child.localName === 'tbl' ||
        child.localName === 'tr' ||
        child.localName === 'tc' ||
        child.localName === 'sdt' ||
        child.localName === 'sdtContent'
      ) {
        visit(child)
      }
    }
  }
  visit(root)
  return out
}

function blockPlainText(children: DocumentInline[]): string {
  return children.map((c) => (c.type === 'text' ? c.text : '\n')).join('')
}

function parseDocumentXml(
  xml: string,
  extractorVersion: string,
): DocumentStructure {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml')
  if (parsed.querySelector('parsererror')) {
    throw new Error('Nie udało się przetworzyć struktury dokumentu DOCX.')
  }

  const body =
    parsed.getElementsByTagNameNS(W_NS, 'body')[0] ??
    parsed.getElementsByTagName('w:body')[0]
  if (!body) {
    throw new Error('Dokument nie zawiera sekcji body.')
  }

  const paragraphs = collectParagraphs(body)
  const blocks: DocumentBlock[] = []
  const offset = { value: 0 }
  const listCounters = new Map<string, number>()

  paragraphs.forEach((p, index) => {
    if (index > 0) {
      offset.value += 1
    }

    const meta = parseParagraphMeta(p)
    const blockStart = offset.value
    const children = parseParagraphInlines(p, offset)
    const blockEnd = offset.value

    if (meta.listLevel !== null) {
      const key = `${meta.numId ?? 'default'}:${meta.listLevel}`
      const deeperKeys = [...listCounters.keys()].filter((k) => {
        const [, lvl] = k.split(':')
        return Number(lvl) > (meta.listLevel ?? 0)
      })
      for (const k of deeperKeys) listCounters.delete(k)

      const next = (listCounters.get(key) ?? 0) + 1
      listCounters.set(key, next)

      blocks.push({
        type: 'list-item',
        listLevel: meta.listLevel,
        listKind: meta.listKind,
        listIndex: next,
        children,
        start: blockStart,
        end: blockEnd,
      })
      return
    }

    if (meta.headingLevel !== null) {
      blocks.push({
        type: 'heading',
        level: meta.headingLevel,
        children,
        start: blockStart,
        end: blockEnd,
      })
      return
    }

    blocks.push({
      type: 'paragraph',
      children,
      start: blockStart,
      end: blockEnd,
    })
  })

  const plainText = blocks.map((b) => blockPlainText(b.children)).join('\n')

  return {
    extractorVersion,
    blocks,
    plainText,
  }
}

export const docxStructureExtractor: DocumentStructureExtractor = {
  id: 'docx-structure',
  version: '1.0.0',

  async extract(input) {
    const buffer = await toArrayBuffer(input)
    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(buffer)
    } catch {
      throw new Error(
        'Nie udało się odczytać pliku DOCX. Upewnij się, że to prawidłowy dokument Word.',
      )
    }

    const entry = zip.file('word/document.xml')
    if (!entry) {
      throw new Error(
        'Plik nie zawiera treści dokumentu (brak word/document.xml).',
      )
    }

    const xml = await entry.async('string')
    const structure = parseDocumentXml(xml, this.version)
    if (!structure.plainText.trim()) {
      throw new Error('Dokument nie zawiera tekstu do analizy.')
    }
    return structure
  },
}

export const activeDocumentStructureExtractor: DocumentStructureExtractor =
  docxStructureExtractor
