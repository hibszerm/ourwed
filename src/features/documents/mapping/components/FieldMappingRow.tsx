import { Button } from '@/components/ui/Button'
import { getVariableDef } from '@/features/documents/registry/variableRegistry'
import type { DetectedField } from '../types'
import { VariablePicker } from './VariablePicker'
import styles from '../MappingWizard.module.css'

export function FieldMappingRow({
  field,
  onMap,
  onAccept,
  onIgnore,
}: {
  field: DetectedField
  onMap: (mappedKey: string | null) => void
  onAccept?: () => void
  onIgnore: () => void
}) {
  const sourceKey = field.mappedKey ?? field.suggestedKey
  const def = sourceKey ? getVariableDef(sourceKey) : undefined
  const isHeuristicPending =
    field.origin === 'heuristic' && field.status === 'needs_configuration'

  if (isHeuristicPending) {
    return (
      <div className={`${styles.mappingRow} ${styles.suggestionCard}`}>
        <div className={styles.mappingRowHead}>
          <div>
            <p className={styles.suggestionEyebrow}>Propozycja</p>
            <p className={styles.detectedLabel}>{field.label}</p>
          </div>
          <span className={styles.statusPillWarning}>
            {field.confidence === 'high'
              ? 'Wysoka pewność'
              : field.confidence === 'low'
                ? 'Niska pewność'
                : 'Średnia pewność'}
          </span>
        </div>

        <dl className={styles.suggestionMeta}>
          <div>
            <dt>Znaleziony tekst</dt>
            <dd className={styles.suggestionFound}>{field.rawToken}</dd>
          </div>
          <div>
            <dt>Sugerowane źródło</dt>
            <dd className={styles.detectedSource}>
              {field.suggestedKey}
              {def ? ` · ${def.labelPl}` : ''}
            </dd>
          </div>
          {field.suggestionReason && (
            <div>
              <dt>Powód</dt>
              <dd>{field.suggestionReason}</dd>
            </div>
          )}
        </dl>

        <div className={styles.suggestionActions}>
          <Button
            type="button"
            variant="primary"
            size="sm"
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

        <label className={styles.mappingFieldLabel}>
          Lub wybierz inne źródło
          <VariablePicker
            value={field.mappedKey}
            onChange={(key) => {
              onMap(key)
            }}
          />
        </label>
      </div>
    )
  }

  return (
    <div className={styles.mappingRow}>
      <div className={styles.mappingRowHead}>
        <div>
          <p className={styles.detectedLabel}>{field.label}</p>
          {field.rawToken && (
            <p className={styles.mappingToken}>{field.rawToken}</p>
          )}
        </div>
        {field.status === 'connected' ? (
          <span className={styles.statusPillSuccess}>Połączono</span>
        ) : field.status === 'ignored' ? (
          <span className={styles.statusPillNeutral}>Pominięto</span>
        ) : (
          <span className={styles.statusPillWarning}>Do konfiguracji</span>
        )}
      </div>

      <label className={styles.mappingFieldLabel}>
        Źródło w OurWed
        <VariablePicker value={field.mappedKey} onChange={onMap} />
      </label>

      {def && field.status === 'connected' && (
        <p className={styles.detectedSource}>
          {def.section} · {def.key}
        </p>
      )}

      {field.status !== 'ignored' && (
        <button
          type="button"
          className={styles.ignoreLink}
          onClick={(e) => {
            e.stopPropagation()
            onIgnore()
          }}
        >
          Pomiń ten obszar
        </button>
      )}
    </div>
  )
}
