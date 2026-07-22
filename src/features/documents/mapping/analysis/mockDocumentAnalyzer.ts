import {
  getVariableDef,
  isKnownVariableKey,
} from '@/features/documents/registry/variableRegistry'
import type { DocumentAnalyzer } from './documentAnalyzer'
import type { DetectedField, DocumentAnalysisResult } from '../types'

/**
 * Analyzes extracted contract text (never invents document content).
 * Detects placeholder-like tokens and binds known ones to the Variable Registry.
 */

const DEFAULT_COMPONENTS: DocumentAnalysisResult['suggestedComponents'] = [
  'header',
  'parties',
  'wedding_information',
  'package_items',
  'payment_summary',
  'optional_clauses',
  'signature_block',
]

const DEFAULT_CLAUSES: DocumentAnalysisResult['suggestedClauses'] = [
  {
    key: 'cancellation',
    title: 'Rezygnacja',
    body: 'Warunki odstąpienia od umowy i zwrotu zadatku.',
  },
  {
    key: 'image_usage',
    title: 'Zgoda na wykorzystanie wizerunku',
    body: 'Zasady publikacji zdjęć w portfolio i mediach społecznościowych.',
  },
  {
    key: 'delivery_timeline',
    title: 'Termin dostawy',
    body: 'Harmonogram przekazania materiałów po dniu ślubu.',
  },
]

/** {{key}}, [[key]], or {key} when key looks like a registry path. */
const TOKEN_PATTERN =
  /\{\{([^{}]+)\}\}|\[\[([^[\]]+)\]\]|\{([a-zA-Z][\w.]*)\}/g

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function detectFieldsFromText(sourceText: string): DetectedField[] {
  const fields: DetectedField[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null
  const re = new RegExp(TOKEN_PATTERN.source, 'g')

  while ((match = re.exec(sourceText)) !== null) {
    const rawToken = match[0]
    const inner = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (!inner) continue

    const start = match.index
    const end = start + rawToken.length
    const dedupeKey = `${start}:${end}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const known = isKnownVariableKey(inner)
    const def = known ? getVariableDef(inner) : undefined

    fields.push({
      id: `field-${fields.length + 1}-${start}`,
      label: def?.labelPl ?? (inner.includes('.') ? inner : `Obszar: ${inner}`),
      rawToken,
      suggestedKey: known ? inner : null,
      mappedKey: known ? inner : null,
      status: known ? 'connected' : 'needs_configuration',
      offsets: { start, end },
      origin: 'placeholder',
    })
  }

  return fields
}

export const mockDocumentAnalyzer: DocumentAnalyzer = {
  id: 'mock',
  version: 'mock-2.0.0',

  async analyze(input): Promise<DocumentAnalysisResult> {
    void input.templateId
    void input.templateVersionId
    void input.sourceFileName

    const sourceText = input.sourceText
    if (!sourceText.trim()) {
      throw new Error('Brak tekstu dokumentu do analizy.')
    }

    await delay(400)

    const fields = detectFieldsFromText(sourceText)

    return {
      analyzerVersion: this.version,
      sourceText,
      fields,
      suggestedComponents: DEFAULT_COMPONENTS,
      suggestedClauses: DEFAULT_CLAUSES,
      analyzedAt: new Date().toISOString(),
    }
  },
}
