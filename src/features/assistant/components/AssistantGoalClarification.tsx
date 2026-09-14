/**
 * U3 — Inline GoalSpec clarification UI (presentation only).
 * Semantic value comes from option.value, never from label text.
 */

import { ArrowRight } from 'lucide-react'
import styles from './Assistant.module.css'
import type { GoalClarificationViewModel } from '../v4/goalSpec/goalClarificationHostAdapter'

export function AssistantGoalClarification({
  view,
  busy = false,
  resolvedLabel = null,
  onSelect,
}: {
  view: GoalClarificationViewModel
  busy?: boolean
  /** When set, options are replaced by a compact resolved presentation. */
  resolvedLabel?: string | null
  onSelect: (selectedValue: string) => void
}) {
  if (resolvedLabel) {
    return (
      <div
        className={styles.result}
        data-testid="goal-clarification-resolved"
      >
        <p className={styles.choicePrompt}>{view.question}</p>
        <p className={styles.textMessage}>Wybrano: {resolvedLabel}</p>
      </div>
    )
  }

  return (
    <div
      className={styles.result}
      data-testid="goal-clarification"
      data-clarification-id={view.clarificationId}
      data-slot={view.slot}
    >
      <p className={styles.choicePrompt} id={`gcl-q-${view.clarificationId}`}>
        {view.question}
      </p>
      <ul
        className={styles.choiceList}
        role="list"
        aria-labelledby={`gcl-q-${view.clarificationId}`}
      >
        {view.options.map((opt) => (
          <li key={String(opt.value)}>
            <button
              type="button"
              className={styles.choiceButton}
              disabled={busy}
              aria-label={opt.label}
              data-testid="goal-clarification-option"
              data-selected-value={String(opt.value)}
              onClick={() => onSelect(String(opt.value))}
            >
              <span className={styles.choiceText}>
                <span className={styles.choiceTitle}>{opt.label}</span>
              </span>
              <ArrowRight className={styles.choiceArrow} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
