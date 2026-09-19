import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { ArrowUp, Search } from 'lucide-react'
import { ASSISTANT_SUBMIT_LABEL } from '../copy'
import styles from './Assistant.module.css'

export type AssistantComposerPlacement = 'command' | 'dock' | 'welcome' | 'empty'

/**
 * Shared composer — same 54px pill geometry for empty + conversation.
 * Grid centers icon / text / send on the single-line optical axis.
 *
 * Phase 2J.1: first-tap focuses the real textarea in the same trusted gesture.
 * Icon is pointer-events:none; pill surface sync-focuses without delayed timers.
 */
export function AssistantComposer({
  placement,
  draft,
  onDraftChange,
  onSubmit,
  disabled,
  canSubmit,
  inputRef,
  placeholder,
  lineCount = 1,
}: {
  placement: AssistantComposerPlacement
  draft: string
  onDraftChange: (value: string) => void
  onSubmit: () => void
  disabled: boolean
  canSubmit: boolean
  inputRef: RefObject<HTMLTextAreaElement | null>
  placeholder: string
  /** Measured visual lines — drives send alignment for tall composers. */
  lineCount?: number
}) {
  const wrapClass =
    placement === 'empty'
      ? styles.composerEmpty
      : placement === 'dock'
        ? styles.composerDock
        : placement === 'welcome'
          ? styles.composerWelcome
          : styles.composerWrap

  const align =
    lineCount >= 3 ? ('end' as const) : ('center' as const)

  function focusTextareaFromGesture(e: ReactPointerEvent<HTMLElement>) {
    if (disabled) return
    const target = e.target as HTMLElement | null
    if (!target) return
    // Send button owns its pointer events.
    if (target.closest('[data-testid="assistant-send"]')) return
    const input = inputRef.current
    if (!input || input.disabled) return
    // Already focused — let native caret placement proceed.
    if (document.activeElement === input) return
    // Same trusted user gesture — native focus (opens iOS keyboard).
    // Do NOT use preventScroll focus options here; that fights Safari keyboard.
    input.focus()
  }

  return (
    <div
      className={wrapClass}
      data-testid="assistant-composer-wrap"
      data-placement={placement}
      data-composer-base-height="54"
    >
      <div
        className={styles.composer}
        data-composer-shape="pill"
        data-composer-align={align}
        data-lines={lineCount}
        onPointerDown={focusTextareaFromGesture}
      >
        <span className={styles.composerIconSlot} aria-hidden>
          <Search className={styles.composerSearchIcon} strokeWidth={1.75} />
        </span>
        <textarea
          ref={inputRef}
          className={styles.composerInput}
          rows={1}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          data-autofocus="true"
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSubmit()
            }
          }}
          data-testid="assistant-composer"
          aria-label={placeholder}
        />
        {/* Future Voice — trailing slot reserved; no mic UI */}
        <div className={styles.composerTrailing} data-assistant-composer-trailing>
          <button
            type="button"
            className={styles.sendIconButton}
            disabled={!canSubmit}
            onClick={onSubmit}
            aria-label={ASSISTANT_SUBMIT_LABEL}
            data-testid="assistant-send"
          >
            <ArrowUp className={styles.sendIcon} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
