import type { DocumentComponentKind } from '@/types/documents'
import {
  DEFAULT_COMPONENT_ORDER,
  mappedKeysFromFields,
  rebuildComponentBlocks,
} from '../composition/defaultComponentBlocks'
import type {
  DetectedField,
  DocumentAnalysisResult,
  ManualDocumentMapping,
  ManualDocumentPlacement,
  MappingWizardDraft,
  MappingWizardStepId,
  PendingFieldPlacement,
  SelectedDocumentBlock,
  TemplateConfigStatus,
} from '../types'
import { MAPPING_WIZARD_STEPS } from '../types'
import { generateQuestionnaireDraft } from '@/features/documents/questionnaire'
import type { DraftQuestion, QuestionnaireDraft } from '@/features/documents/questionnaire'

export interface MappingWizardState {
  step: MappingWizardStepId
  draft: MappingWizardDraft
  sourceBytes: ArrayBuffer | null
  selectedBlock: SelectedDocumentBlock | null
  /** Bidirectional highlight between preview and field list. */
  selectedFieldId: string | null
  /** Free-placement mode: click canvas to drop a field. */
  placementMode: boolean
  /** Click position waiting for variable assignment. */
  pendingPlacement: PendingFieldPlacement | null
  analysisStatus: 'idle' | 'running' | 'success' | 'error'
  analysisError: string | null
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error'
  uploadError: string | null
}

export type MappingWizardAction =
  | {
      type: 'hydrate'
      templateId: string
      templateVersionId: string | null
      sourceFileName: string | null
      sourceDocxPath: string | null
    }
  | { type: 'set_step'; step: MappingWizardStepId }
  | { type: 'upload_start' }
  | {
      type: 'upload_success'
      templateVersionId: string
      sourceFileName: string
      sourceDocxPath: string | null
      sourceBytes: ArrayBuffer | null
    }
  | { type: 'upload_error'; message: string }
  | { type: 'analysis_start' }
  | {
      type: 'analysis_success'
      result: DocumentAnalysisResult
      templateName?: string | null
    }
  | { type: 'analysis_error'; message: string }
  | { type: 'set_fields'; fields: DetectedField[] }
  | {
      type: 'map_field'
      fieldId: string
      mappedKey: string | null
    }
  | { type: 'ignore_field'; fieldId: string }
  | { type: 'accept_suggestion'; fieldId: string }
  | { type: 'select_field'; fieldId: string | null }
  | { type: 'select_document_block'; block: SelectedDocumentBlock }
  | { type: 'clear_document_selection' }
  | {
      type: 'create_mapping'
      variableKey: string
    }
  | { type: 'remove_mapping'; mappingId: string }
  | { type: 'start_field_placement' }
  | { type: 'stop_field_placement' }
  | { type: 'place_field_pending'; pending: PendingFieldPlacement }
  | { type: 'cancel_pending_placement' }
  | {
      type: 'place_field'
      variableKey: string
    }
  | { type: 'remove_field_placement'; placementId: string }
  | {
      type: 'update_field_placement'
      placementId: string
      variableKey: string
    }
  | { type: 'toggle_component'; kind: DocumentComponentKind; enabled: boolean }
  | { type: 'reorder_components'; order: DocumentComponentKind[] }
  | { type: 'move_component'; kind: DocumentComponentKind; direction: 'up' | 'down' }
  | { type: 'toggle_clause_id'; clauseId: string; enabled: boolean }
  | { type: 'toggle_suggested_clause'; key: string; enabled: boolean }
  | { type: 'set_questionnaire_draft'; draft: QuestionnaireDraft | null }
  | {
      type: 'update_draft_question'
      questionId: string
      patch: Partial<DraftQuestion>
    }
  | { type: 'toggle_draft_question'; questionId: string; enabled: boolean }
  | { type: 'set_questionnaire_name'; name: string }
  | { type: 'questionnaire_saved'; formId: string }
  | { type: 'mark_clean' }

function emptyDraft(
  templateId: string,
  templateVersionId: string | null,
  sourceFileName: string | null,
  sourceDocxPath: string | null,
): MappingWizardDraft {
  return {
    templateId,
    templateVersionId,
    sourceFileName,
    sourceDocxPath,
    configStatus: 'draft',
    analysis: null,
    fields: [],
    enabledComponentKinds: [],
    componentOrder: [...DEFAULT_COMPONENT_ORDER],
    componentBlocks: {},
    enabledClauseIds: [],
    enabledSuggestedClauseKeys: [],
    manualMappings: [],
    manualPlacements: [],
    questionnaireDraft: null,
    dirty: false,
  }
}

export function createInitialWizardState(input: {
  templateId: string
  templateVersionId: string | null
  sourceFileName: string | null
  sourceDocxPath: string | null
}): MappingWizardState {
  const hasFile = Boolean(input.sourceFileName || input.sourceDocxPath)
  return {
    step: hasFile ? 'analysis' : 'upload',
    draft: emptyDraft(
      input.templateId,
      input.templateVersionId,
      input.sourceFileName,
      input.sourceDocxPath,
    ),
    sourceBytes: null,
    selectedBlock: null,
    selectedFieldId: null,
    placementMode: false,
    pendingPlacement: null,
    analysisStatus: 'idle',
    analysisError: null,
    uploadStatus: hasFile ? 'success' : 'idle',
    uploadError: null,
  }
}

function deriveConfigStatus(
  draft: MappingWizardDraft,
  next: Partial<MappingWizardDraft>,
): TemplateConfigStatus {
  const merged = { ...draft, ...next }
  if (merged.analysis) {
    const allMapped =
      merged.fields.length > 0 &&
      merged.fields.every(
        (f) => f.status === 'connected' || f.status === 'ignored',
      )
    if (
      (allMapped && merged.enabledComponentKinds.length > 0) ||
      merged.manualMappings.length > 0 ||
      merged.manualPlacements.length > 0
    ) {
      return 'mapped'
    }
    return 'analyzed'
  }
  return 'draft'
}

function mappedKeysIncludingManual(draft: MappingWizardDraft): string[] {
  const fromFields = mappedKeysFromFields(draft.fields)
  const fromManual = draft.manualMappings.map((m) => m.variableKey)
  const fromPlacements = draft.manualPlacements.map((p) => p.variableKey)
  return [...new Set([...fromFields, ...fromManual, ...fromPlacements])]
}

function withRebuiltBlocks(
  draft: MappingWizardDraft,
  patch: Partial<MappingWizardDraft>,
): MappingWizardDraft {
  const next = { ...draft, ...patch }
  const keys = mappedKeysIncludingManual(next)
  next.componentBlocks = rebuildComponentBlocks(
    next.enabledComponentKinds,
    keys,
  )
  next.configStatus = deriveConfigStatus(draft, next)
  next.dirty = true
  return next
}

export function isStepAvailable(step: MappingWizardStepId): boolean {
  return MAPPING_WIZARD_STEPS.find((s) => s.id === step)?.unlocked ?? false
}

function updateField(
  fields: DetectedField[],
  fieldId: string,
  patch: Partial<DetectedField>,
): DetectedField[] {
  return fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f))
}

/** Keep draft.fields and analysis.aiAnalysis in sync after review actions. */
function withAiReviewPatch(
  draft: MappingWizardDraft,
  fieldId: string,
  fieldPatch: Partial<DetectedField>,
  aiStatus: 'suggested' | 'confirmed' | 'rejected',
  registryKey?: string | null,
): MappingWizardDraft {
  const fields = updateField(draft.fields, fieldId, fieldPatch)
  const prevAi = draft.analysis?.aiAnalysis
  const aiAnalysis = prevAi
    ? {
        ...prevAi,
        fields: prevAi.fields.map((f) =>
          f.id === fieldId
            ? {
                ...f,
                status: aiStatus,
                registryKey:
                  registryKey !== undefined ? registryKey : f.registryKey,
              }
            : f,
        ),
      }
    : (prevAi ?? null)

  const analysis = draft.analysis
    ? { ...draft.analysis, fields, aiAnalysis }
    : null

  return withRebuiltBlocks(draft, { fields, analysis })
}

function mergeOrder(
  preferred: DocumentComponentKind[],
): DocumentComponentKind[] {
  const seen = new Set<DocumentComponentKind>()
  const order: DocumentComponentKind[] = []
  for (const kind of [...preferred, ...DEFAULT_COMPONENT_ORDER]) {
    if (seen.has(kind)) continue
    seen.add(kind)
    order.push(kind)
  }
  return order
}

export function mappingWizardReducer(
  state: MappingWizardState,
  action: MappingWizardAction,
): MappingWizardState {
  switch (action.type) {
    case 'hydrate':
      return createInitialWizardState({
        templateId: action.templateId,
        templateVersionId: action.templateVersionId,
        sourceFileName: action.sourceFileName,
        sourceDocxPath: action.sourceDocxPath,
      })

    case 'set_step': {
      if (!isStepAvailable(action.step)) return state
      return { ...state, step: action.step }
    }

    case 'upload_start':
      return {
        ...state,
        uploadStatus: 'uploading',
        uploadError: null,
      }

    case 'upload_success': {
      const draft: MappingWizardDraft = {
        ...state.draft,
        templateVersionId: action.templateVersionId,
        sourceFileName: action.sourceFileName,
        sourceDocxPath: action.sourceDocxPath,
        analysis: null,
        fields: [],
        enabledComponentKinds: [],
        componentOrder: [...DEFAULT_COMPONENT_ORDER],
        componentBlocks: {},
        enabledClauseIds: [],
        enabledSuggestedClauseKeys: [],
        manualMappings: [],
        manualPlacements: [],
        configStatus: 'draft',
        dirty: true,
      }
      return {
        ...state,
        draft,
        sourceBytes: action.sourceBytes,
        selectedBlock: null,
        selectedFieldId: null,
        placementMode: false,
        pendingPlacement: null,
        uploadStatus: 'success',
        uploadError: null,
        analysisStatus: 'idle',
        analysisError: null,
        step: 'analysis',
      }
    }

    case 'upload_error':
      return {
        ...state,
        uploadStatus: 'error',
        uploadError: action.message,
      }

    case 'analysis_start':
      return {
        ...state,
        analysisStatus: 'running',
        analysisError: null,
      }

    case 'analysis_success': {
      const enabled = action.result.suggestedComponents.filter((k) =>
        DEFAULT_COMPONENT_ORDER.includes(k),
      )
      const questionnaireDraft = generateQuestionnaireDraft({
        fields: action.result.fields,
        ai: action.result.aiAnalysis,
        sourceText: action.result.sourceText,
        templateName: action.templateName ?? state.draft.sourceFileName,
      })
      const draft = withRebuiltBlocks(state.draft, {
        analysis: action.result,
        fields: action.result.fields,
        enabledComponentKinds: enabled,
        componentOrder: mergeOrder(enabled),
        enabledSuggestedClauseKeys: action.result.suggestedClauses.map(
          (c) => c.key,
        ),
        enabledClauseIds: [],
        questionnaireDraft,
      })
      return {
        ...state,
        draft,
        analysisStatus: 'success',
        analysisError: null,
      }
    }

    case 'analysis_error':
      return {
        ...state,
        analysisStatus: 'error',
        analysisError: action.message,
      }

    case 'set_fields':
      return {
        ...state,
        draft: withRebuiltBlocks(state.draft, { fields: action.fields }),
      }

    case 'map_field': {
      const mappedKey = action.mappedKey
      return {
        ...state,
        draft: withAiReviewPatch(
          state.draft,
          action.fieldId,
          {
            mappedKey,
            suggestedKey:
              mappedKey ??
              state.draft.fields.find((f) => f.id === action.fieldId)
                ?.suggestedKey ??
              null,
            status: mappedKey ? 'connected' : 'needs_configuration',
          },
          mappedKey ? 'confirmed' : 'suggested',
          mappedKey,
        ),
      }
    }

    case 'ignore_field': {
      return {
        ...state,
        draft: withAiReviewPatch(
          state.draft,
          action.fieldId,
          { status: 'ignored', mappedKey: null },
          'rejected',
        ),
      }
    }

    case 'accept_suggestion': {
      const current = state.draft.fields.find((f) => f.id === action.fieldId)
      if (!current?.suggestedKey) return state
      return {
        ...state,
        draft: withAiReviewPatch(
          state.draft,
          action.fieldId,
          {
            mappedKey: current.suggestedKey,
            status: 'connected',
          },
          'confirmed',
          current.suggestedKey,
        ),
      }
    }

    case 'select_field':
      return {
        ...state,
        selectedFieldId: action.fieldId,
      }

    case 'select_document_block':
      return {
        ...state,
        selectedBlock: action.block,
      }

    case 'clear_document_selection':
      return {
        ...state,
        selectedBlock: null,
      }

    case 'create_mapping': {
      const selected = state.selectedBlock
      if (!selected || !action.variableKey) return state

      const existingIdx = state.draft.manualMappings.findIndex(
        (m) => m.blockId === selected.blockId,
      )
      const mapping: ManualDocumentMapping = {
        id:
          existingIdx >= 0
            ? state.draft.manualMappings[existingIdx]!.id
            : `manual-${selected.blockId}-${Date.now()}`,
        blockId: selected.blockId,
        blockIndex: selected.blockIndex,
        selectedText: selected.selectedText,
        variableKey: action.variableKey,
        offsets: selected.offsets,
      }

      const manualMappings =
        existingIdx >= 0
          ? state.draft.manualMappings.map((m, i) =>
              i === existingIdx ? mapping : m,
            )
          : [...state.draft.manualMappings, mapping]

      return {
        ...state,
        draft: withRebuiltBlocks(state.draft, { manualMappings }),
        selectedBlock: selected,
      }
    }

    case 'remove_mapping': {
      const manualMappings = state.draft.manualMappings.filter(
        (m) => m.id !== action.mappingId,
      )
      return {
        ...state,
        draft: withRebuiltBlocks(state.draft, { manualMappings }),
      }
    }

    case 'start_field_placement':
      return {
        ...state,
        placementMode: true,
        pendingPlacement: null,
        selectedBlock: null,
      }

    case 'stop_field_placement':
      return {
        ...state,
        placementMode: false,
        pendingPlacement: null,
      }

    case 'place_field_pending':
      return {
        ...state,
        pendingPlacement: action.pending,
        selectedBlock: null,
      }

    case 'cancel_pending_placement':
      return {
        ...state,
        pendingPlacement: null,
      }

    case 'place_field': {
      const pending = state.pendingPlacement
      if (!pending || !action.variableKey) return state
      const placement: ManualDocumentPlacement = {
        id: `place-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        blockId: pending.blockId,
        position: pending.position,
        variableKey: action.variableKey,
      }
      return {
        ...state,
        draft: withRebuiltBlocks(state.draft, {
          manualPlacements: [...state.draft.manualPlacements, placement],
        }),
        pendingPlacement: null,
        // Stay in placement mode so user can drop multiple fields
        placementMode: true,
      }
    }

    case 'remove_field_placement': {
      const manualPlacements = state.draft.manualPlacements.filter(
        (p) => p.id !== action.placementId,
      )
      return {
        ...state,
        draft: withRebuiltBlocks(state.draft, { manualPlacements }),
      }
    }

    case 'update_field_placement': {
      const manualPlacements = state.draft.manualPlacements.map((p) =>
        p.id === action.placementId
          ? { ...p, variableKey: action.variableKey }
          : p,
      )
      return {
        ...state,
        draft: withRebuiltBlocks(state.draft, { manualPlacements }),
      }
    }

    case 'toggle_component': {
      const enabled = action.enabled
        ? [
            ...new Set([
              ...state.draft.enabledComponentKinds,
              action.kind,
            ]),
          ]
        : state.draft.enabledComponentKinds.filter((k) => k !== action.kind)
      const order = state.draft.componentOrder.includes(action.kind)
        ? state.draft.componentOrder
        : [...state.draft.componentOrder, action.kind]
      return {
        ...state,
        draft: withRebuiltBlocks(state.draft, {
          enabledComponentKinds: enabled,
          componentOrder: order,
        }),
      }
    }

    case 'reorder_components':
      return {
        ...state,
        draft: {
          ...state.draft,
          componentOrder: action.order,
          dirty: true,
        },
      }

    case 'move_component': {
      const order = [...state.draft.componentOrder]
      const idx = order.indexOf(action.kind)
      if (idx < 0) return state
      const swapWith = action.direction === 'up' ? idx - 1 : idx + 1
      if (swapWith < 0 || swapWith >= order.length) return state
      ;[order[idx], order[swapWith]] = [order[swapWith], order[idx]]
      return {
        ...state,
        draft: {
          ...state.draft,
          componentOrder: order,
          dirty: true,
        },
      }
    }

    case 'toggle_clause_id': {
      const enabled = action.enabled
        ? [...new Set([...state.draft.enabledClauseIds, action.clauseId])]
        : state.draft.enabledClauseIds.filter((id) => id !== action.clauseId)
      return {
        ...state,
        draft: {
          ...state.draft,
          enabledClauseIds: enabled,
          dirty: true,
        },
      }
    }

    case 'toggle_suggested_clause': {
      const enabled = action.enabled
        ? [
            ...new Set([
              ...state.draft.enabledSuggestedClauseKeys,
              action.key,
            ]),
          ]
        : state.draft.enabledSuggestedClauseKeys.filter(
            (k) => k !== action.key,
          )
      return {
        ...state,
        draft: {
          ...state.draft,
          enabledSuggestedClauseKeys: enabled,
          dirty: true,
        },
      }
    }

    case 'set_questionnaire_draft':
      return {
        ...state,
        draft: {
          ...state.draft,
          questionnaireDraft: action.draft,
          dirty: true,
        },
      }

    case 'update_draft_question': {
      const qDraft = state.draft.questionnaireDraft
      if (!qDraft) return state
      return {
        ...state,
        draft: {
          ...state.draft,
          dirty: true,
          questionnaireDraft: {
            ...qDraft,
            questions: qDraft.questions.map((q) =>
              q.id === action.questionId ? { ...q, ...action.patch } : q,
            ),
          },
        },
      }
    }

    case 'toggle_draft_question': {
      const qDraft = state.draft.questionnaireDraft
      if (!qDraft) return state
      return {
        ...state,
        draft: {
          ...state.draft,
          dirty: true,
          questionnaireDraft: {
            ...qDraft,
            questions: qDraft.questions.map((q) =>
              q.id === action.questionId
                ? { ...q, enabled: action.enabled }
                : q,
            ),
          },
        },
      }
    }

    case 'set_questionnaire_name': {
      const qDraft = state.draft.questionnaireDraft
      if (!qDraft) return state
      return {
        ...state,
        draft: {
          ...state.draft,
          dirty: true,
          questionnaireDraft: { ...qDraft, name: action.name },
        },
      }
    }

    case 'questionnaire_saved': {
      const qDraft = state.draft.questionnaireDraft
      if (!qDraft) return state
      return {
        ...state,
        draft: {
          ...state.draft,
          questionnaireDraft: {
            ...qDraft,
            savedFormId: action.formId,
            savedInstanceId: null,
            savedFormUrl: null,
          },
        },
      }
    }

    case 'mark_clean':
      return {
        ...state,
        draft: { ...state.draft, dirty: false },
      }

    default:
      return state
  }
}
