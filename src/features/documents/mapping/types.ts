/**
 * Mapping Wizard — Phase 2 local types.
 * Persistence still uses components / blocks / clauses from the documents engine.
 */

import type { DocumentComponentKind } from '@/types/documents'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai'
import type { DocumentStructure } from './preview/documentNodes'
import type { PlannedBlock } from './composition/defaultComponentBlocks'
import type { QuestionnaireDraft } from '@/features/documents/questionnaire'

/** Wizard progress (orthogonal to template.status draft | ready | archived). */
export type TemplateConfigStatus =
  | 'draft'
  | 'analyzed'
  | 'mapped'
  | 'ready'

export type MappingWizardStepId =
  | 'upload'
  | 'analysis'
  | 'questionnaire'
  | 'save'
  /** @deprecated Kept for draft compatibility — use questionnaire / advanced. */
  | 'review'
  | 'mapping'
  | 'components'
  | 'clauses'
  | 'preview'

export type DetectedFieldStatus =
  | 'connected'
  | 'needs_configuration'
  | 'ignored'

export type DetectedFieldOrigin = 'placeholder' | 'heuristic' | 'manual' | 'ai'

/**
 * A dynamic area found in the source contract.
 * `mappedKey` / `suggestedKey` must be Variable Registry keys only.
 */
export interface DetectedField {
  id: string
  /** Human label shown in the document-first UI. */
  label: string
  /** Optional token / found text as it appeared in the source. */
  rawToken: string | null
  suggestedKey: string | null
  mappedKey: string | null
  status: DetectedFieldStatus
  /** Offsets into `DocumentAnalysisResult.sourceText` for highlights. */
  offsets?: { start: number; end: number }
  /** placeholder | heuristic | manual (guided). */
  origin?: DetectedFieldOrigin
  confidence?: 'high' | 'medium' | 'low'
  /** 0–1 numeric confidence from AI. */
  confidenceScore?: number
  suggestionReason?: string
  /** Short human reason for the suggestion. */
  reason?: string
  paragraphIndex?: number | null
}

/** Guided block mapping (deprecated in active flow — AI review is primary). */
export interface ManualDocumentMapping {
  id: string
  /** Stable block id: `block-${index}`. */
  blockId: string
  blockIndex: number
  selectedText: string
  /** Variable Registry key only. */
  variableKey: string
  offsets: { start: number; end: number }
}

/** Currently selected document block for guided mapping (UI). */
export interface SelectedDocumentBlock {
  blockId: string
  blockIndex: number
  selectedText: string
  offsets: { start: number; end: number }
  blankish: boolean
}

/**
 * Free-placed dynamic field (deprecated Phase 4 — not used in Mapping Review).
 * Coordinates are percentages of the preview content box (0–100).
 */
export interface ManualDocumentPlacement {
  id: string
  /** Nearest structure block when click landed on one (optional rematch hint). */
  blockId?: string
  position: {
    x: number
    y: number
  }
  variableKey: string
}

/** Pending click while assigning a variable in placement mode. */
export interface PendingFieldPlacement {
  position: { x: number; y: number }
  blockId?: string
}

export interface DocumentAnalysisResult {
  analyzerVersion: string
  /** Plain text extracted from the user's uploaded document (never invented). */
  sourceText: string
  structure?: DocumentStructure | null
  fields: DetectedField[]
  suggestedComponents: DocumentComponentKind[]
  suggestedClauses: { key: string; title: string; body: string }[]
  analyzedAt: string
  /** Phase 4 AI analyzer payload (source of truth for Mapping Review). */
  aiAnalysis?: AiDocumentAnalysisResult | null
}

export interface MappingWizardDraft {
  templateId: string
  templateVersionId: string | null
  sourceFileName: string | null
  sourceDocxPath: string | null
  configStatus: TemplateConfigStatus
  analysis: DocumentAnalysisResult | null
  fields: DetectedField[]
  /** Enabled reusable sections (composition kinds). */
  enabledComponentKinds: DocumentComponentKind[]
  /** Display / persistence order of sections. */
  componentOrder: DocumentComponentKind[]
  /** Planned document_blocks per enabled kind (payload.variableKeys ready for save). */
  componentBlocks: Partial<Record<DocumentComponentKind, PlannedBlock[]>>
  /** Selected clause defs from document_clause_defs. */
  enabledClauseIds: string[]
  /** Suggested clause keys not yet present in the library (created on save). */
  enabledSuggestedClauseKeys: string[]
  /** User-taught mappings from block-guided mode (optional helper). */
  manualMappings: ManualDocumentMapping[]
  /** Free-placed dynamic fields on the document canvas (primary). */
  manualPlacements: ManualDocumentPlacement[]
  /** AI-generated questionnaire draft (couple questions only). */
  questionnaireDraft: QuestionnaireDraft | null
  dirty: boolean
}

export const MAPPING_WIZARD_STEPS: {
  id: MappingWizardStepId
  label: string
  unlocked: boolean
}[] = [
  { id: 'upload', label: 'Przesyłanie', unlocked: true },
  { id: 'analysis', label: 'Analiza', unlocked: true },
  { id: 'questionnaire', label: 'Ankieta', unlocked: true },
  { id: 'save', label: 'Biblioteka', unlocked: true },
]
