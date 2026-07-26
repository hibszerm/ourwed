/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import { IconArrowLeft } from '@/components/icons'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { useWedding } from '@/features/weddings/hooks/useWedding'
import type { WeddingHeroAction } from '@/features/weddings/detail/weddingHeroActions'
import { WeddingDetailV1 } from '@/features/weddings/detail/v1/WeddingDetailV1'
import { WeddingDetailV2 } from '@/features/weddings/detail/v2/WeddingDetailV2'
import { WeddingDetailViewSwitch } from '@/features/weddings/detail/WeddingDetailViewSwitch'
import { useWeddingDetailViewMode } from '@/features/weddings/detail/useWeddingDetailViewMode'
import { SendQuestionnaireModal } from '@/features/weddings/actions/SendQuestionnaireModal'
import { AddPaymentModal } from '@/features/weddings/actions/AddPaymentModal'
import { AddNoteModal } from '@/features/weddings/actions/AddNoteModal'
import { GenerateContractModal } from '@/features/weddings/actions/GenerateContractModal'
import { MissingContractDataDialog } from '@/features/weddings/actions/MissingContractDataDialog'
import { DiscardChangesDialog } from '@/features/weddings/detail/editing/DiscardChangesDialog'
import {
  isLocationEditorSection,
  type WeddingEditorSection,
} from '@/features/weddings/detail/weddingEditorTypes'
import {
  createWeddingEditDraft,
  persistWeddingEditDraft,
  type WeddingEditDraft,
  type WeddingEditSnapshot,
} from '@/features/weddings/edit/persistWeddingEditDraft'
import editStyles from '@/features/weddings/edit/WeddingEdit.module.css'
import { companyDetailsService } from '@/lib/api/companyDetailsService'
import { contactService } from '@/lib/api/contactService'
import { taskService } from '@/lib/api/taskService'
import { weddingExtraServiceService } from '@/lib/api/weddingExtraServiceService'
import { weddingService } from '@/lib/api/weddingService'
import { isWeddingQuestionnaireComplete } from '@/lib/utils/questionnaires'
import {
  validateContractGeneration,
  type ContractGenerationValidation,
  type MissingDataCorrectionKind,
} from '@/lib/utils/validateContractGeneration'
import { isSectionVisible } from '@/lib/utils/workflow'
import type { QuestionnaireKind } from '@/lib/api/weddingActionsService'
import styles from './WeddingDetailPage.module.css'

type ModalState =
  | { type: 'questionnaire'; kind: QuestionnaireKind }
  | { type: 'payment'; asDeposit: boolean }
  | { type: 'note' }
  | { type: 'contract' }
  | { type: 'missing_contract_data' }
  | null

export function WeddingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const userId = useStudioAuthId()
  const { viewMode, setViewMode } = useWeddingDetailViewMode()
  const { data: wedding, isLoading, isError, error, refetch } = useWedding(id ?? '')

  const { data: weddingTasks = [] } = useQuery({
    queryKey: ['tasks', userId, id],
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

  const [modal, setModal] = useState<ModalState>(null)
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

  if (isLoading) {
    return (
      <AppLayout>
        <PageContainer>
          <div className={styles.loading}>Ładowanie szczegółów ślubu...</div>
        </PageContainer>
      </AppLayout>
    )
  }

  if (isError) {
    return (
      <AppLayout title="Błąd">
        <PageContainer>
          <p className={styles.notFound}>
            {error instanceof Error
              ? error.message
              : 'Nie udało się załadować ślubu.'}
          </p>
          <Button type="button" variant="secondary" onClick={() => void refetch()}>
            Spróbuj ponownie
          </Button>
        </PageContainer>
      </AppLayout>
    )
  }

  if (!wedding || !snapshot) {
    return (
      <AppLayout title="Nie znaleziono">
        <PageContainer>
          <p className={styles.notFound}>Ślub o podanym identyfikatorze nie istnieje.</p>
          <Link to="/sluby">
            <Button variant="secondary">Wróć do listy</Button>
          </Link>
        </PageContainer>
      </AppLayout>
    )
  }

  const view = editing && draft ? draft.wedding : wedding
  const viewPayments = editing && draft ? draft.payments : wedding.payments
  const viewNotes = editing && draft ? draft.notes : wedding.notes
  const viewTasks = editing && draft ? draft.tasks : weddingTasks
  const viewContacts = editing && draft ? draft.contacts : contacts
  const viewExtras = editing && draft ? draft.extras : extras

  const stage = view.workflowStage
  const showSchedule = isWeddingQuestionnaireComplete(view.questionnaires)
  const showEquipment = isSectionVisible(stage, 'equipment')
  const showDeliverables = isSectionVisible(stage, 'deliverables')

  function isDraftDirty(): boolean {
    if (!draft || !baseline) return false
    if (isLocationEditorSection(editorSection)) return false
    const fresh = createWeddingEditDraft(baseline)
    return JSON.stringify(draft) !== JSON.stringify(fresh)
  }

  function beginEdit(section: WeddingEditorSection = null) {
    const next = createWeddingEditDraft(snapshot!)
    setBaseline(snapshot!)
    setDraft(next)
    setSaveError(null)
    setDiscardOpen(false)
    setEditorSection(
      viewMode === 'v2' && section == null ? 'contacts' : section,
    )
    setEditing(true)
    if (section && viewMode === 'v1') {
      window.requestAnimationFrame(() => {
        const scrollId = isLocationEditorSection(section)
          ? 'wedding-locations'
          : undefined
        if (scrollId) {
          document
            .getElementById(scrollId)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      })
    }
  }

  function openEditor(section: WeddingEditorSection) {
    if (editing) {
      setEditorSection(section)
      return
    }
    beginEdit(section)
  }

  function beginEditLocations() {
    beginEdit('locations')
  }

  function cancelEdit() {
    setEditing(false)
    setEditorSection(null)
    setDraft(null)
    setBaseline(null)
    setSaveError(null)
    setDiscardOpen(false)
  }

  function requestCancelEdit() {
    if (saving) return
    if (isDraftDirty()) {
      setDiscardOpen(true)
      return
    }
    cancelEdit()
  }

  function patchWedding(patch: Partial<typeof view>) {
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
    setSaving(true)
    setSaveError(null)
    try {
      await persistWeddingEditDraft(baseline, draft)
      setEditing(false)
      setEditorSection(null)
      setDraft(null)
      setBaseline(null)
      await queryClient.invalidateQueries({ queryKey: ['weddings'] })
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
      await queryClient.invalidateQueries({ queryKey: ['contacts'] })
      await queryClient.invalidateQueries({ queryKey: ['wedding-extras'] })
      await queryClient.invalidateQueries({ queryKey: ['travel-plan'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      showToast('Zmiany zostały zapisane.', 'success')
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Nie udało się zapisać zmian.',
      )
    } finally {
      setSaving(false)
    }
  }

  /**
   * Shared generation guard for V1 / V2 (workspace).
   * Re-validates on every click — never reuses a previous result.
   */
  async function handleGenerateContract() {
    if (!wedding || editing || generateGuardBusy) return
    setGenerateGuardBusy(true)
    setMissingValidation(null)
    try {
      const company = await queryClient.fetchQuery({
        queryKey: ['company-details', userId],
        queryFn: () => companyDetailsService.get(),
      })
      const validation = validateContractGeneration(wedding, company)
      if (!validation.isReady) {
        setMissingValidation(validation)
        setModal({ type: 'missing_contract_data' })
        return
      }
      navigate(`/sluby/${wedding.id}/umowy/nowa`)
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : 'Nie udało się sprawdzić danych do umowy.',
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
      case 'multi':
        openEditor('wedding')
        break
    }
  }

  function handleHeroAction(action: WeddingHeroAction) {
    if (editing) return
    switch (action) {
      case 'send_contract_questionnaire':
        setModal({ type: 'questionnaire', kind: 'contractData' })
        break
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
  }

  function closeModal() {
    setModal(null)
  }

  const sharedProps = {
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
    onChangePayments: (payments: typeof viewPayments) =>
      setDraft((prev) => (prev ? { ...prev, payments } : prev)),
    onChangeNotes: (notes: typeof viewNotes) =>
      setDraft((prev) => (prev ? { ...prev, notes } : prev)),
    onChangeTasks: (tasks: typeof viewTasks) =>
      setDraft((prev) => (prev ? { ...prev, tasks } : prev)),
    onChangeContacts: (next: typeof viewContacts) =>
      setDraft((prev) => (prev ? { ...prev, contacts: next } : prev)),
    onChangeExtras: (next: typeof viewExtras) =>
      setDraft((prev) => (prev ? { ...prev, extras: next } : prev)),
    onChangePackageBasePrice: (price: number) =>
      setDraft((prev) => (prev ? { ...prev, packageBasePrice: price } : prev)),
    onHeroAction: handleHeroAction,
    onRequestVerifyLocations: beginEditLocations,
    onEditSection: openEditor,
    onSaveEdit: () => void saveEdit(),
    onCancelEdit: requestCancelEdit,
    saving,
    saveError,
    onAddNote: editing ? undefined : () => setModal({ type: 'note' }),
    onSendQuestionnaire: editing
      ? undefined
      : (kind: QuestionnaireKind) => setModal({ type: 'questionnaire', kind }),
    onArchive: async () => {
      await weddingService.archive(wedding.id)
      await queryClient.invalidateQueries({ queryKey: ['weddings'] })
      showToast('Ślub został zarchiwizowany.', 'success')
    },
    onDelete: async () => {
      await weddingService.delete(wedding.id)
      await queryClient.invalidateQueries({ queryKey: ['weddings'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      showToast('Ślub został usunięty.', 'success')
      navigate('/sluby')
    },
    showSchedule,
    showEquipment,
    showDeliverables,
  }

  return (
    <AppLayout
      action={
        <div className={editStyles.toolbar}>
          {editing && viewMode === 'v1' ? (
            <>
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={requestCancelEdit}
              >
                Anuluj
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={saving}
                onClick={() => void saveEdit()}
              >
                {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
              </Button>
            </>
          ) : !editing ? (
            <>
              <Button type="button" variant="primary" onClick={() => beginEdit()}>
                Edytuj ślub
              </Button>
              <Link to="/sluby">
                <Button variant="ghost">
                  <IconArrowLeft />
                  Wróć do listy
                </Button>
              </Link>
            </>
          ) : null}
        </div>
      }
    >
      <PageContainer>
        <div className={styles.toolbarRow}>
          <WeddingDetailViewSwitch value={viewMode} onChange={setViewMode} />
        </div>

        {editing && viewMode === 'v1' ? (
          <div className={editStyles.editBanner}>
            <p className={editStyles.editBannerText}>
              Tryb edycji — zmiany zapiszą się dopiero po kliknięciu „Zapisz
              zmiany”.
            </p>
            {saveError ? (
              <p className={editStyles.dangerText}>{saveError}</p>
            ) : null}
          </div>
        ) : null}

        {viewMode === 'v1' ? (
          <WeddingDetailV1 {...sharedProps} />
        ) : (
          <WeddingDetailV2 {...sharedProps} />
        )}
      </PageContainer>

      <DiscardChangesDialog
        open={discardOpen}
        onStay={() => setDiscardOpen(false)}
        onDiscard={cancelEdit}
      />

      <SendQuestionnaireModal
        open={modal?.type === 'questionnaire'}
        onClose={closeModal}
        wedding={wedding}
        kind={modal?.type === 'questionnaire' ? modal.kind : 'contractData'}
      />
      <AddPaymentModal
        open={modal?.type === 'payment'}
        onClose={closeModal}
        wedding={wedding}
        asDeposit={modal?.type === 'payment' ? modal.asDeposit : false}
      />
      <AddNoteModal
        open={modal?.type === 'note'}
        onClose={closeModal}
        wedding={wedding}
      />
      <GenerateContractModal
        open={modal?.type === 'contract'}
        onClose={closeModal}
        wedding={wedding}
      />
      <MissingContractDataDialog
        open={modal?.type === 'missing_contract_data'}
        validation={missingValidation}
        onClose={closeModal}
        onCorrect={handleMissingDataCorrection}
      />
    </AppLayout>
  )
}
