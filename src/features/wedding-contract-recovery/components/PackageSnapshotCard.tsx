import type { PackageSnapshotCardModel } from './packageSnapshotAdapter'
import styles from './PackageSnapshotCard.module.css'

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('pl-PL')
}

function formatMoney(amount: number, currency: string | null | undefined): string {
  const code = currency || 'PLN'
  try {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: code, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${new Intl.NumberFormat('pl-PL').format(amount)} ${code}`
  }
}

export function PackageSnapshotCard({
  model,
  confirmationMode = false,
  confirmationCurrentName = null,
}: {
  model: PackageSnapshotCardModel
  confirmationMode?: boolean
  confirmationCurrentName?: string | null
}) {
  const hasItems = model.includedItems.length > 0
  const hasConditions =
    model.coverageHours != null ||
    model.basePrice != null ||
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
    <article className={`${styles.card} ${confirmationMode ? styles.confirmationCard : ''}`}>
      {confirmationMode ? (
        <>
          <h4 className={styles.title}>Pakiet z umowy</h4>
          <div className={styles.confirmCompare}>
            <div className={styles.confirmSide}>
              <span className={styles.confirmLabel}>Obecnie</span>
              <p className={styles.confirmName}>{confirmationCurrentName?.trim() || '—'}</p>
            </div>
            <span className={styles.confirmArrow} aria-hidden="true">→</span>
            <div className={`${styles.confirmSide} ${styles.confirmAfter}`}>
              <span className={styles.confirmLabel}>Po zmianie</span>
              <p className={styles.confirmName}>{model.name?.trim() || 'Pakiet bez nazwy'}</p>
            </div>
          </div>
          {(hasItems || hasConditions || hasOriginal) ? (
            <div className={styles.confirmDetails}>
              {hasItems ? (
                <section className={styles.section}>
                  <h4 className={styles.sectionTitle}>Zakres usług</h4>
                  <ul className={styles.itemList}>{model.includedItems.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
              ) : null}
              {hasConditions ? (
                <section className={styles.section}>
                  <h4 className={styles.sectionTitle}>Warunki realizacji</h4>
                  <dl className={styles.conditions}>
                    {model.coverageHours != null ? <><dt>Czas realizacji</dt><dd>{model.coverageHours} h</dd></> : null}
                    {model.coverageTimeRange ? <><dt>Maksymalny czas reportażu</dt><dd>{model.coverageTimeRange}</dd></> : null}
                    {model.deliveryDeadlineText ? <><dt>Termin dostawy</dt><dd>{model.deliveryDeadlineText}</dd></> : null}
                    {model.basePrice != null ? <><dt>Cena pakietu</dt><dd>{formatMoney(model.basePrice, model.currency)}</dd></> : null}
                  </dl>
                </section>
              ) : null}
              {hasOriginal ? (
                <section className={styles.section}>
                  <h4 className={styles.sectionTitle}>Opis pakietu</h4>
                  <p className={styles.confirmDescription}>{model.originalDescription}</p>
                </section>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <header className={styles.header}>
            <div className={styles.headerText}>
              <h3 className={styles.title}>Pakiet z umowy</h3>
              <p className={styles.name}>{model.name?.trim() || 'Pakiet bez nazwy'}</p>
              {createdLabel ? (
                <p className={styles.meta}>Odzyskano {createdLabel}</p>
              ) : null}
            </div>
            {model.includeToggle ? (
              <label className={styles.choice} data-selected={model.includeToggle.checked}>
                <input
                  type="checkbox"
                  checked={model.includeToggle.checked}
                  onChange={(e) => model.includeToggle?.onChange(e.target.checked)}
                />
                <span className={styles.choiceMark} aria-hidden="true">{model.includeToggle.checked ? '✓' : ''}</span>
                <span>{model.includeToggle.checked ? 'Wybrano' : 'Zapisz pakiet'}</span>
              </label>
            ) : null}
          </header>

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
                {model.basePrice != null ? (
                  <><dt>Cena pakietu</dt><dd>{formatMoney(model.basePrice, model.currency)}</dd></>
                ) : null}
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

    </article>
  )
}
