import { Button } from '@/components/ui/Button'
import { getVariableDef } from '@/features/documents/registry/variableRegistry'
import type { DetectedField } from '../types'
import { VariablePicker } from './VariablePicker'
import styles from '../MappingWizard.module.css'

function confidenceLabel(field: DetectedField): string {
  if (typeof field.confidenceScore === 'number') {
    return `${Math.round(field.confidenceScore * 100)}%`
  }
  if (field.suggestionReason) {
    const m = field.suggestionReason.match(/(\d+)\s*%/)
    if (m) return `${m[1]}%`
  }
  if (field.confidence === 'high') return 'wysoka'
  if (field.confidence === 'medium') return 'średnia'
  if (field.confidence === 'low') return 'niska'
  return '—'
}

export function FieldMappingRow({
  field,
  selected,
  onSelect,
  onMap,
  onAccept,
  onIgnore,
}: {
  field: DetectedField
  selected?: boolean
  onSelect?: () => void
  onMap: (mappedKey: string | null) => void
  onAccept?: () => void
  onIgnore: () => void
}) {
  const sourceKey = field.mappedKey ?? field.suggestedKey
  const def = sourceKey ? getVariableDef(sourceKey) : undefined
  const conf = confidenceLabel(field)
  const pending = field.status === 'needs_configuration'

  return (
    <div
      className={`${styles.mappingRow} ${styles.suggestionCard} ${selected ? styles.fieldCardSelected : ''}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect?.()
        }
      }}
    >
      <div className={styles.mappingRowHead}>
        <div>
          <p className={styles.suggestionEyebrow}>Element kontraktu</p>
          <p className={styles.detectedLabel}>{field.label}</p>
        </div>
        <span
          className={
            field.status === 'connected'
              ? styles.statusPillSuccess
              : field.status === 'ignored'
                ? styles.statusPillNeutral
                : styles.statusPillWarning
          }
        >
          {conf}
        </span>
      </div>

      <dl className={styles.suggestionMeta}>
        <div>
          <dt>Wykryta wartość</dt>
          <dd className={styles.suggestionFound}>
            {field.rawToken?.trim() ? field.rawToken : '—'}
          </dd>
        </div>
        <div>
          <dt>Pole OurWed</dt>
          <dd className={styles.detectedSource}>
            {sourceKey ?? '—'}
            {def ? ` · ${def.labelPl}` : ''}
          </dd>
        </div>
        {(field.reason || field.suggestionReason) && (
          <div>
            <dt>Powód</dt>
            <dd>{field.reason ?? field.suggestionReason}</dd>
          </div>
        )}
      </dl>

      {pending && (
        <div className={styles.suggestionActions}>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!field.suggestedKey || !onAccept}
            onClick={(e) => {
              e.stopPropagation()
              onAccept?.()
            }}
          >
            Akceptuj
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onIgnore()
            }}
          >
            Ignoruj
          </Button>
        </div>
      )}

      <label
        className={styles.mappingFieldLabel}
        onClick={(e) => e.stopPropagation()}
      >
        {pending ? 'Zmień pole' : 'Pole OurWed'}
        <VariablePicker
          value={field.mappedKey ?? field.suggestedKey}
          onChange={(key) => onMap(key)}
        />
      </label>

      {field.status === 'connected' && (
        <button
          type="button"
          className={styles.ignoreLink}
          onClick={(e) => {
            e.stopPropagation()
            onIgnore()
          }}
        >
          Ignoruj
        </button>
      )}

      {field.status === 'ignored' && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            if (field.suggestedKey) onMap(field.suggestedKey)
          }}
        >
          Przywróć
        </Button>
      )}
    </div>
  )
}
