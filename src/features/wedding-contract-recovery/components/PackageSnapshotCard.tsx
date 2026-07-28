import type { WeddingContractPackageSnapshot } from '../types'
import styles from './PackageSnapshotCard.module.css'

export type PackageSnapshotCardModel = {
  name: string | null
  originalDescription: string | null
  includedItems: string[]
  coverageHours: number | null
  coverageTimeRange?: string | null
  deliveryDeadlineText: string | null
  sourceFileName?: string | null
  createdAt?: string | null
  includeToggle?: {
    checked: boolean
    onChange: (checked: boolean) => void
  }
  compact?: boolean
}

export function packageSnapshotFromRow(
  snapshot: WeddingContractPackageSnapshot,
  sourceFileName?: string | null,
): PackageSnapshotCardModel {
  const metadata = snapshot.metadata ?? {}
  const coverageTimeRange =
    typeof metadata.coverageTimeRange === 'string'
      ? metadata.coverageTimeRange
      : null
  return {
    name: snapshot.name,
    originalDescription: snapshot.originalDescription,
    includedItems: snapshot.includedItems,
    coverageHours: snapshot.coverageHours,
    coverageTimeRange,
    deliveryDeadlineText: snapshot.deliveryDeadlineText,
    sourceFileName: sourceFileName ?? null,
    createdAt: snapshot.createdAt,
  }
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('pl-PL')
}

export function PackageSnapshotCard({
  model,
  confirmationMode = false,
}: {
  model: PackageSnapshotCardModel
  confirmationMode?: boolean
}) {
  const hasItems = model.includedItems.length > 0
  const hasConditions =
    model.coverageHours != null ||
    Boolean(model.coverageTimeRange) ||
    Boolean(model.deliveryDeadlineText)
  const hasOriginal = Boolean(model.originalDescription?.trim())
  const hasAny =
    Boolean(model.name?.trim()) || hasItems || hasConditions || hasOriginal

  if (!hasAny) {
    return (
      <article className={styles.card}>
        <h3 className={styles.title}>Pakiet z umowy</h3>
        <p className={styles.empty}>Brak rozpoznanego zakresu pakietu w tej umowie.</p>
      </article>
    )
  }

  const createdLabel = formatDate(model.createdAt)

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h3 className={styles.title}>Pakiet z umowy</h3>
          <p className={styles.name}>{model.name?.trim() || 'Pakiet bez nazwy'}</p>
          {createdLabel ? (
            <p className={styles.meta}>Odzyskano {createdLabel}</p>
          ) : null}
        </div>
      </header>

      {confirmationMode ? (
        <div className={styles.confirmBody}>
          <p>
            Rozpoznane pozycje: <strong>{model.includedItems.length}</strong>
          </p>
          {model.coverageHours != null ? (
            <p>Czas realizacji: {model.coverageHours} h</p>
          ) : null}
          {model.deliveryDeadlineText ? (
            <p>Termin dostawy: {model.deliveryDeadlineText}</p>
          ) : null}
          <p className={styles.confirmNote}>
            Zostanie zapisany jako historyczny pakiet wynikający z tej umowy.
          </p>
          {(hasItems || hasOriginal) ? (
            <details className={styles.details}>
              <summary>Pokaż szczegóły pakietu</summary>
              {hasItems ? (
                <ul className={styles.itemList}>
                  {model.includedItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {hasOriginal ? (
                <blockquote className={styles.quote}>{model.originalDescription}</blockquote>
              ) : null}
            </details>
          ) : null}
        </div>
      ) : (
        <>
          {hasItems ? (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Zakres usług</h4>
              <ul className={styles.itemList}>
                {model.includedItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {hasConditions ? (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Warunki realizacji</h4>
              <dl className={styles.conditions}>
                {model.coverageHours != null ? (
                  <>
                    <dt>Czas realizacji</dt>
                    <dd>{model.coverageHours} h</dd>
                  </>
                ) : null}
                {model.coverageTimeRange ? (
                  <>
                    <dt>Maksymalny czas reportażu</dt>
                    <dd>{model.coverageTimeRange}</dd>
                  </>
                ) : null}
                {model.deliveryDeadlineText ? (
                  <>
                    <dt>Termin dostawy</dt>
                    <dd>{model.deliveryDeadlineText}</dd>
                  </>
                ) : null}
              </dl>
            </section>
          ) : null}

          {hasOriginal ? (
            <details className={styles.details}>
              <summary>Pokaż oryginalny zapis z umowy</summary>
              <blockquote className={styles.quote}>{model.originalDescription}</blockquote>
            </details>
          ) : null}
        </>
      )}

      {model.sourceFileName ? (
        <p className={styles.source}>
          Źródło: <span title={model.sourceFileName}>{model.sourceFileName}</span>
        </p>
      ) : null}

      {model.includeToggle ? (
        <label className={styles.choice}>
          <input
            type="checkbox"
            checked={model.includeToggle.checked}
            onChange={(e) => model.includeToggle?.onChange(e.target.checked)}
          />
          Zapisz pakiet z umowy jako odrębny snapshot
        </label>
      ) : null}
    </article>
  )
}
