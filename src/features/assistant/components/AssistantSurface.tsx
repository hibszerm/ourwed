import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUp, Search } from 'lucide-react'
import { IconClose } from '@/components/icons'
import { ModalPortal } from '@/components/ui/ModalPortal'
import {
  lockBodyScroll,
  unlockBodyScroll,
} from '@/components/ui/overlay/bodyLock'
import {
  ASSISTANT_CHANGE_WEDDING,
  ASSISTANT_CLOSE_LABEL,
  ASSISTANT_EXAMPLE_GROUPS,
  ASSISTANT_LOADING,
  ASSISTANT_PLACEHOLDER,
  ASSISTANT_SUBMIT_LABEL,
  ASSISTANT_SUPPORT,
  ASSISTANT_TITLE,
} from '../copy'
import type { AssistantResponse } from '../types'
import { AssistantResponseRenderer } from './AssistantResponseRenderer'
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

const COMPOSER_MAX_PX = 120
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
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState('')
  const [mounted, setMounted] = useState(false)
  const [motion, setMotion] = useState<'enter' | 'exit' | null>(null)
  const everOpenedRef = useRef(false)

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

    const exitBeginTimer = window.setTimeout(() => {
      setMotion('exit')
    }, 0)
    const exitDone = window.setTimeout(() => {
      setMounted(false)
      setMotion(null)
      setDraft('')
    }, EXIT_MS)
    return () => {
      window.clearTimeout(exitBeginTimer)
      window.clearTimeout(exitDone)
    }
  }, [open])

  useEffect(() => {
    if (!mounted || motion !== 'enter') return
    lockBodyScroll()
    const t = window.setTimeout(() => {
      inputRef.current?.focus()
    }, isMobile ? 80 : 40)
    return () => {
      window.clearTimeout(t)
      unlockBodyScroll()
    }
  }, [mounted, motion, isMobile])

  useEffect(() => {
    if (!mounted || motion === 'exit') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirming) {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mounted, motion, onClose, confirming])

  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0px'
    const next = Math.min(Math.max(el.scrollHeight, 28), COMPOSER_MAX_PX)
    el.style.height = `${next}px`
  }, [draft, mounted])

  if (!mounted) return null

  const empty = turns.length === 0 && !loading
  const canSubmit = draft.trim().length > 0 && !loading && !confirming
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
    setDraft('')
    onSubmit(text)
  }

  return (
    <ModalPortal>
      <div
        className={styles.surfaceRoot}
        data-testid="assistant-surface"
        data-motion={motion ?? undefined}
        data-mobile={isMobile ? 'true' : 'false'}
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
        <div
          ref={panelRef}
          className={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-mobile={isMobile ? 'true' : 'false'}
          data-empty={empty ? 'true' : 'false'}
          data-motion={motion ?? undefined}
        >
          <div className={styles.panelChrome}>
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

            <div className={styles.composerWrap}>
              <div className={styles.composer}>
                <Search className={styles.composerSearchIcon} aria-hidden />
                <textarea
                  ref={inputRef}
                  className={styles.composerInput}
                  rows={1}
                  value={draft}
                  placeholder={ASSISTANT_PLACEHOLDER}
                  disabled={loading || confirming || motion === 'exit'}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submit()
                    }
                  }}
                  data-testid="assistant-composer"
                />
                <button
                  type="button"
                  className={styles.sendIconButton}
                  disabled={!canSubmit || motion === 'exit'}
                  onClick={submit}
                  aria-label={ASSISTANT_SUBMIT_LABEL}
                >
                  <ArrowUp className={styles.sendIcon} aria-hidden />
                </button>
              </div>
            </div>
          </div>

          <div className={styles.body} aria-live="polite">
            {empty ? (
              <div className={styles.empty}>
                <p className={styles.emptySupport}>{ASSISTANT_SUPPORT}</p>
                {ASSISTANT_EXAMPLE_GROUPS.map((group) => (
                  <div key={group.label} className={styles.exampleGroup}>
                    <p className={styles.examplesLabel}>{group.label}</p>
                    <ul className={styles.examples}>
                      {group.examples.map((example) => (
                        <li key={example}>
                          <button
                            type="button"
                            className={styles.exampleButton}
                            onClick={() => onSubmit(example)}
                          >
                            <span>{example}</span>
                            <ArrowRight
                              className={styles.exampleArrow}
                              aria-hidden
                            />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}

            {!empty && showContext && contextHeader ? (
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

            {current?.loading || (loading && !current?.response) ? (
              <div className={styles.loading} role="status">
                <span className={styles.loadingDots} aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span>{ASSISTANT_LOADING}</span>
              </div>
            ) : null}

            {current && !current.loading && current.response ? (
              <div key={current.id} className={styles.answerFrame}>
                {queryRef ? (
                  <p className={styles.queryRef}>{queryRef}</p>
                ) : null}
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
                  goalClarificationResolvedLabel={
                    goalClarificationResolvedLabel
                  }
                />
              </div>
            ) : null}

            {v5ShadowClarification ? (
              <div
                className={styles.v5GoalShadow}
                data-testid="v5-goal-shadow-clarification"
                data-shadow="v5-goal"
              >
                <p className={styles.v5GoalShadowMark}>
                  V5 GoalSpec · shadow
                </p>
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
                  goalClarificationResolvedLabel={
                    goalClarificationResolvedLabel
                  }
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
        </div>
      </div>
    </ModalPortal>
  )
}
