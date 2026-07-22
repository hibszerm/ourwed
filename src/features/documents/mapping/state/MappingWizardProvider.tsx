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
import { activeDocumentAnalyzer } from '../analysis'
import { activeDocumentStructureExtractor } from '../extraction'
import {
  suggestDocumentFields,
  suggestionsToDetectedFields,
} from '../suggestions'
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
  selectDocumentBlock: (block: SelectedDocumentBlock) => void
  clearDocumentSelection: () => void
  createMapping: (variableKey: string) => void
  removeMapping: (mappingId: string) => void
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
  canGoNext: boolean
  canGoBack: boolean
}

const MappingWizardContext = createContext<MappingWizardContextValue | null>(
  null,
)

const UNLOCKED_ORDER: MappingWizardStepId[] = [
  'upload',
  'analysis',
  'mapping',
  'components',
  'clauses',
]

export function MappingWizardProvider({
  templateId,
  templateVersionId,
  sourceFileName,
  sourceDocxPath,
  children,
}: {
  templateId: string
  templateVersionId: string | null
  sourceFileName: string | null
  sourceDocxPath: string | null
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

      const structure = await activeDocumentStructureExtractor.extract(bytes)
      const result = await activeDocumentAnalyzer.analyze({
        sourceText: structure.plainText,
        templateId: state.draft.templateId,
        templateVersionId: state.draft.templateVersionId,
        sourceFileName: state.draft.sourceFileName,
      })

      const placeholders = result.fields
      const occupied = placeholders
        .filter((f) => f.offsets)
        .map((f) => f.offsets!)
      const heuristic = suggestionsToDetectedFields(
        suggestDocumentFields({
          plainText: structure.plainText,
          structure,
          occupiedRanges: occupied,
        }),
      )

      dispatch({
        type: 'analysis_success',
        result: {
          ...result,
          sourceText: structure.plainText,
          structure,
          fields: [...placeholders, ...heuristic],
        },
      })
    } catch (err) {
      dispatch({
        type: 'analysis_error',
        message:
          err instanceof Error
            ? err.message
            : 'Nie udało się przeanalizować dokumentu.',
      })
    }
  }, [state.draft, state.sourceBytes])

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

  const canGoBack = UNLOCKED_ORDER.indexOf(state.step) > 0
  const canGoNext =
    state.step === 'upload'
      ? Boolean(state.draft.sourceFileName || state.draft.sourceDocxPath) &&
        state.uploadStatus !== 'uploading'
      : state.step === 'analysis'
        ? state.analysisStatus === 'success'
        : state.step === 'mapping' ||
            state.step === 'components' ||
            state.step === 'clauses'
          ? true
          : false

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
      selectDocumentBlock,
      clearDocumentSelection,
      createMapping,
      removeMapping,
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
      selectDocumentBlock,
      clearDocumentSelection,
      createMapping,
      removeMapping,
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

export function useMappingWizard() {
  const ctx = useContext(MappingWizardContext)
  if (!ctx) {
    throw new Error('useMappingWizard must be used within MappingWizardProvider')
  }
  return ctx
}
