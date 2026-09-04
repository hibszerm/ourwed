import { Fragment, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils/dates'
import { parseImportMoney } from '../parseMoney'
import { reviewDateInputValue } from '../reviewDateField'
import type { WeddingImportReviewRow } from '../types'
import {
  REVIEW_FILTERS,
  REVIEW_TONE_LABEL,
  contactLines,
  countReviewTones,
  filterReviewRows,
  formatImportAmount,
  humanizeImportIssue,
  importWriteCaption,
  importWriteCtaLabel,
  missingAmountNotice,
  reviewHeadline,
  reviewTone,
  selectedImportCount,
  selectedMissingAmountCount,
  visibleImportIssues,
  type ImportReviewFilter,
} from '../importPresentation'
import styles from './importWorkspace.module.css'

const REVIEW_DESKTOP_QUERY = '(min-width: 1024px)'

function useImportReviewDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth >= 1024
  })

  useEffect(() => {
    const media = window.matchMedia(REVIEW_DESKTOP_QUERY)
    const sync = () => setDesktop(window.innerWidth >= 1024)
    sync()
    media.addEventListener('change', sync)
    window.addEventListener('resize', sync)
    return () => {
      media.removeEventListener('change', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  return desktop
}

type ImportReviewStepProps = {
  rows: WeddingImportReviewRow[]
  filter: ImportReviewFilter
  editingRowId: string | null
  importing: boolean
  onFilterChange: (filter: ImportReviewFilter) => void
  onToggleRow: (rowId: string, selected: boolean) => void
  onUpdateRow: (rowId: string, patch: Partial<WeddingImportReviewRow>) => void
  onEditRow: (rowId: string | null) => void
  onDuplicateDecision: (rowId: string, decision: 'skip' | 'import_anyway') => void
  onBack: () => void
  onImport: () => void
}

function amountLabel(row: WeddingImportReviewRow): string {
  if (row.priceState === 'invalid') return 'Nieprawidłowa kwota'
  if (row.contractValue == null) return '0 zł'
  return formatImportAmount(row.contractValue)
}

function dateLabel(row: WeddingImportReviewRow): string {
  if (!row.weddingDate) return 'Nieprawidłowa data'
  return formatDate(row.weddingDate)
}

function DuplicateActions({
  row,
  onDuplicateDecision,
  compact = false,
}: {
  row: WeddingImportReviewRow
  onDuplicateDecision: (rowId: string, decision: 'skip' | 'import_anyway') => void
  compact?: boolean
}) {
  if (row.status !== 'possible_duplicate') return null
  const overridden = row.duplicateDecision === 'import_anyway'
  if (compact) {
    return (
      <>
        <button
          type="button"
          className={styles.rowAction}
          onClick={() => onDuplicateDecision(row.id, 'skip')}
        >
          Pomiń
        </button>
        <button
          type="button"
          className={styles.rowAction}
          data-active={overridden ? 'true' : 'false'}
          onClick={() => onDuplicateDecision(row.id, 'import_anyway')}
        >
          Importuj mimo to
        </button>
      </>
    )
  }
  return (
    <div className={styles.duplicateBlock}>
      <div className={styles.rowActions}>
        <Button
          type="button"
          size="sm"
          variant={overridden ? 'ghost' : 'secondary'}
          onClick={() => onDuplicateDecision(row.id, 'skip')}
        >
          Pomiń
        </Button>
        <Button
          type="button"
          size="sm"
          variant={overridden ? 'primary' : 'secondary'}
          onClick={() => onDuplicateDecision(row.id, 'import_anyway')}
        >
          Importuj mimo to
        </Button>
      </div>
      {overridden ? (
        <p className={styles.hint}>Zostanie zaimportowany mimo duplikatu.</p>
      ) : null}
    </div>
  )
}

function IssueList({ row }: { row: WeddingImportReviewRow }) {
  return (
    <>
      {visibleImportIssues(row).map((issue) => (
        <p key={issue.code} className={styles.issue}>
          {humanizeImportIssue(issue, row)}
        </p>
      ))}
    </>
  )
}

function RecordEditor({
  row,
  onUpdateRow,
}: {
  row: WeddingImportReviewRow
  onUpdateRow: (rowId: string, patch: Partial<WeddingImportReviewRow>) => void
}) {
  const [amountText, setAmountText] = useState(
    row.contractValue == null ? '' : String(row.contractValue),
  )

  function commitAmount(text: string) {
    const trimmed = text.trim()
    if (!trimmed) {
      onUpdateRow(row.id, { contractValue: null, priceState: 'empty' })
      return
    }
    const parsed = parseImportMoney(trimmed)
    if (parsed == null) {
      onUpdateRow(row.id, { contractValue: null, priceState: 'invalid' })
      return
    }
    setAmountText(String(parsed))
    onUpdateRow(row.id, {
      contractValue: parsed,
      priceState: parsed === 0 ? 'explicit_zero' : 'value',
    })
  }

  function nativeAmountValue(event: { nativeEvent: Event; currentTarget: HTMLInputElement }) {
    const fromNative = (event.nativeEvent.target as HTMLInputElement | null)?.value
    return fromNative ?? event.currentTarget.value
  }

  return (
    <div className={styles.editor}>
      <Input
        label="Data"
        type="date"
        value={reviewDateInputValue(row.weddingDate)}
        onChange={(event) =>
          onUpdateRow(row.id, { weddingDate: event.target.value || null })
        }
      />
      <Input
        label="Para"
        value={row.coupleDisplayName}
        onChange={(event) =>
          onUpdateRow(row.id, {
            coupleDisplayName: event.target.value,
            partner1Name: event.target.value,
          })
        }
      />
      <Input
        label="Wartość"
        inputMode="decimal"
        value={amountText}
        onChange={(event) => setAmountText(event.target.value)}
        onBlur={(event) => commitAmount(nativeAmountValue(event))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commitAmount(nativeAmountValue(event))
          }
        }}
      />
      <Input
        label="Telefon"
        value={row.phone ?? ''}
        onChange={(event) => onUpdateRow(row.id, { phone: event.target.value })}
      />
      <Input
        label="E-mail"
        value={row.email ?? ''}
        onChange={(event) => onUpdateRow(row.id, { email: event.target.value })}
      />
      {row.packageName || row.note?.includes('Pakiet z importu:') ? (
        <p className={styles.hint}>Pakiet: {row.packageName ?? 'bez dopasowania w katalogu'}</p>
      ) : null}
    </div>
  )
}

export function ImportReviewStep({
  rows,
  filter,
  editingRowId,
  importing,
  onFilterChange,
  onToggleRow,
  onUpdateRow,
  onEditRow,
  onDuplicateDecision,
  onBack,
  onImport,
}: ImportReviewStepProps) {
  const desktop = useImportReviewDesktop()
  const counts = countReviewTones(rows)
  const visible = filterReviewRows(rows, filter)
  const selectedCount = selectedImportCount(rows)
  const missingAmount = selectedMissingAmountCount(rows)
  const summary = reviewHeadline(counts)

  useEffect(() => {
    if (filter === 'all') return
    if (counts[filter] === 0) onFilterChange('all')
  }, [counts, filter, onFilterChange])

  function editLabel(row: WeddingImportReviewRow, editing: boolean) {
    if (row.status === 'invalid') return editing ? 'Zamknij' : 'Popraw dane'
    return editing ? 'Zamknij' : 'Edytuj'
  }

  return (
    <section className={styles.stack} aria-labelledby="import-review-heading">
      <div>
        <h2 id="import-review-heading" className={styles.heading}>
          Sprawdź dane
        </h2>
        {summary ? (
          <p className={styles.summary}>{summary}</p>
        ) : (
          <p className={styles.empty}>Brak rekordów do importu w tym pliku.</p>
        )}
      </div>

      {rows.length > 0 ? (
        <ul className={styles.filters}>
          {REVIEW_FILTERS.map((item) => {
            const count =
              item.id === 'all' ? counts.total : counts[item.id]
            if (item.id !== 'all' && count === 0) return null
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.filter}
                  aria-pressed={filter === item.id}
                  onClick={() => onFilterChange(item.id)}
                >
                  {item.label}
                  {count > 0 ? ` ${count}` : ''}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {visible.length === 0 && rows.length > 0 ? (
        <p className={styles.empty}>Brak rekordów w tym widoku.</p>
      ) : null}

      {desktop ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Wybór</th>
                <th>Status</th>
                <th>Para</th>
                <th>Data</th>
                <th>Wartość</th>
                <th>Pakiet</th>
                <th>Kontakt</th>
                <th>Uwagi</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const tone = reviewTone(row.status)
                const editing = editingRowId === row.id
                return (
                  <Fragment key={row.id}>
                    <tr
                      data-status={row.status}
                      data-selected={row.selectedForImport ? 'true' : 'false'}
                    >
                      <td>
                        <label className={styles.selectLabel}>
                          <input
                            type="checkbox"
                            checked={row.selectedForImport}
                            disabled={row.status === 'invalid'}
                            aria-label={`Importuj ${row.coupleDisplayName || 'wiersz'}`}
                            onChange={(event) => onToggleRow(row.id, event.target.checked)}
                          />
                        </label>
                      </td>
                      <td>
                        <span className={styles.tone} data-tone={tone}>
                          {REVIEW_TONE_LABEL[tone]}
                        </span>
                      </td>
                      <td>
                        <div className={styles.couple}>{row.coupleDisplayName || '—'}</div>
                      </td>
                      <td className={styles.dateCell}>{dateLabel(row)}</td>
                      <td className={styles.amountCell}>{amountLabel(row)}</td>
                      <td className={styles.muted}>{row.packageName ?? '—'}</td>
                      <td>
                        <div className={styles.contact}>
                          {contactLines(row).length
                            ? contactLines(row).map((line) => <span key={line}>{line}</span>)
                            : '—'}
                        </div>
                      </td>
                      <td>
                        <IssueList row={row} />
                        <DuplicateActions row={row} onDuplicateDecision={onDuplicateDecision} />
                        <div className={styles.rowActions}>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => onEditRow(editing ? null : row.id)}
                          >
                            {editLabel(row, editing)}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {editing ? (
                      <tr className={styles.editorRow}>
                        <td colSpan={8}>
                          <RecordEditor key={row.id} row={row} onUpdateRow={onUpdateRow} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.cards}>
          {visible.map((row) => {
            const tone = reviewTone(row.status)
            const editing = editingRowId === row.id
            const overridden = row.duplicateDecision === 'import_anyway'
            return (
              <article key={row.id} className={styles.card} data-status={row.status}>
                <div className={styles.cardTop}>
                  <label className={styles.selectLabel}>
                    <input
                      type="checkbox"
                      checked={row.selectedForImport}
                      disabled={row.status === 'invalid'}
                      aria-label={`Importuj ${row.coupleDisplayName || 'wiersz'}`}
                      onChange={(event) => onToggleRow(row.id, event.target.checked)}
                    />
                    <span className={styles.tone} data-tone={tone}>
                      {REVIEW_TONE_LABEL[tone]}
                    </span>
                  </label>
                  <button
                    type="button"
                    className={styles.rowAction}
                    data-priority={row.status === 'invalid' ? 'error' : undefined}
                    onClick={() => onEditRow(editing ? null : row.id)}
                  >
                    {editLabel(row, editing)}
                  </button>
                </div>
                <p className={styles.couple}>{row.coupleDisplayName || '—'}</p>
                <p className={styles.cardMeta}>
                  {dateLabel(row)} · {amountLabel(row)}
                </p>
                <IssueList row={row} />
                {row.status === 'possible_duplicate' ? (
                  <div className={styles.cardActions}>
                    <DuplicateActions
                      compact
                      row={row}
                      onDuplicateDecision={onDuplicateDecision}
                    />
                  </div>
                ) : null}
                {overridden && row.status === 'possible_duplicate' ? (
                  <p className={styles.hint}>Zostanie zaimportowany mimo duplikatu.</p>
                ) : null}
                {editing ? <RecordEditor key={row.id} row={row} onUpdateRow={onUpdateRow} /> : null}
              </article>
            )
          })}
        </div>
      )}

      {missingAmount > 0 && !editingRowId ? (
        <p className={styles.notice}>{missingAmountNotice(missingAmount)}</p>
      ) : null}

      {!editingRowId ? (
      <div className={styles.sticky}>
        <div className={styles.stickyCopy}>
          <p className={styles.stickyCount}>
            Wybrano {selectedCount} z {rows.length}{' '}
            {rows.length === 1 ? 'rekordu' : 'rekordów'}
          </p>
          <p className={styles.hint}>{importWriteCaption(selectedCount)}</p>
        </div>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onBack}>
            Wstecz
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={importing || selectedCount === 0}
            onClick={onImport}
          >
            {importing ? 'Importowanie…' : importWriteCtaLabel(selectedCount)}
          </Button>
        </div>
      </div>
      ) : null}
    </section>
  )
}
