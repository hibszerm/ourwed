import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { IconClose } from '@/components/icons'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { blurActiveElement } from '@/components/ui/iosFocus'
import { focusWithoutScroll } from '@/components/ui/iosFocus'
import { useOverlay } from '@/components/ui/overlay/useOverlay'
import {
  ASSISTANT_CHANGE_WEDDING,
  ASSISTANT_CLOSE_LABEL,
  ASSISTANT_EMPTY_PROMPT,
  ASSISTANT_PLACEHOLDER,
  ASSISTANT_PLACEHOLDER_EMPTY,
  ASSISTANT_TITLE,
} from '../copy'
import type { AssistantResponse } from '../types'
import { AssistantComposer } from './AssistantComposer'
import { AssistantProcessingIndicator } from './AssistantProcessingIndicator'
import { AssistantResponseRenderer } from './AssistantResponseRenderer'
import { AssistantThinkingOrb } from './AssistantThinkingOrb'
import {
  isScrollNearBottom,
  scrollElementToBottom,
} from './assistantScroll'
import { PresentationTranscript } from './PresentationTranscript'
import { useAssistantDocumentScrollAnchor } from './useAssistantDocumentScrollAnchor'
import { useAssistantMobileViewport } from './useAssistantMobileViewport'
import type { TranscriptEntry } from '../v7/presentation/types'
import styles from './Assistant.module.css'

export type AssistantTurn = {
  id: string
  userText: string
  response: AssistantResponse | null
  loading: boolean
}

export type AssistantContextHeader = {
  title: string
  subtitle: string | null
}

const COMPOSER_LINE_PX = 22
/** Max composer shell ~126px → textarea content max ≈ 114 with 6+6 padding. */
const COMPOSER_TEXTAREA_MAX_PX = 114
const EXIT_MS = 170

function queryRefForView(
  userText: string,
  response: AssistantResponse | null,
): string | null {
  if (!response || !userText.trim()) return null
  if (response.kind === 'choice') return null
  if (response.kind === 'confirmation') return null
  if (response.kind === 'aggregate') return null
  // Couple name used as selection label — not a user question
  if (userText.includes(' i ') && /^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(userText)) return null
  return userText.trim()
}

export function AssistantSurface({
  open,
  isMobile,
  turns,
  transcript = [],
  loading,
  onClose,
  onSubmit,
  onSelectChoice,
  onSelectClarification,
  onChangeWedding,
  onConfirmCreateWedding,
  onConfirmCreateTask,
  onNavigate,
  onCancelConfirm,
  confirming,
  showChangeWedding,
  contextHeader,
  goalClarificationResolvedLabel = null,
  v5ShadowClarification = null,
  v5ShadowResumeNote = null,
}: {
  open: boolean
  isMobile: boolean
  turns: AssistantTurn[]
  /** V7 ephemeral presentation transcript (memory only). */
  transcript?: TranscriptEntry[]
  loading: boolean
  onClose: () => void
  onSubmit: (text: string) => void
  onSelectChoice: (itemId: string, kind: 'wedding' | 'session') => void
  onSelectClarification?: (optionId: string) => void
  onChangeWedding?: () => void
  onConfirmCreateWedding: () => void
  onConfirmCreateTask: () => void
  onNavigate: (path: string) => void
  onCancelConfirm: () => void
  confirming: boolean
  showChangeWedding?: boolean
  contextHeader?: AssistantContextHeader | null
  goalClarificationResolvedLabel?: string | null
  /** U4 DEV: V5 GoalSpec clarification alongside V3 answer. */
  v5ShadowClarification?: Extract<
    AssistantResponse,
    { kind: 'clarification' }
  > | null
  v5ShadowResumeNote?: string | null
}) {
  const titleId = useId()
  const shellRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const transcriptScrollRef = useRef<HTMLDivElement>(null)
  const followLatestRef = useRef(true)
  const [draft, setDraft] = useState('')
  const [lineCount, setLineCount] = useState(1)
  const [mounted, setMounted] = useState(false)
  const [motion, setMotion] = useState<'enter' | 'exit' | null>(null)
  const everOpenedRef = useRef(false)

  const hasTranscript = transcript.length > 0
  const empty = turns.length === 0 && !hasTranscript && !loading
  const conversationMode = !empty
  const canSubmit = draft.trim().length > 0 && !loading && !confirming
  const overlayOpen = mounted && open
  const composerDisabled =
    loading || confirming || motion === 'exit' || !open

  // Phase 2K.3 — VisualViewport HEIGHT only (no offsetTop positioning).
  useAssistantMobileViewport(overlayOpen && isMobile, frameRef)

  // Phase 2K.3 — neutralize Safari focus-induced document scroll.
  useAssistantDocumentScrollAnchor(overlayOpen && isMobile)

  useOverlay({
    open: overlayOpen,
    onClose,
    busy: confirming,
    panelRef,
    closeOnEscape: true,
    // Mobile: do not autofocus composer (keyboard stays closed until user tap).
    initialFocus: isMobile ? 'panel' : 'first',
    // Overflow lock + document scroll anchor (overflow alone is insufficient on iOS).
    bodyLock: 'overflow',
  })

  // Block document/body touch panning while Assistant is open (transcript may pan).
  useEffect(() => {
    if (!overlayOpen || !isMobile) return
    const onTouchMove = (event: TouchEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        event.preventDefault()
        return
      }
      if (target.closest('[data-testid="assistant-transcript-scroll"]')) return
      if (target.closest('textarea')) return
      event.preventDefault()
    }
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      document.removeEventListener('touchmove', onTouchMove)
    }
  }, [overlayOpen, isMobile])

  useEffect(() => {
    if (open) {
      everOpenedRef.current = true
      const mountTimer = window.setTimeout(() => {
        setMounted(true)
        setMotion('enter')
      }, 0)
      return () => window.clearTimeout(mountTimer)
    }

    if (!everOpenedRef.current) return

    blurActiveElement()
    const exitBeginTimer = window.setTimeout(() => {
      setMotion('exit')
    }, 0)
    const exitDone = window.setTimeout(() => {
      setMounted(false)
      setMotion(null)
      setDraft('')
      followLatestRef.current = true
    }, EXIT_MS)
    return () => {
      window.clearTimeout(exitBeginTimer)
      window.clearTimeout(exitDone)
    }
  }, [open])

  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0px'
    const next = Math.min(
      Math.max(el.scrollHeight, COMPOSER_LINE_PX),
      COMPOSER_TEXTAREA_MAX_PX,
    )
    el.style.height = `${next}px`
    setLineCount(Math.max(1, Math.round(next / COMPOSER_LINE_PX)))
  }, [draft, mounted])

  // Auto-scroll transcript container only — never document/body.
  // Keyboard open/close must not force bottom if user scrolled up.
  useLayoutEffect(() => {
    if (!conversationMode) return
    const el = transcriptScrollRef.current
    if (!el) return
    if (followLatestRef.current) {
      scrollElementToBottom(el)
    }
  }, [conversationMode, transcript, turns, loading])

  // Phase 2K.8 — when transcript viewport height shrinks/grows (keyboard),
  // keep bottom only if user was following latest. Does not touch document
  // scroll, VV geometry, focus, or remount the transcript.
  useLayoutEffect(() => {
    if (!overlayOpen || !isMobile || !conversationMode) return
    const el = transcriptScrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return

    let lastClientHeight = el.clientHeight
    const observer = new ResizeObserver(() => {
      const nextHeight = el.clientHeight
      if (nextHeight === lastClientHeight) return
      lastClientHeight = nextHeight
      if (followLatestRef.current) {
        scrollElementToBottom(el)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [overlayOpen, isMobile, conversationMode])

  // After answers: restore focus only on desktop.
  // Mobile first-tap must be native — never delayed programmatic focus.
  useEffect(() => {
    if (!overlayOpen || motion === 'exit' || confirming) return
    if (loading) return
    if (isMobile) return
    const el = inputRef.current
    if (!el) return
    if (document.activeElement === el) return
    const t = window.setTimeout(() => {
      focusWithoutScroll(el)
    }, conversationMode ? 30 : 0)
    return () => window.clearTimeout(t)
  }, [overlayOpen, motion, confirming, loading, conversationMode, isMobile])

  if (!mounted) return null

  const current = turns[turns.length - 1] ?? null
  const queryRef = current
    ? queryRefForView(current.userText, current.response)
    : null
  const showContext =
    Boolean(contextHeader) &&
    current?.response?.kind !== 'choice' &&
    current?.response?.kind !== 'schedule' &&
    current?.response?.kind !== 'confirmation' &&
    current?.response?.kind !== 'aggregate' &&
    current?.response?.kind !== 'scalar' &&
    current?.response?.kind !== 'money' &&
    current?.response?.kind !== 'collection' &&
    current?.response?.kind !== 'clarification'

  function submit() {
    const text = draft.trim()
    if (!text || loading || confirming) return
    followLatestRef.current = true
    setDraft('')
    onSubmit(text)
  }

  function onTranscriptScroll() {
    const el = transcriptScrollRef.current
    if (!el) return
    followLatestRef.current = isScrollNearBottom(el)
  }

  // One persistent composer dock — same Row 3 for empty + conversation.
  // Must not remount when keyboard opens (no key / branch on keyboard state).
  const composer = (
    <AssistantComposer
      placement="dock"
      draft={draft}
      onDraftChange={setDraft}
      onSubmit={submit}
      disabled={composerDisabled}
      canSubmit={canSubmit && motion !== 'exit'}
      inputRef={inputRef}
      lineCount={lineCount}
      placeholder={
        conversationMode ? ASSISTANT_PLACEHOLDER : ASSISTANT_PLACEHOLDER_EMPTY
      }
    />
  )

  const panel = (
    <div
      ref={panelRef}
      className={styles.panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-mobile={isMobile ? 'true' : 'false'}
      data-empty={empty ? 'true' : 'false'}
      data-mode={conversationMode ? 'conversation' : 'empty'}
      data-motion={motion ?? undefined}
      data-workspace="fixed"
      tabIndex={-1}
    >
      <div className={styles.panelChrome} data-testid="assistant-header">
        <div className={styles.panelHeader}>
          <h2 id={titleId} className={styles.panelTitle}>
            {ASSISTANT_TITLE}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={ASSISTANT_CLOSE_LABEL}
            onClick={onClose}
            data-testid="assistant-close"
          >
            <IconClose />
          </button>
        </div>
      </div>

      <div
        className={styles.contentRegion}
        data-testid="assistant-content-region"
        data-content={conversationMode ? 'transcript' : 'empty'}
      >
        {conversationMode ? (
          <div
            ref={transcriptScrollRef}
            className={styles.transcriptScroll}
            data-testid="assistant-transcript-scroll"
            onScroll={onTranscriptScroll}
            aria-live="polite"
          >
            {!hasTranscript && showContext && contextHeader ? (
              <div className={styles.contextHeader}>
                <div className={styles.contextText}>
                  <p className={styles.contextTitle}>{contextHeader.title}</p>
                  {contextHeader.subtitle ? (
                    <p className={styles.contextSub}>{contextHeader.subtitle}</p>
                  ) : null}
                </div>
                {showChangeWedding && onChangeWedding ? (
                  <button
                    type="button"
                    className={styles.changeWedding}
                    onClick={onChangeWedding}
                  >
                    {ASSISTANT_CHANGE_WEDDING}
                  </button>
                ) : null}
              </div>
            ) : null}

            {hasTranscript ? (
              <PresentationTranscript
                entries={transcript}
                loading={loading}
                onNavigate={onNavigate}
                onRetry={(utterance) => onSubmit(utterance)}
              />
            ) : null}

            {!hasTranscript &&
            (current?.loading || (loading && !current?.response)) ? (
              <AssistantProcessingIndicator />
            ) : null}

            {!hasTranscript &&
            current &&
            !current.loading &&
            current.response ? (
              <div key={current.id} className={styles.answerFrame}>
                {queryRef ? <p className={styles.queryRef}>{queryRef}</p> : null}
                <AssistantResponseRenderer
                  response={current.response}
                  busy={confirming || loading}
                  hideResourceIdentity={Boolean(showContext && contextHeader)}
                  onSelectChoice={onSelectChoice}
                  onSelectClarification={onSelectClarification}
                  onConfirmCreateWedding={onConfirmCreateWedding}
                  onConfirmCreateTask={onConfirmCreateTask}
                  onNavigate={onNavigate}
                  onCancelConfirm={onCancelConfirm}
                  goalClarificationResolvedLabel={goalClarificationResolvedLabel}
                />
              </div>
            ) : null}

            {v5ShadowClarification ? (
              <div
                className={styles.v5GoalShadow}
                data-testid="v5-goal-shadow-clarification"
                data-shadow="v5-goal"
              >
                <p className={styles.v5GoalShadowMark}>V5 GoalSpec · shadow</p>
                <AssistantResponseRenderer
                  response={v5ShadowClarification}
                  busy={confirming || loading}
                  hideResourceIdentity
                  onSelectChoice={onSelectChoice}
                  onSelectClarification={onSelectClarification}
                  onConfirmCreateWedding={onConfirmCreateWedding}
                  onConfirmCreateTask={onConfirmCreateTask}
                  onNavigate={onNavigate}
                  onCancelConfirm={onCancelConfirm}
                  goalClarificationResolvedLabel={goalClarificationResolvedLabel}
                />
              </div>
            ) : null}

            {v5ShadowResumeNote ? (
              <p
                className={styles.v5GoalShadowNote}
                data-testid="v5-goal-shadow-note"
              >
                {v5ShadowResumeNote}
              </p>
            ) : null}
          </div>
        ) : (
          <div
            className={styles.emptyHero}
            data-testid="assistant-empty-welcome"
            aria-live="polite"
          >
            <div className={styles.emptyHeroGroup}>
              <AssistantThinkingOrb
                variant="hero"
                aria-label={ASSISTANT_EMPTY_PROMPT}
              />
              <p className={styles.emptyPrompt}>{ASSISTANT_EMPTY_PROMPT}</p>
            </div>
          </div>
        )}
      </div>

      {composer}
    </div>
  )

  return (
    <ModalPortal>
      <div
        ref={shellRef}
        className={styles.surfaceRoot}
        data-testid="assistant-surface"
        data-motion={motion ?? undefined}
        data-mobile={isMobile ? 'true' : 'false'}
        data-mode={conversationMode ? 'conversation' : 'empty'}
        data-phase="k31-correctness-followup"
      >
        {!isMobile ? (
          <button
            type="button"
            className={styles.surfaceBackdrop}
            aria-label={ASSISTANT_CLOSE_LABEL}
            onClick={onClose}
            tabIndex={motion === 'exit' ? -1 : 0}
          />
        ) : null}
        {isMobile ? (
          <div
            ref={frameRef}
            className={styles.mobileViewportFrame}
            data-testid="assistant-viewport-frame"
          >
            {panel}
          </div>
        ) : (
          panel
        )}
      </div>
    </ModalPortal>
  )
}
