import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'
import type { DocumentComponentKind } from '@/types/documents'
import { documentStorage } from '@/lib/api/documents/storage'
import {
  activeAiDocumentAnalyzer,
  aiAnalysisToDetectedFields,
  getDocumentAiErrorMessage,
} from '@/features/documents/ai'
import {
  generateQuestionnaireDraft,
  type DraftQuestion,
} from '@/features/documents/questionnaire'
import { packageService } from '@/lib/api/packageService'
import { activeDocumentStructureExtractor } from '../extraction'
import {
  createInitialWizardState,
  isStepAvailable,
  mappingWizardReducer,
  type MappingWizardState,
} from './mappingWizardReducer'
import type {
  MappingWizardStepId,
  PendingFieldPlacement,
  SelectedDocumentBlock,
} from '../types'
import { DEFAULT_COMPONENT_ORDER } from '../composition/defaultComponentBlocks'

interface MappingWizardContextValue {
  state: MappingWizardState
  setStep: (step: MappingWizardStepId) => void
  goNext: () => void
  goBack: () => void
  runAnalysis: () => Promise<void>
  notifyUploadStart: () => void
  notifyUploadSuccess: (input: {
    templateVersionId: string
    sourceFileName: string
    sourceDocxPath: string | null
    sourceBytes: ArrayBuffer | null
  }) => void
  notifyUploadError: (message: string) => void
  mapField: (fieldId: string, mappedKey: string | null) => void
  ignoreField: (fieldId: string) => void
  acceptSuggestion: (fieldId: string) => void
  selectField: (fieldId: string | null) => void
  selectDocumentBlock: (block: SelectedDocumentBlock) => void
  clearDocumentSelection: () => void
  createMapping: (variableKey: string) => void
  removeMapping: (mappingId: string) => void
  markClean: () => void
  startFieldPlacement: () => void
  stopFieldPlacement: () => void
  placeFieldPending: (pending: PendingFieldPlacement) => void
  cancelPendingPlacement: () => void
  placeField: (variableKey: string) => void
  removeFieldPlacement: (placementId: string) => void
  updateFieldPlacement: (placementId: string, variableKey: string) => void
  toggleComponent: (kind: DocumentComponentKind, enabled: boolean) => void
  moveComponent: (
    kind: DocumentComponentKind,
    direction: 'up' | 'down',
  ) => void
  toggleClauseId: (clauseId: string, enabled: boolean) => void
  toggleSuggestedClause: (key: string, enabled: boolean) => void
  updateDraftQuestion: (
    questionId: string,
    patch: Partial<DraftQuestion>,
  ) => void
  toggleDraftQuestion: (questionId: string, enabled: boolean) => void
  setQuestionnaireName: (name: string) => void
  regenerateQuestionnaire: () => Promise<void>
  markQuestionnaireSaved: (formId: string) => void
  canGoNext: boolean
  canGoBack: boolean
}

const MappingWizardContext = createContext<MappingWizardContextValue | null>(
  null,
)

const UNLOCKED_ORDER: MappingWizardStepId[] = [
  'upload',
  'analysis',
  'questionnaire',
  'save',
]

export function MappingWizardProvider({
  templateId,
  templateVersionId,
  sourceFileName,
  sourceDocxPath,
  templateName,
  children,
}: {
  templateId: string
  templateVersionId: string | null
  sourceFileName: string | null
  sourceDocxPath: string | null
  templateName?: string | null
  children: ReactNode
}) {
  const [state, dispatch] = useReducer(
    mappingWizardReducer,
    {
      templateId,
      templateVersionId,
      sourceFileName,
      sourceDocxPath,
    },
    createInitialWizardState,
  )

  const setStep = useCallback((step: MappingWizardStepId) => {
    dispatch({ type: 'set_step', step })
  }, [])

  const goNext = useCallback(() => {
    const idx = UNLOCKED_ORDER.indexOf(state.step)
    const next = UNLOCKED_ORDER[idx + 1]
    if (next && isStepAvailable(next)) {
      dispatch({ type: 'set_step', step: next })
    }
  }, [state.step])

  const goBack = useCallback(() => {
    const idx = UNLOCKED_ORDER.indexOf(state.step)
    const prev = UNLOCKED_ORDER[idx - 1]
    if (prev) {
      dispatch({ type: 'set_step', step: prev })
    }
  }, [state.step])

  const runAnalysis = useCallback(async () => {
    dispatch({ type: 'analysis_start' })
    try {
      let bytes = state.sourceBytes
      if (!bytes) {
        const path = state.draft.sourceDocxPath
        if (!path) {
          throw new Error(
            'Brak pliku źródłowego. Prześlij dokument DOCX w poprzednim kroku.',
          )
        }
        bytes = await documentStorage.download(path)
      }

      const structure =
        await activeDocumentStructureExtractor.extractForFile(
          bytes,
          state.draft.sourceFileName,
        )
      const aiAnalysis = await activeAiDocumentAnalyzer.analyze({
        text: structure.plainText,
        structure,
      })

      const fields = aiAnalysisToDetectedFields(aiAnalysis, structure)
      const suggestedClauses = aiAnalysis.clauses.map((c) => ({
        key: c.type,
        title: c.title ?? c.type,
        body: '',
      }))

      dispatch({
        type: 'analysis_success',
        templateName: templateName ?? state.draft.sourceFileName,
        result: {
          analyzerVersion: aiAnalysis.analyzerVersion,
          sourceText: structure.plainText,
          structure,
          fields,
          suggestedComponents: [...DEFAULT_COMPONENT_ORDER],
          suggestedClauses,
          analyzedAt: aiAnalysis.analyzedAt,
          aiAnalysis,
        },
      })

      // Enrich draft with live studio packages (package Select, never free-text).
      try {
        const packages = await packageService.list({ activeOnly: true })
        const packageOptions = packages.map((p) => ({
          value: p.id,
          label: p.name,
        }))
        const questionnaireDraft = generateQuestionnaireDraft({
          fields,
          ai: aiAnalysis,
          sourceText: structure.plainText,
          templateName: templateName ?? state.draft.sourceFileName,
          packageOptions,
        })
        dispatch({ type: 'set_questionnaire_draft', draft: questionnaireDraft })
      } catch {
        // Keep draft from analysis_success without package options.
      }
    } catch (err) {
      dispatch({
        type: 'analysis_error',
        message: getDocumentAiErrorMessage(err),
      })
    }
  }, [state.draft, state.sourceBytes, templateName])

  const notifyUploadStart = useCallback(() => {
    dispatch({ type: 'upload_start' })
  }, [])

  const notifyUploadSuccess = useCallback(
    (input: {
      templateVersionId: string
      sourceFileName: string
      sourceDocxPath: string | null
      sourceBytes: ArrayBuffer | null
    }) => {
      dispatch({
        type: 'upload_success',
        ...input,
      })
    },
    [],
  )

  const notifyUploadError = useCallback((message: string) => {
    dispatch({ type: 'upload_error', message })
  }, [])

  const mapField = useCallback((fieldId: string, mappedKey: string | null) => {
    dispatch({ type: 'map_field', fieldId, mappedKey })
  }, [])

  const ignoreField = useCallback((fieldId: string) => {
    dispatch({ type: 'ignore_field', fieldId })
  }, [])

  const acceptSuggestion = useCallback((fieldId: string) => {
    dispatch({ type: 'accept_suggestion', fieldId })
  }, [])

  const selectField = useCallback((fieldId: string | null) => {
    dispatch({ type: 'select_field', fieldId })
  }, [])

  const selectDocumentBlock = useCallback((block: SelectedDocumentBlock) => {
    dispatch({ type: 'select_document_block', block })
  }, [])

  const clearDocumentSelection = useCallback(() => {
    dispatch({ type: 'clear_document_selection' })
  }, [])

  const createMapping = useCallback((variableKey: string) => {
    dispatch({ type: 'create_mapping', variableKey })
  }, [])

  const removeMapping = useCallback((mappingId: string) => {
    dispatch({ type: 'remove_mapping', mappingId })
  }, [])

  const startFieldPlacement = useCallback(() => {
    dispatch({ type: 'start_field_placement' })
  }, [])

  const stopFieldPlacement = useCallback(() => {
    dispatch({ type: 'stop_field_placement' })
  }, [])

  const placeFieldPending = useCallback((pending: PendingFieldPlacement) => {
    dispatch({ type: 'place_field_pending', pending })
  }, [])

  const cancelPendingPlacement = useCallback(() => {
    dispatch({ type: 'cancel_pending_placement' })
  }, [])

  const placeField = useCallback((variableKey: string) => {
    dispatch({ type: 'place_field', variableKey })
  }, [])

  const removeFieldPlacement = useCallback((placementId: string) => {
    dispatch({ type: 'remove_field_placement', placementId })
  }, [])

  const updateFieldPlacement = useCallback(
    (placementId: string, variableKey: string) => {
      dispatch({ type: 'update_field_placement', placementId, variableKey })
    },
    [],
  )

  const toggleComponent = useCallback(
    (kind: DocumentComponentKind, enabled: boolean) => {
      dispatch({ type: 'toggle_component', kind, enabled })
    },
    [],
  )

  const moveComponent = useCallback(
    (kind: DocumentComponentKind, direction: 'up' | 'down') => {
      dispatch({ type: 'move_component', kind, direction })
    },
    [],
  )

  const toggleClauseId = useCallback((clauseId: string, enabled: boolean) => {
    dispatch({ type: 'toggle_clause_id', clauseId, enabled })
  }, [])

  const toggleSuggestedClause = useCallback(
    (key: string, enabled: boolean) => {
      dispatch({ type: 'toggle_suggested_clause', key, enabled })
    },
    [],
  )

  const updateDraftQuestion = useCallback(
    (questionId: string, patch: Partial<DraftQuestion>) => {
      dispatch({ type: 'update_draft_question', questionId, patch })
    },
    [],
  )

  const toggleDraftQuestion = useCallback(
    (questionId: string, enabled: boolean) => {
      dispatch({ type: 'toggle_draft_question', questionId, enabled })
    },
    [],
  )

  const setQuestionnaireName = useCallback((name: string) => {
    dispatch({ type: 'set_questionnaire_name', name })
  }, [])

  const regenerateQuestionnaire = useCallback(async () => {
    let packageOptions: { value: string; label: string }[] = []
    try {
      const packages = await packageService.list({ activeOnly: true })
      packageOptions = packages.map((p) => ({
        value: p.id,
        label: p.name,
      }))
    } catch {
      packageOptions = []
    }
    const next = generateQuestionnaireDraft({
      fields: state.draft.fields,
      ai: state.draft.analysis?.aiAnalysis,
      sourceText: state.draft.analysis?.sourceText,
      templateName: templateName ?? state.draft.sourceFileName,
      packageOptions,
    })
    dispatch({ type: 'set_questionnaire_draft', draft: next })
  }, [state.draft, templateName])

  const markQuestionnaireSaved = useCallback((formId: string) => {
    dispatch({ type: 'questionnaire_saved', formId })
  }, [])

  const canGoBack = UNLOCKED_ORDER.indexOf(state.step) > 0
  const canGoNext =
    state.step === 'upload'
      ? Boolean(state.draft.sourceFileName || state.draft.sourceDocxPath) &&
        state.uploadStatus !== 'uploading'
      : state.step === 'analysis'
        ? state.analysisStatus === 'success'
        : state.step === 'questionnaire'
          ? Boolean(state.draft.questionnaireDraft)
          : false

  const markClean = useCallback(() => {
    dispatch({ type: 'mark_clean' })
  }, [])

  const value = useMemo(
    () => ({
      state,
      setStep,
      goNext,
      goBack,
      runAnalysis,
      notifyUploadStart,
      notifyUploadSuccess,
      notifyUploadError,
      mapField,
      ignoreField,
      acceptSuggestion,
      selectField,
      selectDocumentBlock,
      clearDocumentSelection,
      createMapping,
      removeMapping,
      markClean,
      startFieldPlacement,
      stopFieldPlacement,
      placeFieldPending,
      cancelPendingPlacement,
      placeField,
      removeFieldPlacement,
      updateFieldPlacement,
      toggleComponent,
      moveComponent,
      toggleClauseId,
      toggleSuggestedClause,
      updateDraftQuestion,
      toggleDraftQuestion,
      setQuestionnaireName,
      regenerateQuestionnaire,
      markQuestionnaireSaved,
      canGoNext,
      canGoBack,
    }),
    [
      state,
      setStep,
      goNext,
      goBack,
      runAnalysis,
      notifyUploadStart,
      notifyUploadSuccess,
      notifyUploadError,
      mapField,
      ignoreField,
      acceptSuggestion,
      selectField,
      selectDocumentBlock,
      clearDocumentSelection,
      createMapping,
      removeMapping,
      markClean,
      startFieldPlacement,
      stopFieldPlacement,
      placeFieldPending,
      cancelPendingPlacement,
      placeField,
      removeFieldPlacement,
      updateFieldPlacement,
      toggleComponent,
      moveComponent,
      toggleClauseId,
      toggleSuggestedClause,
      updateDraftQuestion,
      toggleDraftQuestion,
      setQuestionnaireName,
      regenerateQuestionnaire,
      markQuestionnaireSaved,
      canGoNext,
      canGoBack,
    ],
  )

  return (
    <MappingWizardContext.Provider value={value}>
      {children}
    </MappingWizardContext.Provider>
  )
}

export function useMappingWizard(): MappingWizardContextValue {
  const ctx = useContext(MappingWizardContext)
  if (!ctx) {
    throw new Error(
      'useMappingWizard must be used within MappingWizardProvider',
    )
  }
  return ctx
}
