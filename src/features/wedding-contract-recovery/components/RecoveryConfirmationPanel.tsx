import { Button } from '@/components/ui/Button'
import type {
  RecoveryFieldComparison,
  RecoveryProposal,
  RecoverySectionKey,
} from '../types'
import { PackageSnapshotCard } from './PackageSnapshotCard'
import styles from './RecoveryConfirmationPanel.module.css'

const CONFIRM_SECTION_ORDER: RecoverySectionKey[] = [
  'clients',
  'contact',
  'wedding',
  'locations',
  'finances',
  'package',
  'additional_services',
  'other',
]

const SECTION_LABELS: Record<RecoverySectionKey, string> = {
  clients: 'Dane klientów',
  contact: 'Kontakt',
  wedding: 'Ślub',
  locations: 'Miejsca',
  finances: 'Umowa i finanse',
  package: 'Pakiet z umowy',
  additional_services: 'Usługi dodatkowe',
  other: 'Pozostałe dane',
  source_document: 'Dokument źródłowy',
}

function formatValue(value: unknown): string {
  if (value == null || value === '') return 'Brak danych'
  return String(value)
}

export function RecoveryConfirmationPanel({
  proposal,
  fields,
  sourceFileName,
  sourceMimeType,
  sourceCreatedAt,
  includePackageSnapshot,
  error,
  applying,
  onBack,
  onApply,
}: {
  proposal: RecoveryProposal
  fields: RecoveryFieldComparison[]
  sourceFileName: string | null
  sourceMimeType?: string | null
  sourceCreatedAt?: string | null
  includePackageSnapshot: boolean
  error?: string | null
  applying: boolean
  onBack: () => void
  onApply: () => void
}) {
  const approved = fields.filter((f) => f.selectedAction === 'use_extracted')
  const keptConflicts = fields.filter(
    (f) => f.state === 'different' && f.selectedAction === 'keep_current',
  )
  const skipped = fields.filter(
    (f) =>
      f.state === 'invalid_extracted' ||
      f.state === 'unsupported' ||
      (f.state === 'missing_extracted' && f.selectedAction === 'skip'),
  )

  const grouped = CONFIRM_SECTION_ORDER.map((sectionKey) => ({
    sectionKey,
    label: SECTION_LABELS[sectionKey],
    fields: approved.filter((f) => f.sectionKey === sectionKey),
  })).filter((group) => group.fields.length > 0)

  const packageModel = proposal.packageSnapshotProposal
  const format = sourceMimeType?.includes('pdf')
    ? 'PDF'
    : sourceMimeType
      ? 'DOCX'
      : null
  const uploaded =
    sourceCreatedAt && !Number.isNaN(new Date(sourceCreatedAt).getTime())
      ? new Date(sourceCreatedAt).toLocaleString('pl-PL')
      : null

  return (
    <section className={styles.wrap}>
      <h2 className={styles.title}>Potwierdzenie zmian</h2>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>Dane, które zostaną zapisane</h3>
        {grouped.length === 0 ? (
          <p className={styles.muted}>
            Nie wybrano żadnych pól do zapisania
            {includePackageSnapshot && packageModel
              ? ' (poza pakietem z umowy).'
              : '.'}
          </p>
        ) : (
          grouped.map((group) => (
            <div key={group.sectionKey} className={styles.group}>
              <h4 className={styles.groupTitle}>{group.label}</h4>
              <ul className={styles.changeList}>
                {group.fields.map((field) => (
                  <li key={field.fieldKey} className={styles.changeItem}>
                    <p className={styles.fieldLabel}>{field.label}</p>
                    <p className={styles.transition}>
                      <span>{formatValue(field.currentValue)}</span>
                      <span className={styles.arrow} aria-hidden>
                        →
                      </span>
                      <strong>{formatValue(field.extractedValue)}</strong>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {keptConflicts.length > 0 ? (
        <section className={styles.block}>
          <h3 className={styles.blockTitle}>Pozostanie bez zmian</h3>
          <ul className={styles.plainList}>
            {keptConflicts.map((field) => (
              <li key={field.fieldKey}>
                {field.label} pozostanie: {formatValue(field.currentValue)}
              </li>
            ))}
          </ul>
          {proposal.summary.unchanged > 0 ? (
            <details className={styles.details}>
              <summary>
                Pola zgodne z umową: {proposal.summary.unchanged}
              </summary>
              <p className={styles.muted}>
                Te pola mają tę samą wartość w zleceniu i w umowie — nie będą
                zapisywane ponownie.
              </p>
            </details>
          ) : null}
        </section>
      ) : proposal.summary.unchanged > 0 ? (
        <section className={styles.block}>
          <h3 className={styles.blockTitle}>Pozostanie bez zmian</h3>
          <p className={styles.muted}>
            Pola zgodne z umową: {proposal.summary.unchanged}
          </p>
        </section>
      ) : null}

      {skipped.length > 0 ? (
        <section className={styles.block}>
          <h3 className={styles.blockTitle}>Pominięte dane</h3>
          <ul className={styles.plainList}>
            {skipped.map((field) => (
              <li key={field.fieldKey}>
                <strong>{field.label}</strong>
                {field.state === 'invalid_extracted'
                  ? ' — niepoprawna wartość z umowy'
                  : field.state === 'unsupported'
                    ? ' — tylko informacyjnie'
                    : ' — nie znaleziono w umowie'}
                {field.warnings[0] ? ` (${field.warnings[0]})` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {includePackageSnapshot && packageModel ? (
        <PackageSnapshotCard
          confirmationMode
          model={{
            name: packageModel.name,
            originalDescription: packageModel.originalDescription,
            includedItems: packageModel.includedItems,
            coverageHours: packageModel.coverageHours,
            coverageTimeRange: packageModel.coverageTimeRange,
            deliveryDeadlineText: packageModel.deliveryDeadlineText,
            sourceFileName,
          }}
        />
      ) : null}

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>Dokument źródłowy</h3>
        <ul className={styles.plainList}>
          <li>Plik: {sourceFileName ?? 'zapisany dokument'}</li>
          {format ? <li>Format: {format}</li> : null}
          {uploaded ? <li>Wgrano: {uploaded}</li> : null}
          <li>Dokument źródłowy pozostanie dołączony do zlecenia.</li>
        </ul>
      </section>

      <p className={styles.counts}>
        Podsumowanie: do aktualizacji {proposal.summary.toUpdate}, bez zmian{' '}
        {proposal.summary.unchanged}, konflikty zachowane{' '}
        {proposal.summary.conflictsKept}, pominięte {proposal.summary.invalid}.
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onBack} disabled={applying}>
          Wróć do porównania
        </Button>
        <Button onClick={onApply} disabled={applying}>
          {applying ? 'Zapisywanie…' : 'Zapisz zatwierdzone dane'}
        </Button>
      </div>
    </section>
  )
}
