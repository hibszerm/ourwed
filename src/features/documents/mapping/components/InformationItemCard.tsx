import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { DetectedField } from '../types'
import {
  INFO_DATA_SOURCE_LABELS,
  informationConnectionOptions,
  informationDataSource,
  informationTitle,
  type InfoDataSourceKind,
} from '../information/informationModel'
import styles from '../MappingWizard.module.css'

function sourceTone(kind: InfoDataSourceKind): string {
  if (kind === 'unconnected') return styles.infoSourceUnconnected
  return styles.infoSourceConnected
}

export function InformationItemCard({
  field,
  selected,
  onSelect,
  onConnect,
  onConfirm,
  onIgnore,
}: {
  field: DetectedField
  selected?: boolean
  onSelect?: () => void
  onConnect: (registryKey: string | null) => void
  onConfirm?: () => void
  onIgnore: () => void
}) {
  const [open, setOpen] = useState(Boolean(selected))
  const title = informationTitle(field)
  const source = informationDataSource(field)
  const sourceLabel = INFO_DATA_SOURCE_LABELS[source]
  const pending = field.status === 'needs_configuration'
  const confirmed = field.status === 'connected'

  useEffect(() => {
    if (selected) setOpen(true)
  }, [selected])

  return (
    <article
      className={`${styles.infoCard} ${selected ? styles.fieldCardSelected : ''}`}
      data-field-id={field.id}
    >
      <button
        type="button"
        className={styles.infoCardHead}
        onClick={() => {
          onSelect?.()
          setOpen((v) => !v)
        }}
      >
        <span className={styles.infoCardChevron} aria-hidden>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <span className={styles.infoCardTitleBlock}>
          <span className={styles.infoCardTitle}>{title}</span>
          {field.rawToken?.trim() ? (
            <span className={styles.infoCardExcerpt}>{field.rawToken}</span>
          ) : null}
        </span>
        <span className={`${styles.infoSourcePill} ${sourceTone(source)}`}>
          {sourceLabel}
        </span>
      </button>

      {open && (
        <div className={styles.infoCardBody}>
          {source === 'unconnected' ? (
            <p className={styles.infoUnconnectedHint}>
              Ta informacja nie jest jeszcze podłączona. Połącz ją z ankietą,
              CRM lub ustawieniami studia — albo pomiń, jeśli nie jest
              potrzebna.
            </p>
          ) : (
            <p className={styles.infoConnectedHint}>
              Źródło danych: <strong>{sourceLabel}</strong>
              {confirmed ? ' · potwierdzone' : ''}
            </p>
          )}

          <label
            className={styles.mappingFieldLabel}
            onClick={(e) => e.stopPropagation()}
          >
            Skąd brać tę informację
            <select
              className={styles.variableSelect}
              value={field.mappedKey ?? field.suggestedKey ?? ''}
              onChange={(e) => onConnect(e.target.value || null)}
            >
              <option value="">Niepołączone — wybierz źródło…</option>
              {informationConnectionOptions().map((group) => (
                <optgroup key={group.groupLabel} label={group.groupLabel}>
                  {group.options.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label} · {INFO_DATA_SOURCE_LABELS[opt.source]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className={styles.suggestionActions}>
            {pending && (field.suggestedKey || field.mappedKey) && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onConfirm?.()
                }}
              >
                Potwierdź
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onIgnore()
              }}
            >
              Pomiń
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}
