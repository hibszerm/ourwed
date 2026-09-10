/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { invalidateFinanceQueries } from '@/features/finance/invalidateFinanceQueries'
import { useWedding } from '@/features/weddings/hooks/useWedding'
import type { WeddingHeroAction } from '@/features/weddings/detail/weddingHeroActions'
import {
  isLocationEditorSection,
  type WeddingEditorSection,
} from '@/features/weddings/detail/weddingEditorTypes'
import type { WeddingDetailSharedProps } from '@/features/weddings/detail/v2/weddingDetailV2Types'
import {
  createWeddingEditDraft,
  persistWeddingEditDraft,
  type WeddingEditDraft,
  type WeddingEditSnapshot,
} from '@/features/weddings/edit/persistWeddingEditDraft'
import { contactService } from '@/lib/api/contactService'
import { taskService } from '@/lib/api/taskService'
import { weddingTasksQueryKey } from '@/features/tasks/tasksQueryKeys'
import { weddingExtraServiceService } from '@/lib/api/weddingExtraServiceService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingService } from '@/lib/api/weddingService'
import { applyWeddingPlaces } from '@/lib/api/weddings/weddingHydrate'
import { isClientContractCollectionComplete } from '@/lib/utils/weddingContractReadiness'
import {
  validateContractGeneration,
  type ContractGenerationValidation,
  type MissingDataCorrectionKind,
} from '@/lib/utils/validateContractGeneration'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import type { Payment, Wedding } from '@/types/wedding'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

export type WeddingDetailModalState =
  | { type: 'payment'; asDeposit: boolean; payment?: Payment }
  | { type: 'note' }
  | { type: 'contract' }
  | { type: 'missing_contract_data' }
  | { type: 'client_collection' }
  | { type: 'travel_fee' }
  | null

/**
 * Shared Wedding Detail host — queries, edit draft, and mutations.
 * Classic and Modern pages both consume this; presentation stays page-local.
 */
export function useWeddingDetailHost() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const userId = useStudioAuthId()
  const { requirePro } = useProAccessGate()
  const { data: wedding, isLoading, isError, error, refetch } = useWedding(id ?? '')

  const { data: weddingTasks = [] } = useQuery({
    queryKey: weddingTasksQueryKey(userId, id ?? ''),
    queryFn: () => taskService.listByWeddingId(id!),
    enabled: Boolean(userId && id),
  })

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', userId, id],
    queryFn: () => contactService.listByWeddingId(id!),
    enabled: Boolean(userId && id),
  })

  const { data: extras = [] } = useQuery({
    queryKey: ['wedding-extras', userId, id],
    queryFn: () => weddingExtraServiceService.listByWeddingId(id!),
    enabled: Boolean(userId && id),
  })

  const [modal, setModal] = useState<WeddingDetailModalState>(null)
  const [missingValidation, setMissingValidation] =
    useState<ContractGenerationValidation | null>(null)
  const [generateGuardBusy, setGenerateGuardBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editorSection, setEditorSection] =
    useState<WeddingEditorSection>(null)
  const [draft, setDraft] = useState<WeddingEditDraft | null>(null)
  const [baseline, setBaseline] = useState<WeddingEditSnapshot | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  /** After checklist → section editor, reopen checklist when that editor closes. */
  const [resumeClientCollection, setResumeClientCollection] = useState(false)

  useEffect(() => {
    setModal(null)
    setMissingValidation(null)
    setGenerateGuardBusy(false)
    setEditing(false)
    setEditorSection(null)
    setDraft(null)
    setBaseline(null)
    setSaving(false)
    setSaveError(null)
    setDiscardOpen(false)
    setResumeClientCollection(false)
  }, [userId, id])

  const snapshot = useMemo<WeddingEditSnapshot | null>(() => {
    if (!wedding) return null
    return {
      wedding,
      contacts,
      extras,
      tasks: weddingTasks,
    }
  }, [wedding, contacts, extras, weddingTasks])

  useEffect(() => {
    if (!editing) setDraft(null)
  }, [editing])

  const view = editing && draft ? draft.wedding : wedding
  const viewPayments = editing && draft ? draft.payments : wedding?.payments
  const viewNotes = editing && draft ? draft.notes : wedding?.notes
  const viewTasks = editing && draft ? draft.tasks : weddingTasks
  const viewContacts = editing && draft ? draft.contacts : contacts
  const viewExtras = editing && draft ? draft.extras : extras

  function isDraftDirty(): boolean {
    if (!draft || !baseline) return false
    if (isLocationEditorSection(editorSection)) return false
    const fresh = createWeddingEditDraft(baseline)
    return JSON.stringify(draft) !== JSON.stringify(fresh)
  }

  function beginEdit(section: WeddingEditorSection = null) {
    if (!snapshot) return
    requirePro(() => {
      const next = createWeddingEditDraft(snapshot)
      setBaseline(snapshot)
      setDraft(next)
      setSaveError(null)
      setDiscardOpen(false)
      setEditorSection(section ?? 'contacts')
      setEditing(true)
    })
  }

  function openEditor(section: WeddingEditorSection) {
    if (editing) {
      setEditorSection(section)
      return
    }
    beginEdit(section)
  }

  function openClientCollectionChecklist() {
    requirePro(() => {
      setResumeClientCollection(false)
      setModal({ type: 'client_collection' })
    })
  }

  function openClientCollectionSection(
    section: Extract<
      WeddingEditorSection,
      'contacts' | 'wedding' | 'locations'
    >,
  ) {
    setModal(null)
    setResumeClientCollection(true)
    openEditor(section)
  }

  async function resumeClientCollectionIfNeeded(
    weddingId: string,
    shouldResume: boolean,
  ) {
    if (!shouldResume || !userId) return
    try {
      const [fresh, places] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: ['weddings', userId, weddingId],
          queryFn: () => weddingService.getById(weddingId),
        }),
        queryClient.fetchQuery({
          queryKey: ['wedding-places', userId, weddingId],
          queryFn: () => weddingPlaceService.listByWeddingId(weddingId),
        }),
      ])
      if (!fresh) return
      const hydrated = applyWeddingPlaces(fresh, places)
      if (!isClientContractCollectionComplete(hydrated)) {
        setModal({ type: 'client_collection' })
      }
    } catch {
      // Editor already closed; checklist resume is best-effort.
    }
  }

  function beginEditLocations() {
    beginEdit('locations')
  }

  function cancelEdit() {
    const weddingId = wedding?.id
    const shouldResume = resumeClientCollection
    setResumeClientCollection(false)
    setEditing(false)
    setEditorSection(null)
    setDraft(null)
    setBaseline(null)
    setSaveError(null)
    setDiscardOpen(false)
    if (weddingId) {
      void resumeClientCollectionIfNeeded(weddingId, shouldResume)
    }
  }

  function requestCancelEdit() {
    if (saving) return
    if (isDraftDirty()) {
      setDiscardOpen(true)
      return
    }
    cancelEdit()
  }

  function patchWedding(patch: Partial<Wedding>) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            wedding: { ...prev.wedding, ...patch },
          }
        : prev,
    )
  }

  async function saveEdit() {
    if (!draft || !baseline) return
    const allowed = requirePro()
    if (!allowed) return
    const weddingId = draft.wedding.id
    const shouldResume = resumeClientCollection
    setSaving(true)
    setSaveError(null)
    try {
      await persistWeddingEditDraft(baseline, draft)
      setEditing(false)
      setEditorSection(null)
      setDraft(null)
      setBaseline(null)
      setResumeClientCollection(false)
      await queryClient.invalidateQueries({ queryKey: ['weddings'] })
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
      await queryClient.invalidateQueries({ queryKey: ['contacts'] })
      await queryClient.invalidateQueries({ queryKey: ['wedding-extras'] })
      await queryClient.invalidateQueries({ queryKey: ['travel-plan'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      await invalidateFinanceQueries(queryClient)
      showToast('Zmiany zostały zapisane.', 'success')
      await resumeClientCollectionIfNeeded(weddingId, shouldResume)
    } catch (err) {
      setSaveError(
        getUserFacingErrorMessage(err, 'Nie udało się zapisać zmian.'),
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateContract() {
    if (!wedding || editing || generateGuardBusy) return
    const allowed = requirePro()
    if (!allowed) return
    setGenerateGuardBusy(true)
    setMissingValidation(null)
    try {
      const validation = validateContractGeneration(wedding)
      if (!validation.isReady) {
        setMissingValidation(validation)
        setModal({ type: 'missing_contract_data' })
        return
      }
      navigate(`/sluby/${wedding.id}/umowy/nowa`)
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się sprawdzić danych do umowy.'),
        'error',
      )
    } finally {
      setGenerateGuardBusy(false)
    }
  }

  function handleMissingDataCorrection(kind: MissingDataCorrectionKind) {
    setModal(null)
    setMissingValidation(null)
    switch (kind) {
      case 'company_settings':
        navigate('/ustawienia/firma')
        break
      case 'edit_payments':
        setModal({ type: 'payment', asDeposit: true })
        break
      case 'edit_couple':
        openEditor('contacts')
        break
      case 'edit_package':
        openEditor('package')
        break
      case 'edit_travel_fee':
        setModal({ type: 'travel_fee' })
        break
      case 'multi':
        openEditor('wedding')
        break
    }
  }

  async function handleTravelFeeSaved(next: Wedding) {
    if (!userId) return
    queryClient.setQueryData(['weddings', userId, next.id], next)
    await queryClient.invalidateQueries({ queryKey: ['weddings'] })
    await invalidateFinanceQueries(queryClient)
    setModal(null)
    showToast('Koszt dojazdu został zapisany.', 'success')
  }

  function handleHeroAction(action: WeddingHeroAction) {
    if (editing || !wedding) return
    requirePro(() => {
      switch (action) {
        case 'generate_contract':
          void handleGenerateContract()
          break
        case 'add_payment':
          setModal({ type: 'payment', asDeposit: false })
          break
        case 'add_deposit':
          setModal({ type: 'payment', asDeposit: true })
          break
        case 'add_note':
          setModal({ type: 'note' })
          break
      }
    })
  }

  function closeModal() {
    setModal(null)
  }

  const sharedProps: WeddingDetailSharedProps | null =
    wedding && snapshot && view && viewPayments && viewNotes
      ? {
          wedding: view,
          payments: viewPayments,
          notes: viewNotes,
          tasks: viewTasks,
          contacts: viewContacts,
          extras: viewExtras,
          editing,
          editorSection,
          packageBasePrice: draft?.packageBasePrice,
          onChangeWedding: patchWedding,
          onChangePayments: (payments) =>
            setDraft((prev) => (prev ? { ...prev, payments } : prev)),
          onChangeNotes: (notes) =>
            setDraft((prev) => (prev ? { ...prev, notes } : prev)),
          onChangeTasks: (tasks) =>
            setDraft((prev) => (prev ? { ...prev, tasks } : prev)),
          onChangeContacts: (next) =>
            setDraft((prev) => (prev ? { ...prev, contacts: next } : prev)),
          onChangeExtras: (next) =>
            setDraft((prev) => (prev ? { ...prev, extras: next } : prev)),
          onChangePackageBasePrice: (price) =>
            setDraft((prev) => (prev ? { ...prev, packageBasePrice: price } : prev)),
          onHeroAction: handleHeroAction,
          onRequestVerifyLocations: beginEditLocations,
          onEditSection: openEditor,
          onOpenClientCollectionChecklist: openClientCollectionChecklist,
          onEditPayment: editing
            ? undefined
            : (payment: Payment) =>
                requirePro(() =>
                  setModal({
                    type: 'payment',
                    asDeposit: payment.type === 'deposit',
                    payment,
                  }),
                ),
          onSaveEdit: () => void saveEdit(),
          onCancelEdit: requestCancelEdit,
          saving,
          saveError,
          onAddNote: editing
            ? undefined
            : () => requirePro(() => setModal({ type: 'note' })),
          onArchive: async () => {
            const allowed = requirePro()
            if (!allowed) return
            await weddingService.archive(wedding.id)
            await queryClient.invalidateQueries({ queryKey: ['weddings'] })
            await invalidateFinanceQueries(queryClient)
            showToast('Ślub został zarchiwizowany.', 'success')
          },
          onDelete: async () => {
            const allowed = requirePro()
            if (!allowed) return
            await weddingService.delete(wedding.id)
            await queryClient.invalidateQueries({ queryKey: ['weddings'] })
            await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            await invalidateFinanceQueries(queryClient)
            showToast('Ślub został usunięty.', 'success')
            navigate('/sluby')
          },
          onWeddingRefreshed: () => {
            showToast('Zlecenie zostało zaktualizowane.', 'success')
          },
        }
      : null

  return {
    id,
    wedding,
    extras,
    isLoading,
    isError,
    error,
    refetch,
    snapshot,
    sharedProps,
    modal,
    missingValidation,
    discardOpen,
    setDiscardOpen,
    cancelEdit,
    closeModal,
    handleMissingDataCorrection,
    handleTravelFeeSaved,
    openClientCollectionSection,
  }
}
