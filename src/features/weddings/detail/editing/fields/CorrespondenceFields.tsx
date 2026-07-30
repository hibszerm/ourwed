import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import {
  CORRESPONDENCE_CHANNEL_LABELS,
  CORRESPONDENCE_CHANNELS,
  correspondenceValueFieldMeta,
  createCorrespondenceEntryId,
  type CorrespondenceChannel,
  type WeddingCorrespondenceEntry,
} from '@/features/weddings/correspondence/weddingCorrespondence'
import styles from '../WeddingEditorFields.module.css'

type CorrespondenceDraftRow = {
  id: string
  channel: CorrespondenceChannel | ''
  value: string
}

interface CorrespondenceFieldsProps {
  correspondence: WeddingCorrespondenceEntry[] | null | undefined
  onChange: (next: WeddingCorrespondenceEntry[]) => void
  error?: string | null
  errorRowIndex?: number | null
}

function toDraftRows(
  entries: WeddingCorrespondenceEntry[] | null | undefined,
): CorrespondenceDraftRow[] {
  if (!entries?.length) return []
  return entries.map((e) => ({
    id: e.id,
    channel: e.channel,
    value: e.value,
  }))
}

/**
 * Repeatable couple correspondence rows — each channel has its own value.
 * Changing channel clears the row value so stale handles are never mislabeled.
 * Empty draft rows stay local until a channel is chosen.
 */
export function CorrespondenceFields({
  correspondence,
  onChange,
  error = null,
  errorRowIndex = null,
}: CorrespondenceFieldsProps) {
  const [emptyDrafts, setEmptyDrafts] = useState<CorrespondenceDraftRow[]>([])
  const saved = toDraftRows(correspondence)
  const rows = [...saved, ...emptyDrafts]

  function commitSaved(next: CorrespondenceDraftRow[]) {
    onChange(
      next
        .filter((r) => r.channel)
        .map((r) => ({
          id: r.id,
          channel: r.channel as CorrespondenceChannel,
          value: r.value,
        })),
    )
  }

  function updateSavedRow(index: number, patch: Partial<CorrespondenceDraftRow>) {
    commitSaved(
      saved.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )
  }

  function addRow() {
    setEmptyDrafts((prev) => [
      ...prev,
      {
        id: createCorrespondenceEntryId(),
        channel: '',
        value: '',
      },
    ])
  }

  function removeRow(index: number) {
    if (index < saved.length) {
      commitSaved(saved.filter((_, i) => i !== index))
      return
    }
    const emptyIndex = index - saved.length
    setEmptyDrafts((prev) => prev.filter((_, i) => i !== emptyIndex))
  }

  function setChannel(index: number, next: CorrespondenceChannel | '') {
    if (index < saved.length) {
      // Clear value on channel change to avoid mislabeling stale data.
      if (!next) {
        commitSaved(saved.filter((_, i) => i !== index))
        return
      }
      updateSavedRow(index, { channel: next, value: '' })
      return
    }

    const emptyIndex = index - saved.length
    const draft = emptyDrafts[emptyIndex]
    if (!draft) return

    if (!next) {
      setEmptyDrafts((prev) =>
        prev.map((row, i) =>
          i === emptyIndex ? { ...row, channel: '', value: '' } : row,
        ),
      )
      return
    }

    setEmptyDrafts((prev) => prev.filter((_, i) => i !== emptyIndex))
    commitSaved([
      ...saved,
      { id: draft.id, channel: next, value: '' },
    ])
  }

  function setValue(index: number, value: string) {
    if (index < saved.length) {
      updateSavedRow(index, { value })
    }
  }

  return (
    <section
      className={styles.section}
      data-testid="correspondence-fields"
      aria-labelledby="correspondence-section-title"
    >
      <h3 id="correspondence-section-title" className={styles.sectionTitle}>
        Kontakt i korespondencja
      </h3>
      <p className={styles.muted}>
        Kanały, którymi kontaktujesz się z parą. Możesz dodać kilka wpisów —
        także tego samego typu.
      </p>

      {rows.length > 0 ? (
        <ul className={styles.list} data-testid="correspondence-rows">
          {rows.map((row, index) => {
            const meta = correspondenceValueFieldMeta(row.channel || null)
            const showError = Boolean(error && errorRowIndex === index)
            return (
              <li
                key={row.id}
                className={styles.listItem}
                data-testid={`correspondence-row-${index}`}
              >
                <Select
                  label="Kanał kontaktu"
                  value={row.channel}
                  onChange={(e) =>
                    setChannel(
                      index,
                      e.target.value as CorrespondenceChannel | '',
                    )
                  }
                  data-testid={`correspondence-channel-${index}`}
                >
                  <option value="">Wybierz kanał</option>
                  {CORRESPONDENCE_CHANNELS.map((id) => (
                    <option key={id} value={id}>
                      {CORRESPONDENCE_CHANNEL_LABELS[id]}
                    </option>
                  ))}
                </Select>
                {row.channel ? (
                  <Input
                    label={meta.label}
                    type={meta.type}
                    placeholder={meta.placeholder}
                    value={row.value}
                    error={showError ? (error ?? undefined) : undefined}
                    onChange={(e) => setValue(index, e.target.value)}
                    data-testid={`correspondence-value-${index}`}
                  />
                ) : null}
                {showError && !row.channel ? (
                  <p role="alert" className={styles.error}>
                    {error}
                  </p>
                ) : null}
                <div className={styles.rowActions}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(index)}
                    data-testid={`correspondence-remove-${index}`}
                  >
                    Usuń
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {error && (errorRowIndex == null || errorRowIndex < 0) ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}

      <div className={styles.rowActions}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addRow}
          data-testid="correspondence-add"
        >
          + Dodaj kanał kontaktu
        </Button>
      </div>
    </section>
  )
}
