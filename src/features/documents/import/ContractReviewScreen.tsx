import { useMemo, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  isCoupleFacingRegistryKey,
  isStudioFacingRegistryKey,
  registryPolishLabel,
} from '@/features/documents/ai/canonicalVariableIds'
import {
  DOCUMENT_VARIABLES,
  getVariableDef,
} from '@/features/documents/registry/variableRegistry'
import {
  findCatalogByRegistryKey,
  inferQuestionType,
} from '@/features/documents/questionnaire/questionCatalog'
import {
  packageKindDisplayLabel,
  polishQuestionTitle,
} from '@/features/documents/questionnaire/prepareReviewDraft'
import type {
  DraftQuestion,
  QuestionnaireDraft,
} from '@/features/documents/questionnaire'
import { getPackageSelectQuestion } from '@/lib/forms/contractQuestionCatalog'
import styles from './ContractReview.module.css'

function createQuestionFromRegistryKey(
  registryKey: string,
  order: number,
): DraftQuestion | null {
  const def = getVariableDef(registryKey)
  if (!def) return null

  const title = registryPolishLabel(registryKey)
  const catalog = findCatalogByRegistryKey(registryKey)

  if (catalog?.fieldKey === 'packageId') {
    const pkg = getPackageSelectQuestion([])
    return {
      id: pkg.id,
      enabled: true,
      title: pkg.label,
      description: pkg.description ?? '',
      placeholder: pkg.placeholder ?? '',
      required: pkg.required ?? true,
      type: 'select',
      fieldKey: 'packageId',
      contractLabel: title,
      registryKey: 'package.name',
      source: 'ourwed_configuration',
      reused: true,
      order,
      options: [],
    }
  }

  if (catalog) {
    return {
      id: String(catalog.id),
      enabled: true,
      title,
      description: catalog.description ?? '',
      placeholder: catalog.placeholder ?? '',
      required: catalog.required ?? false,
      type: catalog.type,
      fieldKey: catalog.fieldKey,
      contractLabel: title,
      registryKey,
      source: isStudioFacingRegistryKey(registryKey) ? 'studio' : 'couple',
      reused: true,
      order,
    }
  }

  return {
    id: `q-added-${registryKey.replace(/\./g, '-')}`,
    enabled: true,
    title,
    description: '',
    placeholder: '',
    required: false,
    type: inferQuestionType(registryKey, title),
    fieldKey: null,
    contractLabel: title,
    registryKey,
    source: isStudioFacingRegistryKey(registryKey) ? 'studio' : 'couple',
    reused: false,
    order,
  }
}

function isCoupleRow(q: DraftQuestion): boolean {
  if (q.source === 'ourwed_configuration') return true
  if (q.fieldKey === 'packageId' || q.id === 'q-package') return true
  if (q.registryKey) return isCoupleFacingRegistryKey(q.registryKey)
  return q.source === 'couple'
}

function isStudioRow(q: DraftQuestion): boolean {
  if (q.registryKey && isCoupleFacingRegistryKey(q.registryKey)) return false
  if (q.source === 'studio' || q.source === 'system') return true
  if (q.registryKey) return isStudioFacingRegistryKey(q.registryKey)
  return false
}

/**
 * Document configuration review — sole source of truth for the questionnaire.
 * Section 1 (couple) is editable. Studio + package sections are read-only presence.
 */
export function ContractReviewScreen({
  templateName,
  draft,
  saving,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  templateName: string
  draft: QuestionnaireDraft
  saving: boolean
  error: string | null
  onChange: (next: QuestionnaireDraft) => void
  onCancel: () => void
  onSave: () => void
}) {
  const [addOpen, setAddOpen] = useState(false)

  const detectedPackageLabel = packageKindDisplayLabel(
    draft.suggestedPackageKind,
    draft.suggestedPackageLabel,
  )

  const usedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const q of draft.questions) {
      if (q.registryKey) keys.add(q.registryKey)
      if (q.fieldKey === 'packageId') keys.add('package.name')
    }
    return keys
  }, [draft.questions])

  const coupleAddOptions = useMemo(
    () =>
      DOCUMENT_VARIABLES.filter(
        (v) => isCoupleFacingRegistryKey(v.key) && !usedKeys.has(v.key),
      ).map((v) => ({ key: v.key, label: v.labelPl })),
    [usedKeys],
  )

  const coupleRows = useMemo(
    () =>
      draft.questions
        .filter(isCoupleRow)
        .slice()
        .sort((a, b) => a.order - b.order),
    [draft.questions],
  )

  const studioRows = useMemo(
    () =>
      draft.questions
        .filter(isStudioRow)
        .slice()
        .sort((a, b) => a.order - b.order),
    [draft.questions],
  )

  const packageRows = useMemo(
    () =>
      [...draft.packageVariables].sort((a, b) =>
        a.label.localeCompare(b.label, 'pl'),
      ),
    [draft.packageVariables],
  )

  function addVariable(registryKey: string) {
    const order =
      draft.questions.reduce((m, q) => Math.max(m, q.order), 0) + 1
    const created = createQuestionFromRegistryKey(registryKey, order)
    if (!created) return
    if (draft.questions.some((q) => q.id === created.id)) return
    if (
      created.registryKey &&
      draft.questions.some((q) => q.registryKey === created.registryKey)
    ) {
      return
    }
    onChange({
      ...draft,
      questions: [...draft.questions, created],
    })
    setAddOpen(false)
  }

  function patchQuestionEnabled(id: string, enabled: boolean) {
    onChange({
      ...draft,
      questions: draft.questions.map((q) => {
        if (q.id !== id) return q
        if (!enabled) return { ...q, enabled: false }
        if (
          q.fieldKey === 'packageId' ||
          q.registryKey === 'package.name' ||
          q.id === 'q-package'
        ) {
          return {
            ...q,
            enabled: true,
            source: 'ourwed_configuration',
            options: [],
          }
        }
        if (q.registryKey && isCoupleFacingRegistryKey(q.registryKey)) {
          return { ...q, enabled: true, source: 'couple' }
        }
        if (isCoupleRow(q)) {
          return { ...q, enabled: true, source: 'couple' }
        }
        return { ...q, enabled: true }
      }),
    })
  }

  return (
    <div className={styles.review}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Konfiguracja danych</p>
        <h1 className={styles.title}>Sprawdź przygotowaną ankietę</h1>
        <p className={styles.subtitle}>
          Włącz pytania dla pary. Dane ze studia i z pakietu wypełnią się
          automatycznie — para ich nie uzupełnia.
        </p>
      </header>

      <section className={styles.block} aria-labelledby="contract-summary">
        <h2 id="contract-summary" className={styles.blockTitle}>
          Podsumowanie
        </h2>
        <dl className={styles.summaryList}>
          <div>
            <dt>Umowa</dt>
            <dd>{templateName}</dd>
          </div>
          <div>
            <dt>Wykryty rodzaj pakietu</dt>
            <dd className={styles.detectedPackage}>
              {detectedPackageLabel ? (
                <>
                  <Check size={16} strokeWidth={2} aria-hidden />
                  {detectedPackageLabel}
                </>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>
        <p className={styles.fieldHint}>
          To tylko wskazówka z treści umowy. Konkretny pakiet ze Studio → Pakiety
          para wybierze w ankiecie.
        </p>
      </section>

      <section className={styles.block} aria-labelledby="questionnaire-name">
        <h2 id="questionnaire-name" className={styles.blockTitle}>
          Ankieta
        </h2>
        <label className={styles.field}>
          Nazwa ankiety
          <input
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="np. Umowa fotograficzna"
          />
        </label>
        <p className={styles.fieldHint}>
          Ta nazwa pojawi się w Ankiety → Generuj ankietę.
        </p>
      </section>

      <div className={styles.docSections}>
        <section className={styles.docSection} aria-labelledby="couple-section">
          <header className={styles.columnHeader}>
            <h2 id="couple-section" className={styles.columnTitle}>
              Dane Pary Młodej
            </h2>
            <p className={styles.columnHint}>
              Te pytania trafią do ankiety i później zostaną wstawione do umowy.
            </p>
          </header>
          {coupleRows.length === 0 ? (
            <p className={styles.emptyColumn}>Brak pozycji</p>
          ) : (
            <ul className={styles.infoList}>
              {coupleRows.map((question) => {
                const label = polishQuestionTitle(question)
                const description = question.description?.trim()
                return (
                  <li key={question.id} className={styles.infoRow}>
                    <label className={styles.enableLabel}>
                      <input
                        type="checkbox"
                        checked={question.enabled}
                        onChange={(e) =>
                          patchQuestionEnabled(question.id, e.target.checked)
                        }
                      />
                      <span className={styles.rowMain}>
                        <span className={styles.rowLabel}>{label}</span>
                        {description ? (
                          <span className={styles.rowDescription}>
                            {description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
          {coupleAddOptions.length > 0 ? (
            addOpen ? (
              <label className={styles.field}>
                Dodaj
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const key = e.target.value
                    if (key) addVariable(key)
                  }}
                >
                  <option value="" disabled>
                    Wybierz z listy…
                  </option>
                  {coupleAddOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.addCancel}
                  onClick={() => setAddOpen(false)}
                >
                  Anuluj
                </button>
              </label>
            ) : (
              <button
                type="button"
                className={styles.addButton}
                onClick={() => setAddOpen(true)}
              >
                <Plus size={16} aria-hidden />
                Dodaj
              </button>
            )
          ) : null}
        </section>

        <section className={styles.docSection} aria-labelledby="studio-section">
          <header className={styles.columnHeader}>
            <h2 id="studio-section" className={styles.columnTitle}>
              Dane pobierane z ustawień studia
            </h2>
            <p className={styles.columnHint}>
              Para nigdy tego nie uzupełnia. Wartości biorą się automatycznie z
              ustawień studia.
            </p>
          </header>
          {studioRows.length === 0 ? (
            <p className={styles.emptyColumn}>Brak pozycji</p>
          ) : (
            <ul className={styles.infoList}>
              {studioRows.map((question) => (
                <li key={question.id} className={styles.infoRow}>
                  <div className={styles.readOnlyRow}>
                    <Check
                      size={16}
                      strokeWidth={2}
                      className={styles.readOnlyMark}
                      aria-hidden
                    />
                    <span className={styles.rowMain}>
                      <span className={styles.rowLabel}>
                        {polishQuestionTitle(question)}
                      </span>
                      {question.description?.trim() ? (
                        <span className={styles.rowDescription}>
                          {question.description.trim()}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className={styles.docSection}
          aria-labelledby="package-section"
        >
          <header className={styles.columnHeader}>
            <h2 id="package-section" className={styles.columnTitle}>
              Dane pobierane z wybranego pakietu
            </h2>
            <p className={styles.columnHint}>
              Wartości z pakietu wybranego przez parę w ankiecie. Bez ręcznych
              wartości i bez danych z AI.
            </p>
          </header>
          {packageRows.length === 0 ? (
            <p className={styles.emptyColumn}>Brak pozycji</p>
          ) : (
            <ul className={styles.infoList}>
              {packageRows.map((item) => (
                <li key={item.id} className={styles.infoRow}>
                  <div className={styles.readOnlyRow}>
                    <Check
                      size={16}
                      strokeWidth={2}
                      className={styles.readOnlyMark}
                      aria-hidden
                    />
                    <span className={styles.rowLabel}>{item.label}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <footer className={styles.footer}>
        <Button
          type="button"
          variant="ghost"
          disabled={saving}
          onClick={onCancel}
        >
          Anuluj
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? 'Zapisywanie…' : 'Zapisz ankietę'}
        </Button>
      </footer>
    </div>
  )
}
