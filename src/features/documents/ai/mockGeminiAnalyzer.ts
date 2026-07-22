import { getVariableDef } from '@/features/documents/registry/variableRegistry'
import { aiDocumentAnalysisResultSchema } from './analysisSchema'
import type { DocumentAnalyzer } from './analyzer'
import { DOCUMENT_AI_CONFIG } from './config'
import type {
  AiDocumentAnalysisResult,
  DetectedDocumentClause,
  DetectedDocumentField,
  DetectedDocumentSection,
} from './types'

/**
 * Mock Gemini-style analyzer (local / offline).
 * Production path uses `geminiDocumentAnalyzer` via Edge Function.
 */

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function field(
  partial: Omit<DetectedDocumentField, 'status' | 'label'> & {
    label?: string
  },
): DetectedDocumentField {
  const key = partial.registryKey
  const def = key ? getVariableDef(key) : undefined
  const value = partial.value ?? partial.extractedValue ?? null
  return {
    ...partial,
    value,
    extractedValue: value ?? undefined,
    paragraphIndex: partial.paragraphIndex ?? partial.location?.paragraphIndex ?? null,
    label: partial.label ?? def?.labelPl ?? key ?? 'Nieznane pole',
    status: 'suggested',
  }
}

function buildMockFields(text: string): DetectedDocumentField[] {
  const fields: DetectedDocumentField[] = []
  let n = 0
  const id = () => `ai-field-${++n}`

  fields.push(
    field({
      id: id(),
      registryKey: 'studio.name',
      confidence: 0.98,
      paragraphIndex: 0,
      location: { paragraphIndex: 0, text: 'Nazwa studia / stroną umowy' },
    }),
    field({
      id: id(),
      registryKey: 'wedding.coupleNames',
      confidence: 0.97,
      paragraphIndex: 1,
      location: { paragraphIndex: 1, text: 'Para Młoda / strony umowy' },
    }),
    field({
      id: id(),
      registryKey: 'wedding.date',
      confidence: 0.96,
      paragraphIndex: 2,
      location: { paragraphIndex: 2, text: 'Data ślubu / dzień realizacji' },
    }),
    field({
      id: id(),
      registryKey: 'location.ceremony',
      confidence: 0.94,
      paragraphIndex: 3,
      location: { paragraphIndex: 3, text: 'Miejsce ceremonii' },
    }),
    field({
      id: id(),
      registryKey: 'location.reception',
      confidence: 0.93,
      paragraphIndex: 4,
      location: { paragraphIndex: 4, text: 'Miejsce przyjęcia' },
    }),
    field({
      id: id(),
      registryKey: 'package.name',
      confidence: 0.95,
      paragraphIndex: 5,
      location: { paragraphIndex: 5, text: 'Nazwa / zakres pakietu' },
    }),
    field({
      id: id(),
      registryKey: 'package.price',
      confidence: 0.99,
      paragraphIndex: 6,
      location: { paragraphIndex: 6, text: 'Wynagrodzenie / cena' },
    }),
    field({
      id: id(),
      registryKey: 'package.deposit',
      confidence: 0.97,
      paragraphIndex: 7,
      location: { paragraphIndex: 7, text: 'Zadatek' },
    }),
    field({
      id: id(),
      registryKey: 'package.remaining',
      confidence: 0.92,
      paragraphIndex: 8,
      location: { paragraphIndex: 8, text: 'Pozostała kwota' },
    }),
    field({
      id: id(),
      registryKey: 'bride.firstName',
      confidence: 0.9,
      paragraphIndex: 1,
      location: { paragraphIndex: 1, text: 'Panna młoda — imię' },
    }),
    field({
      id: id(),
      registryKey: 'bride.lastName',
      confidence: 0.88,
      paragraphIndex: 1,
      location: { paragraphIndex: 1, text: 'Panna młoda — nazwisko' },
    }),
    field({
      id: id(),
      registryKey: 'groom.firstName',
      confidence: 0.9,
      paragraphIndex: 1,
      location: { paragraphIndex: 1, text: 'Pan młody — imię' },
    }),
    field({
      id: id(),
      registryKey: 'groom.lastName',
      confidence: 0.88,
      paragraphIndex: 1,
      location: { paragraphIndex: 1, text: 'Pan młody — nazwisko' },
    }),
    field({
      id: id(),
      registryKey: 'additional.contractNumber',
      confidence: 0.85,
      paragraphIndex: 0,
      location: { paragraphIndex: 0, text: 'Numer umowy' },
    }),
    field({
      id: id(),
      registryKey: 'studio.nip',
      confidence: 0.8,
      paragraphIndex: 0,
      location: { paragraphIndex: 0, text: 'NIP studia' },
    }),
  )

  const dateMatch = text.match(/\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/)
  if (dateMatch) {
    const f = fields.find((x) => x.registryKey === 'wedding.date')
    if (f) {
      f.value = dateMatch[0]
      f.extractedValue = dateMatch[0]
      f.confidence = 0.99
      f.location = { ...(f.location ?? {}), text: dateMatch[0] }
    }
  }

  const moneyMatch = text.match(
    /\b\d[\d\s]*(?:[.,]\d{2})?\s*(?:zł|PLN)\b/i,
  )
  if (moneyMatch) {
    const f = fields.find((x) => x.registryKey === 'package.price')
    if (f) {
      f.value = moneyMatch[0]
      f.extractedValue = moneyMatch[0]
      f.confidence = 0.99
      f.location = { ...(f.location ?? {}), text: moneyMatch[0] }
    }
  }

  return fields
}

function buildMockSections(): DetectedDocumentSection[] {
  return [
    { title: 'Nagłówek i strony', order: 0 },
    { title: 'Przedmiot umowy', order: 1 },
    { title: 'Lokalizacje', order: 2 },
    { title: 'Wynagrodzenie', order: 3 },
    { title: 'Postanowienia końcowe', order: 4 },
  ]
}

function buildMockClauses(text: string): DetectedDocumentClause[] {
  const clauses: DetectedDocumentClause[] = [
    {
      id: 'ai-clause-cancellation',
      type: 'cancellation',
      title: 'Rezygnacja',
      confidence: 0.86,
    },
    {
      id: 'ai-clause-image',
      type: 'image_usage',
      title: 'Zgoda na wizerunek',
      confidence: 0.84,
    },
    {
      id: 'ai-clause-delivery',
      type: 'delivery_timeline',
      title: 'Termin dostawy',
      confidence: 0.82,
    },
  ]
  if (/prawa autorsk|copyright|własność/i.test(text)) {
    clauses.push({
      id: 'ai-clause-copyright',
      type: 'copyright',
      title: 'Prawa autorskie',
      confidence: 0.9,
    })
  }
  return clauses
}

export const mockGeminiAnalyzer: DocumentAnalyzer = {
  id: 'mock-gemini',
  version: 'mock-1.0.0',

  async analyze(input): Promise<AiDocumentAnalysisResult> {
    void input.structure
    await delay(400)

    const text = input.text ?? ''
    const fields = buildMockFields(text)
    const avg =
      fields.reduce((s, f) => s + f.confidence, 0) /
      Math.max(fields.length, 1)

    const raw: AiDocumentAnalysisResult = {
      schemaVersion: DOCUMENT_AI_CONFIG.schemaVersion,
      model: 'mock-gemini',
      promptVersion: DOCUMENT_AI_CONFIG.promptVersion,
      analyzerId: this.id,
      analyzerVersion: this.version,
      documentType: 'contract',
      overallConfidence: avg,
      fields,
      sections: buildMockSections(),
      clauses: buildMockClauses(text),
      warnings: [],
      analyzedAt: new Date().toISOString(),
      sourceTextLength: text.length,
      fromCache: false,
    }

    return aiDocumentAnalysisResultSchema.parse(raw)
  },
}
