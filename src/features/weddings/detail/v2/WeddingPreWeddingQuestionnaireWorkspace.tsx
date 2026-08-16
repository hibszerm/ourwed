import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import {
  weddingQuestionnaireService,
  questionnaireTemplateService,
} from '@/lib/api/preweddingQuestionnaireService'
import { PreWeddingTemplateSelectDialog } from '@/features/prewedding/PreWeddingTemplateSelectDialog'
import { Link, useNavigate } from 'react-router-dom'
import {
  buildPreweddingPublicUrl,
  clearShareToken,
  mapPreweddingShareError,
  preweddingShareMessage,
  readShareToken,
} from '@/features/prewedding/preweddingShareHelpers'
import {
  formatLocationAnswerDisplay,
  answerToGeoPlace,
} from '@/features/prewedding/preweddingLocation'
import { buildAnswerList, buildAnswerSections } from '@/features/prewedding/answerSummary'
import { PreWeddingDayPlan } from '@/features/prewedding/PreWeddingDayPlan'
import {
  buildWeddingDaySyncCandidates,
  groupWeddingDaySyncCandidates,
  applyWeddingDaySyncCandidates,
  WEDDING_DAY_SYNC_GROUP_LABELS,
  type WeddingDaySyncCandidate,
} from '@/features/prewedding/weddingDaySync'
import {
  SelectedLocationCard,
  isManualGeoPlace,
} from '@/features/travel/SelectedLocationCard'
import { noteService } from '@/lib/api/noteService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { WEDDING_QUESTIONNAIRE_STATUS_LABELS, isPreWeddingSubmittedStatus } from '@/types/preweddingQuestionnaire'
import type { Wedding } from '@/types/wedding'
import type { WeddingQuestionnaire } from '@/types/preweddingQuestionnaire'
import styles from './WeddingPreWeddingQuestionnaire.module.css'
import { formatShortDate, formatDate } from '@/lib/utils/dates'

interface Props {
  wedding: Wedding
  /** Called after canonical apply so parent can refresh wedding snapshot. */
  onWeddingSynced?: (wedding: Wedding) => void
}

function progressLabel(answered: number, total: number): string {
  if (total === 0) return ''
  return `${answered} z ${total} wymaganych odpowiedzi`
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.left = '-9999px'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(area)
  if (!ok) throw new Error('clipboard_failed')
}

// ---------------------------------------------------------------------------
// Answers view
// ---------------------------------------------------------------------------

function AnswersView({
  weddingId,
  questionnaire,
  answers,
}: {
  weddingId: string
  questionnaire: WeddingQuestionnaire
  answers: Record<string, unknown>
}) {
  const sections = buildAnswerSections(questionnaire.schema, answers)
  const flatFallback = buildAnswerList(questionnaire.schema, answers)
  const useSections = sections.length > 0

  function renderItem(item: (typeof flatFallback)[number]) {
    if (item.kind === 'acknowledgement') {
      return (
        <li key={item.questionId} className={styles.answerItem} data-kind="acknowledgement">
          <span className={styles.answerLabel}>{item.label}</span>
          <span className={styles.answerValueRow}>
            <Check size={14} strokeWidth={2} aria-hidden="true" />
            <span className={styles.answerValue}>{item.value}</span>
          </span>
        </li>
      )
    }

    if (item.kind === 'location') {
      const geo = answerToGeoPlace(answers[item.questionId])
      return (
        <li
          key={item.questionId}
          className={styles.answerItem}
          data-kind="location"
          data-question-id={item.questionId}
        >
          <span className={styles.answerLabel}>{item.label}</span>
          {geo ? (
            <SelectedLocationCard
              place={geo}
              manual={isManualGeoPlace(geo) || item.manualLocation}
              showMapsLink
              mapsLinkLabel="Otwórz w Google Maps"
              className={styles.answerLocationCard}
            />
          ) : (
            <span className={styles.answerValue}>
              {item.value || formatLocationAnswerDisplay(answers[item.questionId])}
            </span>
          )}
        </li>
      )
    }

    return (
      <li
        key={item.questionId}
        className={styles.answerItem}
        data-kind={item.kind}
        data-question-id={item.questionId}
      >
        <span className={styles.answerLabel}>{item.label}</span>
        <span className={styles.answerValue}>{item.value}</span>
        {item.kind === 'sensitive' ? (
          <span className={styles.answerSensitiveBadge} aria-label="Tylko dla fotografa">
            <Lock size={12} strokeWidth={2} aria-hidden="true" />
            Tylko dla fotografa
          </span>
        ) : null}
      </li>
    )
  }

  return (
    <div className={styles.answersView} data-testid="prewedding-answers">
      <div className={styles.answersReadable}>
        <PreWeddingDayPlan
          weddingId={weddingId}
          schema={questionnaire.schema}
          answers={answers}
        />

        <section
          className={styles.answersSection}
          data-testid="prewedding-summary-cards"
          aria-labelledby="prewedding-answers-heading"
        >
          <header className={styles.answersSectionHeader}>
            <h3 id="prewedding-answers-heading" className={styles.answersSectionTitle}>
              Odpowiedzi pary
            </h3>
            <p className={styles.answersSectionLead}>
              Odpowiedzi są wyświetlane w kolejności ankiety.
            </p>
          </header>

          {useSections ? (
            <div className={styles.answerStream} data-testid="prewedding-answer-stream">
              {sections.map((group) => (
                <div
                  key={group.sectionId}
                  className={styles.answerSectionGroup}
                  data-testid="answer-section-group"
                >
                  {group.sectionTitle ? (
                    <h4 className={styles.answerGroupTitle}>{group.sectionTitle}</h4>
                  ) : null}
                  <ol className={styles.answerGroupList}>{group.items.map(renderItem)}</ol>
                </div>
              ))}
            </div>
          ) : (
            <ol className={styles.answerStream} data-testid="prewedding-answer-stream">
              {flatFallback.map(renderItem)}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Wedding Day sync review panel
// ---------------------------------------------------------------------------

function MappingPanel({
  candidates,
  selectedIds,
  onToggle,
  onApplyOne,
  onApplySelected,
  applying,
  appliedIds,
}: {
  candidates: WeddingDaySyncCandidate[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onApplyOne: (candidate: WeddingDaySyncCandidate) => void
  onApplySelected: () => void
  applying: boolean
  appliedIds: Set<string>
}) {
  const pending = candidates.filter((c) => !appliedIds.has(c.id))
  if (pending.length === 0) {
    return (
      <div className={styles.mappingPanel} data-testid="mapping-panel">
        <p className={styles.mappingDone}>
          Wszystkie wybrane dane z ankiety zostały zastosowane.
        </p>
      </div>
    )
  }

  const groups = groupWeddingDaySyncCandidates(pending)
  const selectedCount = pending.filter((c) => selectedIds.has(c.id)).length

  return (
    <div className={styles.mappingPanel} data-testid="mapping-panel">
      <h3 className={styles.mappingTitle}>Aktualizacje z ankiety</h3>
      <p className={styles.mappingLead}>
        Para podała dane, które mogą zaktualizować zlecenie (kontakty, datę,
        godzinę ceremonii lub lokalizacje). Sprawdź je przed zastosowaniem.
      </p>

      {groups.map(({ group, items }) => (
        <section key={group} className={styles.mappingGroup}>
          <h4 className={styles.mappingGroupTitle}>
            {WEDDING_DAY_SYNC_GROUP_LABELS[group]}
          </h4>
          {items.map((candidate) => {
            const checked = selectedIds.has(candidate.id)
            return (
              <div
                key={candidate.id}
                className={styles.mappingRow}
                data-testid="sync-candidate-row"
                data-mapping={candidate.mapping}
              >
                <label className={styles.mappingSelect}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={applying || candidate.incomingPoorer}
                    onChange={() => onToggle(candidate.id)}
                    aria-label={`Zaznacz: ${candidate.label}`}
                  />
                </label>
                <div className={styles.mappingBody}>
                  <div className={styles.mappingFieldLabel}>{candidate.label}</div>
                  <div className={styles.mappingCompare}>
                    <div className={styles.mappingCompareCol}>
                      <span className={styles.mappingCompareEyebrow}>Obecnie</span>
                      <div className={styles.mappingCurrentValue}>
                        {candidate.currentDisplay ? (
                          candidate.kind === 'location' && candidate.currentGeo ? (
                            <SelectedLocationCard
                              place={{
                                placeId: candidate.currentGeo.placeId ?? null,
                                formattedAddress:
                                  candidate.currentGeo.formattedAddress?.trim() ||
                                  candidate.currentDisplay,
                                latitude: candidate.currentGeo.latitude ?? null,
                                longitude: candidate.currentGeo.longitude ?? null,
                                label: candidate.currentGeo.label ?? null,
                                provider:
                                  'provider' in candidate.currentGeo
                                    ? (candidate.currentGeo.provider as
                                        | string
                                        | null
                                        | undefined) ?? null
                                    : null,
                              }}
                              manual={isManualGeoPlace({
                                placeId: candidate.currentGeo.placeId ?? null,
                                formattedAddress:
                                  candidate.currentGeo.formattedAddress?.trim() ||
                                  candidate.currentDisplay,
                                latitude: candidate.currentGeo.latitude ?? null,
                                longitude: candidate.currentGeo.longitude ?? null,
                                label: candidate.currentGeo.label ?? null,
                                provider: null,
                              })}
                              className={styles.answerLocationCard}
                            />
                          ) : (
                            candidate.currentDisplay
                          )
                        ) : (
                          <em style={{ color: 'var(--color-text-tertiary)' }}>
                            Brak danych
                          </em>
                        )}
                      </div>
                    </div>
                    <div className={styles.mappingCompareCol}>
                      <span className={styles.mappingCompareEyebrow}>Z ankiety</span>
                      <div className={styles.mappingProposedValue}>
                        {candidate.kind === 'location' && candidate.proposedGeo ? (
                          <SelectedLocationCard
                            place={candidate.proposedGeo}
                            manual={isManualGeoPlace(candidate.proposedGeo)}
                            showMapsLink
                            mapsLinkLabel="Otwórz w Google Maps"
                            className={styles.answerLocationCard}
                          />
                        ) : (
                          candidate.proposedDisplay
                        )}
                      </div>
                    </div>
                  </div>
                  {candidate.incomingPoorer ? (
                    <p className={styles.mappingWarn}>
                      Obecna lokalizacja jest pełniejsza (współrzędne / weryfikacja).
                      Dane z ankiety nie zastąpią jej automatycznie.
                    </p>
                  ) : null}
                </div>
                <div className={styles.mappingActionBtn}>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={applying || candidate.incomingPoorer}
                    onClick={() => onApplyOne(candidate)}
                  >
                    Zastosuj
                  </Button>
                </div>
              </div>
            )
          })}
        </section>
      ))}

      <div className={styles.mappingApplyAll}>
        <span className={styles.mappingSelectedCount}>
          Zaznaczono {selectedCount} z {pending.length}
        </span>
        <Button
          variant="primary"
          size="sm"
          disabled={applying || selectedCount === 0}
          onClick={onApplySelected}
          data-testid="apply-all-btn"
        >
          {applying ? 'Zapisywanie…' : 'Zastosuj wybrane'}
        </Button>
      </div>
    </div>
  )
}

const PREWEDDING_QUERY_KEY = 'prewedding-questionnaire'

// ---------------------------------------------------------------------------
// Main workspace
// ---------------------------------------------------------------------------

export function WeddingPreWeddingQuestionnaireWorkspace({
  wedding,
  onWeddingSynced,
}: Props) {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const navigate = useNavigate()
  const { requirePro } = useProAccessGate()
  const [preparing, setPreparing] = useState(false)
  const [templateSelectOpen, setTemplateSelectOpen] = useState(false)
  const [selectableTemplates, setSelectableTemplates] = useState<
    Awaited<ReturnType<typeof questionnaireTemplateService.listActive>>
  >([])
  const [noTemplates, setNoTemplates] = useState(false)
  const [sharePending, setSharePending] = useState<'generate' | 'share' | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState<'link' | 'message' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySuccess, setApplySuccess] = useState<string | null>(null)

  const {
    data: questionnaire,
    isLoading,
  } = useQuery({
    queryKey: [PREWEDDING_QUERY_KEY, wedding.id],
    queryFn: () => weddingQuestionnaireService.getByWeddingId(wedding.id),
  })

  const { data: response } = useQuery({
    queryKey: ['prewedding-response', questionnaire?.id],
    queryFn: () =>
      questionnaire ? weddingQuestionnaireService.getResponse(questionnaire.id) : null,
    enabled: Boolean(
      questionnaire &&
        ['submitted', 'reopened', 'in_progress', 'opened'].includes(questionnaire.status),
    ),
  })

  const { data: places = [] } = useQuery({
    queryKey: ['wedding-places', userId, wedding.id],
    queryFn: () => weddingPlaceService.listByWeddingId(wedding.id),
    enabled: Boolean(userId && wedding.id),
  })

  const { data: notes = [] } = useQuery({
    queryKey: ['notes', wedding.id],
    queryFn: () => noteService.listByWeddingId(wedding.id),
    enabled: Boolean(wedding.id),
  })

  // Restore session plaintext when hash exists (cannot reconstruct from DB hash).
  useEffect(() => {
    if (!questionnaire?.id) return
    const cached = readShareToken(questionnaire.id)
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- session token hydrate
      setToken(cached)
      return
    }
    if (!questionnaire.hasPublicToken) {
      setToken(null)
    }
  }, [questionnaire?.id, questionnaire?.hasPublicToken, questionnaire?.updatedAt])

  const answers = useMemo(
    () =>
      (response?.answers ?? {}) as Record<
        string,
        import('@/types/preweddingQuestionnaire').PreWeddingAnswerValue
      >,
    [response?.answers],
  )

  const candidates = useMemo(() => {
    if (!questionnaire || Object.keys(answers).length === 0) return []
    if (!isPreWeddingSubmittedStatus(questionnaire.status)) {
      return []
    }
    return buildWeddingDaySyncCandidates({
      questionnaire,
      answers,
      wedding,
      places,
      notes,
    })
  }, [questionnaire, answers, wedding, places, notes])

  const syncResetKey = `${questionnaire?.id ?? ''}:${questionnaire?.submittedAt ?? ''}`
  const [selectionResetKey, setSelectionResetKey] = useState(syncResetKey)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [appliedIds, setAppliedIds] = useState<Set<string>>(() => new Set())
  const [selectionSeeded, setSelectionSeeded] = useState(false)

  if (syncResetKey !== selectionResetKey) {
    setSelectionResetKey(syncResetKey)
    setSelectedIds(new Set())
    setAppliedIds(new Set())
    setSelectionSeeded(false)
    setApplySuccess(null)
  }

  if (!selectionSeeded && candidates.length > 0) {
    setSelectionSeeded(true)
    setSelectedIds(
      new Set(candidates.filter((c) => c.defaultSelected).map((c) => c.id)),
    )
  }

  function setQuestionnaireCache(next: WeddingQuestionnaire) {
    queryClient.setQueryData([PREWEDDING_QUERY_KEY, wedding.id], next)
  }

  async function invalidateRelated() {
    await queryClient.invalidateQueries({ queryKey: [PREWEDDING_QUERY_KEY, wedding.id] })
    void queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'weddings',
    })
    void queryClient.invalidateQueries({ queryKey: ['timeline', wedding.id] })
  }

  function toggleCandidate(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function runApply(selected: WeddingDaySyncCandidate[], opts?: { confirm?: boolean }) {
    if (!requirePro(undefined, { actionKey: 'apply_questionnaire_responses' })) {
      return
    }
    if (!questionnaire || selected.length === 0) return
    const replacesValid = selected.some(
      (c) =>
        !c.currentIsPlaceholder &&
        Boolean(c.currentDisplay.trim()) &&
        !c.incomingPoorer,
    )
    if (
      opts?.confirm !== false &&
      (selected.length > 1 || replacesValid) &&
      !window.confirm(
        'Zastosować wybrane dane z ankiety?\n\nDane Dnia ślubu i zlecenia zostaną zaktualizowane. Istniejące wartości zostaną zastąpione tylko dla wybranych pozycji.',
      )
    ) {
      return
    }

    setApplying(true)
    setApplyError(null)
    setApplySuccess(null)
    try {
      const result = await applyWeddingDaySyncCandidates({
        weddingId: wedding.id,
        wedding,
        candidates: selected,
        answers,
        queryClient,
      })
      setAppliedIds((prev) => new Set([...prev, ...selected.map((c) => c.id)]))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const c of selected) next.delete(c.id)
        return next
      })
      onWeddingSynced?.(result.wedding)
      setApplySuccess(
        result.appliedLabels.length === 1
          ? `Zastosowano: ${result.appliedLabels[0]}.`
          : `Zastosowano ${result.appliedLabels.length} pól z ankiety.`,
      )
      if (result.routeNeedsRecalculation) {
        setApplySuccess(
          (prev) =>
            `${prev ?? ''} Trasa została odświeżona po zmianie lokalizacji.`.trim(),
        )
      }
      if (
        (result.wedding.travelFeeStatus ?? 'unresolved') === 'unresolved' &&
        result.routeNeedsRecalculation
      ) {
        setApplySuccess(
          (prev) =>
            `${prev ?? ''} Ustal koszt dojazdu w zakładce Umowa i finanse — na podstawie planu możesz sprawdzić dystans i ustalić opłatę.`.trim(),
        )
      }
    } catch (err) {
      setApplyError(
        err instanceof Error ? err.message : 'Nie udało się zastosować danych.',
      )
    } finally {
      setApplying(false)
    }
  }

  async function prepareFromTemplate(
    template: Awaited<ReturnType<typeof questionnaireTemplateService.getById>>,
  ) {
    if (!template) throw new Error('Template missing')
    const created = await weddingQuestionnaireService.prepare(wedding, template)
    setQuestionnaireCache(created)
    await invalidateRelated()
    setActionSuccess('Ankieta przygotowana.')
    setTemplateSelectOpen(false)
    setNoTemplates(false)
  }

  async function handlePrepare() {
    if (!requirePro(undefined, { actionKey: 'create_questionnaire' })) return
    setPreparing(true)
    setActionError(null)
    setNoTemplates(false)
    try {
      const active = await questionnaireTemplateService.listActive('pre_wedding')
      if (active.length === 0) {
        setNoTemplates(true)
        return
      }
      if (active.length === 1) {
        await prepareFromTemplate(active[0]!)
        return
      }
      const effective = await questionnaireTemplateService.getEffectiveDefault('pre_wedding')
      setSelectableTemplates(active)
      setTemplateSelectOpen(true)
      void effective
    } catch (err) {
      console.error('[prewedding] prepare failed:', err)
      setActionError('Nie udało się przygotować ankiety. Spróbuj ponownie.')
    } finally {
      setPreparing(false)
    }
  }

  async function handleConfirmTemplate(templateId: string) {
    if (!requirePro(undefined, { actionKey: 'create_questionnaire' })) return
    setPreparing(true)
    setActionError(null)
    try {
      const template = await questionnaireTemplateService.getById(templateId)
      if (!template || template.isArchived || template.type !== 'pre_wedding') {
        throw new Error('Invalid template')
      }
      await prepareFromTemplate(template)
    } catch (err) {
      console.error('[prewedding] prepare from select failed:', err)
      setActionError('Nie udało się przygotować ankiety. Spróbuj ponownie.')
    } finally {
      setPreparing(false)
    }
  }

  async function runShareFlow(mode: 'generate' | 'share', rotate = false) {
    if (
      !requirePro(undefined, {
        actionKey: rotate
          ? 'rotate_questionnaire_token'
          : 'generate_questionnaire_link',
      })
    ) {
      return
    }
    if (!questionnaire || sharePending) return
    setSharePending(mode)
    setActionError(null)
    setActionSuccess(null)
    try {
      const result = await weddingQuestionnaireService.ensureShareLink(
        questionnaire.id,
        wedding.id,
        { rotate },
      )
      setQuestionnaireCache(result.questionnaire)
      setToken(result.token)
      setShareOpen(true)
      setActionSuccess(
        result.rotated
          ? 'Link wygenerowany. Możesz go skopiować i udostępnić parze.'
          : 'Link gotowy do udostępnienia.',
      )
      await invalidateRelated()
    } catch (err) {
      console.error('[prewedding] share failed:', err)
      setActionError(mapPreweddingShareError(err))
    } finally {
      setSharePending(null)
    }
  }

  async function handleCopyLink() {
    if (!token) return
    try {
      await copyText(buildPreweddingPublicUrl(token))
      setCopied('link')
      setActionError(null)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('[prewedding] copy link failed:', err)
      setActionError('Nie udało się skopiować linku.')
    }
  }

  async function handleCopyMessage() {
    if (!token || !questionnaire) return
    const url = buildPreweddingPublicUrl(token)
    try {
      await copyText(preweddingShareMessage(questionnaire.title, url))
      setCopied('message')
      setActionError(null)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('[prewedding] copy message failed:', err)
      setActionError('Nie udało się skopiować wiadomości.')
    }
  }

  async function handleRotateLink() {
    if (!requirePro(undefined, { actionKey: 'rotate_questionnaire_token' })) {
      return
    }
    if (!questionnaire) return
    if (
      !window.confirm(
        'Wygenerowanie nowego linku unieważni poprzedni. Kontynuować?',
      )
    ) {
      return
    }
    clearShareToken(questionnaire.id)
    await runShareFlow('generate', true)
  }

  async function handleUpgradeLayout() {
    if (!requirePro(undefined, { actionKey: 'edit_questionnaire' })) return
    if (!questionnaire) return
    if (
      !window.confirm(
        'Zaktualizować układ ankiety do chronologicznego flow dnia ślubu? Działa tylko gdy nie ma jeszcze odpowiedzi.',
      )
    ) {
      return
    }
    setActionError(null)
    try {
      const next = await weddingQuestionnaireService.upgradeEmptyDraftToDefaultV2(
        questionnaire.id,
      )
      setQuestionnaireCache(next)
      await invalidateRelated()
      setActionSuccess('Układ ankiety zaktualizowany.')
    } catch (err) {
      console.error('[prewedding] upgrade failed:', err)
      setActionError(
        err instanceof Error
          ? err.message
          : 'Nie udało się zaktualizować układu ankiety.',
      )
    }
  }

  if (isLoading) {
    return (
      <div className={styles.spinner} data-testid="prewedding-loading">
        <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
          Ładowanie…
        </p>
      </div>
    )
  }

  if (!questionnaire) {
    return (
      <div className={styles.workspace} data-testid="prewedding-workspace">
        <div className={styles.emptyState} data-testid="prewedding-empty-state">
          <svg
            className={styles.emptyIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h2 className={styles.emptyTitle}>Ankieta przedślubna</h2>
          <p className={styles.emptyDescription}>
            {noTemplates
              ? 'Nie masz aktywnej ankiety przedślubnej.'
              : 'Zbierz od pary wszystkie informacje potrzebne do przygotowania dnia ślubu.'}
          </p>
          {actionError ? (
            <p role="alert" className={styles.actionError}>
              {actionError}
            </p>
          ) : null}
          <div className={styles.emptyActions}>
            {noTemplates ? (
              <>
                <Button
                  variant="primary"
                  onClick={() => navigate('/ankiety')}
                  data-testid="create-template-from-wedding"
                >
                  Utwórz ankietę
                </Button>
                <Link to="/ankiety" className={styles.textLink}>
                  Przejdź do ankiet
                </Link>
              </>
            ) : (
              <Button
                variant="primary"
                onClick={() => void handlePrepare()}
                disabled={preparing}
                data-testid="prepare-questionnaire-btn"
              >
                {preparing ? 'Przygotowywanie…' : 'Przygotuj ankietę'}
              </Button>
            )}
          </div>
        </div>
        {templateSelectOpen ? (
          <PreWeddingTemplateSelectDialog
            templates={selectableTemplates}
            defaultTemplateId={
              selectableTemplates.find((t) => t.isDefault)?.id ?? selectableTemplates[0]?.id
            }
            busy={preparing}
            onCancel={() => setTemplateSelectOpen(false)}
            onConfirm={(id) => void handleConfirmTemplate(id)}
          />
        ) : null}
      </div>
    )
  }

  const statusLabel = WEDDING_QUESTIONNAIRE_STATUS_LABELS[questionnaire.status]
  const formUrl = token ? buildPreweddingPublicUrl(token) : null
  const canShare =
    questionnaire.status === 'draft' ||
    questionnaire.status === 'ready' ||
    questionnaire.status === 'sent' ||
    questionnaire.status === 'opened' ||
    questionnaire.status === 'in_progress'
  const isSubmitted = isPreWeddingSubmittedStatus(questionnaire.status)
  const showSharePanel =
    shareOpen ||
    Boolean(formUrl) ||
    questionnaire.hasPublicToken ||
    questionnaire.status === 'ready' ||
    questionnaire.status === 'draft' ||
    isSubmitted

  return (
    <div className={styles.workspace} data-testid="prewedding-workspace">
      <div className={styles.statusHeader} data-testid="prewedding-status-header">
        <div className={styles.statusHeaderInfo}>
          <h2 className={styles.statusTitle}>Ankieta przedślubna</h2>
          <div className={styles.statusLine}>
            <span
              className={styles.statusBadge}
              data-status={isSubmitted ? 'submitted' : questionnaire.status}
              data-testid="status-badge"
            >
              {isSubmitted ? WEDDING_QUESTIONNAIRE_STATUS_LABELS.submitted : statusLabel}
            </span>
            {response && response.totalRequired > 0 && (
              <span className={styles.progressLine}>
                {progressLabel(response.answeredRequired, response.totalRequired)}
              </span>
            )}
          </div>
          {questionnaire.submittedAt ? (
            <span className={styles.statusMeta}>
              Wysłana: {formatShortDate(questionnaire.submittedAt)}
            </span>
          ) : questionnaire.lastSavedAt ? (
            <span className={styles.statusMeta}>
              Ostatni zapis: {formatDate(questionnaire.lastSavedAt)}
            </span>
          ) : questionnaire.sentAt ? (
            <span className={styles.statusMeta}>
              Udostępniona: {formatShortDate(questionnaire.sentAt)}
            </span>
          ) : null}
        </div>

        <div className={styles.statusHeaderActions}>
          {(questionnaire.status === 'draft' || questionnaire.status === 'ready') &&
          questionnaire.schema.sections.length < 11 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleUpgradeLayout()}
              data-testid="upgrade-layout-btn"
            >
              Zaktualizuj do nowego układu
            </Button>
          ) : null}
          {canShare && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void runShareFlow('share')}
              disabled={Boolean(sharePending)}
              data-testid="send-questionnaire-btn"
            >
              {sharePending === 'share' ? 'Przygotowywanie…' : 'Udostępnij ankietę'}
            </Button>
          )}
        </div>
      </div>

      {actionError ? (
        <p role="alert" className={styles.actionError} data-testid="prewedding-action-error">
          {actionError}
        </p>
      ) : null}
      {actionSuccess ? (
        <p className={styles.actionSuccess} data-testid="prewedding-action-success" role="status">
          {actionSuccess}
        </p>
      ) : null}

      {showSharePanel ? (
        <div className={styles.sharePanel} data-testid="share-panel">
          <h3 className={styles.sharePanelTitle}>
            {formUrl ? 'Link gotowy do udostępnienia' : 'Udostępnij ankietę parze'}
          </h3>
          {formUrl ? (
            <>
              <p className={styles.shareHint}>
                Skopiuj publiczny link i wyślij go parze. Mogą otwierać ten sam link wielokrotnie —
                odpowiedzi są zapisywane i można je edytować do czasu wygenerowania nowego linku.
              </p>
              <div className={styles.shareLinkRow}>
                <span className={styles.shareLinkInput} title={formUrl} data-testid="share-link-url">
                  {formUrl}
                </span>
              </div>
              <div className={styles.shareActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCopyLink()}
                  data-testid="copy-link-btn"
                >
                  {copied === 'link' ? 'Skopiowano' : 'Kopiuj link'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(formUrl, '_blank', 'noopener,noreferrer')}
                  data-testid="preview-btn"
                >
                  Otwórz jako klient
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCopyMessage()}
                  data-testid="copy-message-btn"
                >
                  {copied === 'message' ? 'Skopiowano' : 'Kopiuj wiadomość'}
                </Button>
                {wedding.couple.partner1Email || wedding.couple.email ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const email = wedding.couple.partner1Email || wedding.couple.email
                      const subject = encodeURIComponent(`Ankieta przedślubna — ${questionnaire.title}`)
                      const body = encodeURIComponent(
                        preweddingShareMessage(questionnaire.title, formUrl),
                      )
                      window.open(`mailto:${email}?subject=${subject}&body=${body}`)
                    }}
                    data-testid="mailto-btn"
                  >
                    Wyślij e-mailem
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleRotateLink()}
                  disabled={Boolean(sharePending)}
                  data-testid="rotate-link-btn"
                >
                  {sharePending === 'generate' ? 'Generowanie…' : 'Wygeneruj nowy link'}
                </Button>
              </div>
            </>
          ) : questionnaire.hasPublicToken ? (
            <div className={styles.shareActions}>
              <p className={styles.shareHint} data-testid="share-token-unrecoverable">
                Aktywny link istnieje, ale plaintext nie jest przechowywany w bazie. Wygeneruj
                nowy link, aby go zobaczyć (poprzedni zostanie unieważniony).
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleRotateLink()}
                disabled={Boolean(sharePending)}
                data-testid="generate-link-btn"
              >
                {sharePending === 'generate' ? 'Generowanie…' : 'Generuj nowy link'}
              </Button>
            </div>
          ) : (
            <div className={styles.shareActions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void runShareFlow('generate')}
                disabled={Boolean(sharePending)}
                data-testid="generate-link-btn"
              >
                {sharePending === 'generate' ? 'Generowanie…' : 'Generuj link'}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {isSubmitted && response && Object.keys(answers).length > 0 && (
        <>
          <p className={styles.answersStatusCopy}>
            Para przesłała ankietę
            {questionnaire.submittedAt
              ? ` ${formatShortDate(questionnaire.submittedAt)}`
              : ''}
            .
          </p>
          <AnswersView
            weddingId={wedding.id}
            questionnaire={questionnaire}
            answers={answers}
          />
          {candidates.length > 0 && (
            <MappingPanel
              candidates={candidates}
              selectedIds={selectedIds}
              onToggle={toggleCandidate}
              onApplyOne={(c) => void runApply([c])}
              onApplySelected={() => {
                const selected = candidates.filter(
                  (c) => selectedIds.has(c.id) && !appliedIds.has(c.id),
                )
                void runApply(selected)
              }}
              applying={applying}
              appliedIds={appliedIds}
            />
          )}
          {applySuccess ? (
            <p
              role="status"
              style={{
                color: 'var(--color-success-700)',
                fontSize: 'var(--text-sm)',
              }}
            >
              {applySuccess}
            </p>
          ) : null}
          {applyError && (
            <p role="alert" style={{ color: 'var(--color-danger-600)', fontSize: 'var(--text-sm)' }}>
              {applyError}
            </p>
          )}
        </>
      )}

      {(questionnaire.status === 'in_progress' || questionnaire.status === 'opened') &&
        response &&
        Object.keys(answers).length > 0 && (
          <>
            <p className={styles.answersStatusCopy}>
              Para uzupełnia ankietę. Poniżej widzisz zapisane odpowiedzi.
            </p>
            <AnswersView
              weddingId={wedding.id}
              questionnaire={questionnaire}
              answers={answers}
            />
          </>
        )}
    </div>
  )
}
