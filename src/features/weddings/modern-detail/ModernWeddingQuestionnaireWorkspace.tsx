import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FloatingPortal } from '@/components/ui/FloatingPortal'
import { Modal } from '@/components/ui/Modal'
import { IconCheck } from '@/components/icons'
import { PreWeddingTemplateSelectDialog } from '@/features/prewedding/PreWeddingTemplateSelectDialog'
import { PreWeddingDayPlan } from '@/features/prewedding/PreWeddingDayPlan'
import { buildAnswerList } from '@/features/prewedding/answerSummary'
import { answerToGeoPlace } from '@/features/prewedding/preweddingLocation'
import { preweddingShareMessage } from '@/features/prewedding/preweddingShareHelpers'
import { usePreWeddingQuestionnaireWorkspace } from '@/features/prewedding/usePreWeddingQuestionnaireWorkspace'
import {
  groupWeddingDaySyncCandidates,
  WEDDING_DAY_SYNC_GROUP_LABELS,
  type WeddingDaySyncCandidate,
} from '@/features/prewedding/weddingDaySync'
import { isManualGeoPlace } from '@/features/travel/SelectedLocationCard'
import { getWeddingLocationDisplay } from '@/features/travel/weddingLocationModel'
import { googleMapsPlaceUrl } from '@/services/googleMapsLinks'
import { formatDate } from '@/lib/utils/dates'
import type { GeoPlace, WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import {
  composeModernQuestionnaireChapter,
  EMPTY_QUESTIONNAIRE_COPY,
  EMPTY_QUESTIONNAIRE_HEADLINE,
} from './modernWeddingQuestionnaireModel'
import styles from './ModernWeddingQuestionnaireWorkspace.module.css'

interface Props {
  wedding: Wedding
  onWeddingSynced?: (wedding: Wedding) => void
}

function formatCompareValue(kind: WeddingDaySyncCandidate['kind'], value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (kind === 'date' && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return formatDate(trimmed.slice(0, 10))
  }
  return trimmed
}

function toGeoPlace(
  value: GeoPlace | WeddingPlace | null | undefined,
  fallbackAddress?: string,
): GeoPlace | null {
  if (!value && !fallbackAddress?.trim()) return null
  if (!value) {
    return {
      placeId: null,
      formattedAddress: fallbackAddress ?? '',
      latitude: null,
      longitude: null,
      label: null,
      provider: null,
    }
  }
  return {
    placeId: value.placeId ?? null,
    formattedAddress:
      value.formattedAddress?.trim() || fallbackAddress || '',
    latitude: value.latitude ?? null,
    longitude: value.longitude ?? null,
    label: value.label ?? null,
    provider: 'provider' in value ? (value.provider ?? null) : null,
  }
}

function LocationBlock({
  place,
  empty,
  verifiedLabel,
  manualLabel,
  maps,
}: {
  place: GeoPlace | null
  empty?: boolean
  verifiedLabel?: string
  manualLabel?: string
  maps?: boolean
}) {
  if (empty || !place) {
    return <p className={`${styles.compareValue} ${styles.compareEmpty}`}>Brak danych</p>
  }
  const display = getWeddingLocationDisplay(place)
  const manual = isManualGeoPlace(place)
  const mapsUrl = maps ? googleMapsPlaceUrl(place) : null
  return (
    <>
      <p className={styles.compareValue}>{display.primary}</p>
      {display.secondary ? (
        <p className={styles.compareMeta}>{display.secondary}</p>
      ) : null}
      <p className={styles.compareMeta}>
        {manual ? (manualLabel ?? 'Adres podany ręcznie') : (verifiedLabel ?? 'Zweryfikowane miejsce')}
      </p>
      {mapsUrl ? (
        <a
          className={styles.mapsLink}
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Otwórz w Google Maps
        </a>
      ) : null}
    </>
  )
}

function ReviewPanel({
  candidates,
  selectedIds,
  appliedIds,
  applying,
  onToggle,
  onApplyOne,
  onApplySelected,
}: {
  candidates: WeddingDaySyncCandidate[]
  selectedIds: Set<string>
  appliedIds: Set<string>
  applying: boolean
  onToggle: (id: string) => void
  onApplyOne: (candidate: WeddingDaySyncCandidate) => void
  onApplySelected: () => void
}) {
  const pending = candidates.filter((c) => !appliedIds.has(c.id))
  if (pending.length === 0) return null
  const groups = groupWeddingDaySyncCandidates(pending)
  const selectedCount = pending.filter((c) => selectedIds.has(c.id)).length

  return (
    <div className={styles.review} data-testid="mapping-panel">
      <h3 className={styles.reviewTitle}>Zmiany do sprawdzenia</h3>
      <p className={styles.reviewLead}>
        Para podała dane, które mogą zaktualizować zlecenie. Sprawdź je przed
        zastosowaniem — istniejące wartości zostaną zastąpione tylko dla
        wybranych pozycji.
      </p>
      {groups.map(({ group, items }) => (
        <section key={group} className={styles.reviewGroup}>
          <h4 className={styles.reviewGroupTitle}>
            {WEDDING_DAY_SYNC_GROUP_LABELS[group]}
          </h4>
          {items.map((candidate) => {
            const currentPlace = toGeoPlace(
              candidate.currentGeo,
              candidate.currentDisplay,
            )
            const proposedPlace =
              candidate.proposedGeo ??
              toGeoPlace(null, candidate.proposedDisplay)
            return (
              <div
                key={candidate.id}
                className={styles.candidate}
                data-testid="sync-candidate-row"
                data-mapping={candidate.mapping}
              >
                <label className={styles.candidateSelect}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(candidate.id)}
                    disabled={applying}
                    onChange={() => onToggle(candidate.id)}
                    aria-label={`Zaznacz: ${candidate.label}`}
                  />
                </label>
                <div>
                  <p className={styles.candidateLabel}>{candidate.label}</p>
                  <div className={styles.compare}>
                    <div>
                      <span className={styles.compareEyebrow}>Obecnie</span>
                      {candidate.kind === 'location' ? (
                        <LocationBlock
                          place={currentPlace}
                          empty={!candidate.currentDisplay.trim()}
                          verifiedLabel="Zweryfikowane miejsce"
                          manualLabel="Adres wpisany ręcznie"
                        />
                      ) : (
                        <p className={styles.compareValue}>
                          {candidate.currentDisplay.trim() ? (
                            formatCompareValue(candidate.kind, candidate.currentDisplay)
                          ) : (
                            <em className={styles.compareEmpty}>Brak danych</em>
                          )}
                        </p>
                      )}
                    </div>
                    <div>
                      <span className={styles.compareEyebrow}>Z ankiety</span>
                      {candidate.kind === 'location' ? (
                        <LocationBlock
                          place={proposedPlace}
                          empty={!candidate.proposedDisplay.trim()}
                          verifiedLabel="Zweryfikowane miejsce"
                          manualLabel="Adres podany ręcznie przez parę"
                          maps
                        />
                      ) : (
                        <p className={styles.compareValue}>
                          {formatCompareValue(candidate.kind, candidate.proposedDisplay)}
                        </p>
                      )}
                    </div>
                  </div>
                  {candidate.incomingPoorer ? (
                    <p className={styles.warn}>
                      Zastosowanie tej zmiany zastąpi zweryfikowane miejsce
                      adresem podanym ręcznie przez parę. Nazwa miejsca i
                      współrzędne nie zostaną przeniesione.
                    </p>
                  ) : null}
                  <div className={styles.candidateActions}>
                    <button
                      type="button"
                      className={styles.quietAction}
                      disabled={applying}
                      onClick={() => onApplyOne(candidate)}
                    >
                      Zastosuj zmianę
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </section>
      ))}
      <div className={styles.reviewFooter}>
        <span className={styles.selectedCount}>
          Zaznaczono {selectedCount} z {pending.length}
        </span>
        <Button
          variant="primary"
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

function AnswersDocument({
  questionnaire,
  answers,
}: {
  questionnaire: NonNullable<
    ReturnType<typeof usePreWeddingQuestionnaireWorkspace>['questionnaire']
  >
  answers: Record<string, unknown>
}) {
  const items = buildAnswerList(questionnaire.schema, answers)

  return (
    <div data-testid="prewedding-answers">
      <div data-testid="prewedding-summary-cards">
        <div
          className={styles.answerStream}
          data-testid="prewedding-answer-stream"
        >
          {items.map((item) => {
            const geo =
              item.kind === 'location'
                ? answerToGeoPlace(answers[item.questionId])
                : null
            const mapsUrl = geo ? googleMapsPlaceUrl(geo) : item.mapsUrl
            const display = geo ? getWeddingLocationDisplay(geo) : null
            return (
              <div
                key={item.questionId}
                className={styles.answer}
                data-kind={item.kind}
                data-question-id={item.questionId}
              >
                <p className={styles.answerLabel}>{item.label}</p>
                {item.kind === 'acknowledgement' ? (
                  <p className={`${styles.answerValue} ${styles.answerAck}`}>
                    <IconCheck width={14} height={14} aria-hidden="true" />
                    Potwierdzone
                  </p>
                ) : item.kind === 'location' && display ? (
                  <>
                    <p className={styles.answerValue}>{display.primary}</p>
                    {display.secondary ? (
                      <p className={styles.sensitiveNote}>{display.secondary}</p>
                    ) : null}
                    {mapsUrl ? (
                      <a
                        className={styles.mapsLink}
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Otwórz w Google Maps
                      </a>
                    ) : null}
                  </>
                ) : (
                  <p className={styles.answerValue}>{item.value}</p>
                )}
                {item.kind === 'sensitive' ? (
                  <p
                    className={styles.sensitiveNote}
                    aria-label="Tylko dla fotografa"
                  >
                    Tylko dla fotografa
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const LINK_OVERFLOW_PLACEMENT = {
  gap: 6,
  minMenuWidth: 232,
  maxMenuWidth: 240,
  align: 'end' as const,
  forceAnchored: true,
  maxMenuHeight: 360,
}

function ShareDetails({
  formUrl,
  hasPublicToken,
  shareTokenReady,
  copied,
  sharePending,
  coupleEmail,
  questionnaireTitle,
  onCopyLink,
  onCopyMessage,
  onRotate,
  onGenerate,
}: {
  formUrl: string | null
  hasPublicToken: boolean
  shareTokenReady: boolean
  copied: 'link' | 'message' | null
  sharePending: 'generate' | 'share' | null
  coupleEmail?: string
  questionnaireTitle: string
  onCopyLink: () => void
  onCopyMessage: () => void
  onRotate: () => void | Promise<void>
  onGenerate: () => void
}) {
  const menuId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)
  const rotating = sharePending === 'generate'

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Escape') return
      setMenuOpen(false)
      btnRef.current?.focus()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
    first?.focus()
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  function onMenuKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') setMenuOpen(false)
  }

  function requestRotate() {
    setMenuOpen(false)
    setRotateOpen(true)
  }

  function confirmRotate() {
    void Promise.resolve(onRotate()).finally(() => setRotateOpen(false))
  }

  const rotateModal = (
    <Modal
      open={rotateOpen}
      title="Wygenerować nowy link?"
      onClose={() => {
        if (!rotating) setRotateOpen(false)
      }}
      busy={rotating}
      primaryAction={
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={rotating}
          onClick={confirmRotate}
          data-testid="confirm-rotate-link-btn"
        >
          {rotating ? 'Generowanie…' : 'Wygeneruj nowy link'}
        </Button>
      }
    >
      <p>Poprzedni link przestanie działać.</p>
      <p>Dotychczasowe odpowiedzi zostaną zachowane.</p>
    </Modal>
  )

  if (!formUrl && hasPublicToken && !shareTokenReady) {
    return (
      <div className={styles.share} data-testid="share-panel">
        <p className={styles.shareKicker}>Link dla Pary</p>
      </div>
    )
  }

  if (formUrl) {
    return (
      <div className={styles.share} data-testid="share-panel">
        <p className={styles.shareKicker}>Link dla Pary</p>
        <div className={styles.shareRow}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void onCopyLink()}
            data-testid="copy-link-btn"
          >
            {copied === 'link' ? 'Skopiowano' : 'Kopiuj link'}
          </Button>
          <div className={styles.overflowWrap} ref={wrapRef}>
            <button
              type="button"
              ref={btnRef}
              className={styles.overflowBtn}
              aria-label="Więcej działań linku"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              data-testid="share-overflow-btn"
              onKeyDown={onMenuKey}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
            </button>
            <FloatingPortal
              open={menuOpen}
              anchorRef={btnRef}
              options={LINK_OVERFLOW_PLACEMENT}
            >
              {() => (
                <div
                  ref={menuRef}
                  id={menuId}
                  className={styles.menu}
                  role="menu"
                  data-testid="share-overflow-menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      window.open(formUrl, '_blank', 'noopener,noreferrer')
                    }}
                    data-testid="preview-btn"
                  >
                    Otwórz ankietę
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      void onCopyMessage()
                    }}
                    data-testid="copy-message-btn"
                  >
                    {copied === 'message' ? 'Skopiowano' : 'Kopiuj wiadomość'}
                  </button>
                  {coupleEmail ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        const subject = encodeURIComponent(
                          `Ankieta przedślubna — ${questionnaireTitle}`,
                        )
                        const body = encodeURIComponent(
                          preweddingShareMessage(questionnaireTitle, formUrl),
                        )
                        window.open(
                          `mailto:${coupleEmail}?subject=${subject}&body=${body}`,
                        )
                      }}
                      data-testid="mailto-btn"
                    >
                      Wyślij e-mailem
                    </button>
                  ) : null}
                  <div className={styles.menuSep} role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuDanger}
                    disabled={rotating}
                    onClick={requestRotate}
                    data-testid="rotate-link-btn"
                  >
                    Wygeneruj nowy link
                  </button>
                </div>
              )}
            </FloatingPortal>
          </div>
        </div>
        {rotateModal}
      </div>
    )
  }

  if (hasPublicToken) {
    return (
      <div className={styles.share} data-testid="share-panel">
        <p className={styles.shareKicker}>Link dla Pary</p>
        <p className={styles.shareUnavailable} data-testid="share-token-unrecoverable">
          Link niedostępny w tej sesji
        </p>
        <div className={styles.shareRow}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={requestRotate}
            disabled={rotating}
            data-testid="generate-link-btn"
          >
            {rotating ? 'Generowanie…' : 'Wygeneruj nowy link'}
          </Button>
        </div>
        {rotateModal}
      </div>
    )
  }

  return (
    <div className={styles.share} data-testid="share-panel">
      <p className={styles.shareKicker}>Link dla Pary</p>
      <div className={styles.shareRow}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void onGenerate()}
          disabled={rotating}
          data-testid="generate-link-btn"
        >
          {rotating ? 'Generowanie…' : 'Generuj link'}
        </Button>
      </div>
    </div>
  )
}

export function ModernWeddingQuestionnaireWorkspace({
  wedding,
  onWeddingSynced,
}: Props) {
  const reviewRef = useRef<HTMLDivElement>(null)
  const ctrl = usePreWeddingQuestionnaireWorkspace(wedding, onWeddingSynced)
  const coupleEmail = wedding.couple.partner1Email || wedding.couple.email

  if (ctrl.isLoading) {
    return (
      <div className={styles.page} data-testid="modern-wedding-questionnaire">
        <p className={styles.loading} data-testid="prewedding-loading">
          Ładowanie…
        </p>
      </div>
    )
  }

  if (!ctrl.questionnaire) {
    return (
      <div
        className={styles.page}
        data-testid="modern-wedding-questionnaire"
      >
        <section
          className={`${styles.sheet} ${styles.ankieta}`}
          data-testid="prewedding-empty-state"
        >
          <p className={styles.eyebrow}>Ankieta przedślubna</p>
          <h2 className={styles.emptyLead}>
            {ctrl.noTemplates
              ? 'Nie masz aktywnej ankiety przedślubnej.'
              : EMPTY_QUESTIONNAIRE_HEADLINE}
          </h2>
          {!ctrl.noTemplates ? (
            <p className={styles.emptyCopy}>{EMPTY_QUESTIONNAIRE_COPY}</p>
          ) : null}
          {ctrl.actionError ? (
            <p role="alert" className={styles.feedback} data-kind="error">
              {ctrl.actionError}
            </p>
          ) : null}
          <div className={styles.emptyActions}>
            {ctrl.noTemplates ? (
              <div className={styles.headActions}>
                <Button
                  variant="primary"
                  onClick={() => ctrl.navigate('/ankiety')}
                  data-testid="create-template-from-wedding"
                >
                  Utwórz ankietę
                </Button>
                <Link to="/ankiety" className={styles.quietAction}>
                  Przejdź do ankiet
                </Link>
              </div>
            ) : (
              <Button
                variant="primary"
                className={styles.primaryAction}
                onClick={() => void ctrl.handlePrepare()}
                disabled={ctrl.preparing}
                data-testid="prepare-questionnaire-btn"
              >
                {ctrl.preparing ? 'Przygotowywanie…' : 'Przygotuj ankietę'}
              </Button>
            )}
          </div>
        </section>
        {ctrl.templateSelectOpen ? (
          <PreWeddingTemplateSelectDialog
            templates={ctrl.selectableTemplates}
            defaultTemplateId={
              ctrl.selectableTemplates.find((t) => t.isDefault)?.id ??
              ctrl.selectableTemplates[0]?.id
            }
            busy={ctrl.preparing}
            onCancel={() => ctrl.setTemplateSelectOpen(false)}
            onConfirm={(id) => void ctrl.handleConfirmTemplate(id)}
          />
        ) : null}
      </div>
    )
  }

  const chapter = composeModernQuestionnaireChapter({
    status: ctrl.questionnaire.status,
    submittedAt: ctrl.questionnaire.submittedAt,
    sentAt: ctrl.questionnaire.sentAt,
    firstOpenedAt: ctrl.questionnaire.firstOpenedAt,
    lastSavedAt: ctrl.questionnaire.lastSavedAt,
    answeredRequired: ctrl.response?.answeredRequired ?? 0,
    totalRequired: ctrl.response?.totalRequired ?? 0,
    pendingApplyCount: ctrl.pendingCandidates.length,
  })
  const showLinkManagement =
    !chapter.showPrimaryShare &&
    (Boolean(ctrl.formUrl) ||
      Boolean(ctrl.questionnaire.hasPublicToken) ||
      ctrl.shareOpen)
  const canUpgrade =
    (ctrl.questionnaire.status === 'draft' ||
      ctrl.questionnaire.status === 'ready') &&
    ctrl.questionnaire.schema.sections.length < 11

  return (
    <div
      className={styles.page}
      data-testid="modern-wedding-questionnaire"
    >
      <section className={`${styles.sheet} ${styles.ankieta}`} data-testid="prewedding-workspace">
        <div className={styles.head}>
          <p className={styles.eyebrow}>Ankieta</p>
          <div className={styles.headActions}>
            {canUpgrade ? (
              <button
                type="button"
                className={styles.quietAction}
                onClick={() => void ctrl.handleUpgradeLayout()}
                data-testid="upgrade-layout-btn"
              >
                Zaktualizuj do nowego układu
              </button>
            ) : null}
            {chapter.showPrimaryShare ? (
              <Button
                variant="primary"
                className={styles.primaryAction}
                onClick={() => void ctrl.runShareFlow('share')}
                disabled={Boolean(ctrl.sharePending)}
                data-testid="send-questionnaire-btn"
              >
                {ctrl.sharePending === 'share'
                  ? 'Przygotowywanie…'
                  : 'Udostępnij Parze'}
              </Button>
            ) : null}
            {chapter.kind === 'submitted_pending' ? (
              <Button
                variant="secondary"
                className={styles.primaryAction}
                onClick={() =>
                  reviewRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  })
                }
              >
                Przejrzyj zmiany
              </Button>
            ) : null}
          </div>
        </div>

        <div className={styles.statusBlock}>
          <h2
            className={styles.headline}
            data-kind={chapter.kind}
            data-testid="status-badge"
            data-status={
              ctrl.isSubmitted ? 'submitted' : ctrl.questionnaire.status
            }
          >
            {chapter.kind === 'submitted_clean' ||
            chapter.kind === 'submitted_pending' ? (
              <IconCheck
                className={styles.checkMark}
                width={18}
                height={18}
                aria-hidden="true"
              />
            ) : null}
            {chapter.headline}
          </h2>
          {chapter.dateLine ? (
            <p className={styles.dateLine}>{chapter.dateLine}</p>
          ) : null}
          {chapter.progressLine ? (
            <p className={styles.progressLine}>{chapter.progressLine}</p>
          ) : null}
          {chapter.supportLine ? (
            <p
              className={styles.support}
              data-attention={chapter.attention ? 'true' : undefined}
            >
              {chapter.supportLine}
            </p>
          ) : null}
        </div>

        {ctrl.actionError ? (
          <p
            role="alert"
            className={styles.feedback}
            data-kind="error"
            data-testid="prewedding-action-error"
          >
            {ctrl.actionError}
          </p>
        ) : null}
        {ctrl.actionSuccess ? (
          <p
            className={styles.feedback}
            data-kind="success"
            data-testid="prewedding-action-success"
            role="status"
          >
            {ctrl.actionSuccess}
          </p>
        ) : null}

        {showLinkManagement ? (
          <ShareDetails
            formUrl={ctrl.formUrl}
            hasPublicToken={Boolean(ctrl.questionnaire.hasPublicToken)}
            shareTokenReady={ctrl.shareTokenReady}
            copied={ctrl.copied}
            sharePending={ctrl.sharePending}
            coupleEmail={coupleEmail}
            questionnaireTitle={ctrl.questionnaire.title}
            onCopyLink={ctrl.handleCopyLink}
            onCopyMessage={ctrl.handleCopyMessage}
            onRotate={() =>
              ctrl.handleRotateLink({ skipBrowserConfirm: true })
            }
            onGenerate={() => void ctrl.runShareFlow('generate')}
          />
        ) : null}

        {chapter.kind === 'submitted_pending' ? (
          <div ref={reviewRef}>
            <ReviewPanel
              candidates={ctrl.candidates}
              selectedIds={ctrl.selectedIds}
              appliedIds={ctrl.appliedIds}
              applying={ctrl.applying}
              onToggle={ctrl.toggleCandidate}
              onApplyOne={(c) => void ctrl.runApply([c])}
              onApplySelected={() => {
                const selected = ctrl.pendingCandidates.filter((c) =>
                  ctrl.selectedIds.has(c.id),
                )
                void ctrl.runApply(selected)
              }}
            />
          </div>
        ) : null}

        {ctrl.applySuccess ? (
          <p className={styles.feedback} data-kind="success" role="status">
            {ctrl.applySuccess}
          </p>
        ) : null}
        {ctrl.applyError ? (
          <p role="alert" className={styles.feedback} data-kind="error">
            {ctrl.applyError}
          </p>
        ) : null}
      </section>

      {ctrl.showAnswers ? (
        <section className={`${styles.sheet} ${styles.plan}`}>
          <p className={styles.eyebrow}>Plan dnia</p>
          <p className={styles.planNote}>
            Godziny operacyjne ustawione tutaj są używane w Trybie dnia. Kolejność
            miejsc jest tą samą, co w Logistyce.
          </p>
          <PreWeddingDayPlan
            weddingId={wedding.id}
            weddingCeremonyTime={wedding.ceremonyTime}
            schema={ctrl.questionnaire.schema}
            answers={ctrl.answers}
            presentation="modern"
          />
        </section>
      ) : null}

      {ctrl.showAnswers ? (
        <section
          className={`${styles.sheet} ${styles.answers}`}
          aria-labelledby="prewedding-answers-heading"
        >
          <p className={styles.eyebrow} id="prewedding-answers-heading">
            Odpowiedzi pary
          </p>
          <div className={styles.readable}>
            <AnswersDocument
              questionnaire={ctrl.questionnaire}
              answers={ctrl.answers}
            />
          </div>
        </section>
      ) : null}

      {ctrl.templateSelectOpen ? (
        <PreWeddingTemplateSelectDialog
          templates={ctrl.selectableTemplates}
          defaultTemplateId={
            ctrl.selectableTemplates.find((t) => t.isDefault)?.id ??
            ctrl.selectableTemplates[0]?.id
          }
          busy={ctrl.preparing}
          onCancel={() => ctrl.setTemplateSelectOpen(false)}
          onConfirm={(id) => void ctrl.handleConfirmTemplate(id)}
        />
      ) : null}
    </div>
  )
}
