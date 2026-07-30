/**
 * Compact radio-card template selector for Pre-Wedding prepare flow.
 */

import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { countAnswerableQuestions } from '@/features/prewedding/templateSchemaUtils'
import type { QuestionnaireTemplate } from '@/types/preweddingQuestionnaire'
import styles from './PreWeddingTemplateSelectDialog.module.css'

interface Props {
  templates: QuestionnaireTemplate[]
  defaultTemplateId?: string | null
  onCancel: () => void
  onConfirm: (templateId: string) => void
  busy?: boolean
}

export function PreWeddingTemplateSelectDialog({
  templates,
  defaultTemplateId,
  onCancel,
  onConfirm,
  busy,
}: Props) {
  const titleId = useId()
  const initial =
    defaultTemplateId && templates.some((t) => t.id === defaultTemplateId)
      ? defaultTemplateId
      : templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? ''
  const [selectedId, setSelectedId] = useState(initial)

  useEffect(() => {
    setSelectedId(initial)
  }, [initial])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className={styles.backdrop} role="presentation" onClick={onCancel}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        data-testid="prewedding-template-select-dialog"
      >
        <h2 id={titleId} className={styles.title}>
          Wybierz ankietę przedślubną
        </h2>
        <p className={styles.lead}>
          Wybierz szablon, który chcesz przygotować dla tej pary.
        </p>

        <div className={styles.list} role="radiogroup" aria-label="Szablony">
          {templates.map((t) => {
            const questions = countAnswerableQuestions(t.schema)
            const checked = selectedId === t.id
            return (
              <label
                key={t.id}
                className={checked ? styles.cardSelected : styles.card}
                data-testid="template-select-option"
              >
                <input
                  type="radio"
                  name="prewedding-template"
                  value={t.id}
                  checked={checked}
                  onChange={() => setSelectedId(t.id)}
                  className={styles.radio}
                />
                <span className={styles.cardBody}>
                  <span className={styles.cardName}>
                    {t.name}
                    {t.isDefault ? (
                      <span className={styles.badge}>Domyślna</span>
                    ) : null}
                  </span>
                  <span className={styles.cardMeta}>
                    {questions} {questions === 1 ? 'pytanie' : 'pytań'}
                  </span>
                </span>
              </label>
            )
          })}
        </div>

        <div className={styles.actions}>
          <Link to="/ankiety" className={styles.manageLink}>
            Zarządzaj ankietami
          </Link>
          <div className={styles.actionBtns}>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              Anuluj
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!selectedId || busy}
              onClick={() => onConfirm(selectedId)}
              data-testid="confirm-template-select"
            >
              {busy ? 'Przygotowywanie…' : 'Użyj wybranej'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
