import { Button } from '@/components/ui/Button'
import type { RecoveryFieldComparison, RecoveryProposal } from '../types'
import { buildRecoveryDecisionGroups, formatRecoveryValue, formatSelectedChangeCount, recoveryLogicalSelectionCount, recoverySectionLabel } from '../presentation'
import { PackageSnapshotCard } from './PackageSnapshotCard'
import styles from './RecoveryConfirmationPanel.module.css'

export function RecoveryConfirmationPanel({
  proposal,
  fields,
  sourceFileName,
  includePackageSnapshot,
  currencyCode,
  error,
  applying,
  onBack,
  onApply,
}: {
  proposal: RecoveryProposal
  fields: RecoveryFieldComparison[]
  sourceFileName: string | null
  includePackageSnapshot: boolean
  currencyCode?: string
  error?: string | null
  applying: boolean
  onBack: () => void
  onApply: () => void
}) {
  const count = recoveryLogicalSelectionCount(fields, proposal, includePackageSnapshot)
  const countCopy = formatSelectedChangeCount(count)
  const selectedGroups = buildRecoveryDecisionGroups(fields).filter((group) =>
    group.actionableFields.some((field) => field.selectedAction === 'use_extracted'),
  )
  const sectionKeys = [...new Set(selectedGroups.map((group) => group.sectionKey))]
  const packageModel = includePackageSnapshot ? proposal.packageSnapshotProposal : null
  const selectedExtras = proposal.extraProposals.filter((item) => item.selected && item.applicable)
  const selectedNotes = proposal.noteProposals.filter((item) => item.selected)

  const formatValue = (field: RecoveryFieldComparison, value: unknown) =>
    formatRecoveryValue(field, value, currencyCode)

  return (
    <section className={styles.wrap}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Ostatni krok</p>
        <h2 className={styles.title}>Potwierdź zmiany</h2>
        <p>Wybrane informacje zostaną zapisane w tym zleceniu. Pozostałe dane nie zostaną zmienione.</p>
      </header>

      {count === 0 ? (
        <p className={styles.muted}>Nie wybrano zmian do zapisania.</p>
      ) : (
        <div className={styles.selectedList}>
          {sectionKeys.map((sectionKey) => (
            <section key={sectionKey} className={styles.block}>
              <h3 className={styles.blockTitle}>{recoverySectionLabel(sectionKey)}</h3>
              <ul className={styles.changeList}>
                {selectedGroups.filter((group) => group.sectionKey === sectionKey).map((group) => (
                  <li key={group.id} className={styles.changeItem}>
                    <p className={styles.fieldLabel}>{group.label}</p>
                    {group.id === 'partner1.address' ? (
                      <ul className={styles.addressChanges}>
                        {group.actionableFields.filter((field) => field.selectedAction === 'use_extracted').map((field) => (
                          <li key={field.fieldKey}>
                            <span>{field.label.replace('Adres klienta 1 — ', '')}: {formatValue(field, field.currentValue)}</span>
                            <span aria-hidden="true">→</span>
                            <strong>{formatValue(field, field.extractedValue)}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.transition}>
                        <span>{group.fields.map((field) => formatValue(field, field.currentValue)).filter((value) => value !== '—').join(', ') || '—'}</span>
                        <span className={styles.arrow} aria-hidden="true">→</span>
                        <strong>{group.fields.map((field) => formatValue(field, field.extractedValue)).filter((value) => value !== '—').join(', ') || '—'}</strong>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {packageModel ? (
            <PackageSnapshotCard confirmationMode model={{
              name: packageModel.name,
              originalDescription: packageModel.originalDescription,
              includedItems: packageModel.includedItems,
              coverageHours: packageModel.coverageHours,
              coverageTimeRange: packageModel.coverageTimeRange,
              deliveryDeadlineText: packageModel.deliveryDeadlineText,
              basePrice: packageModel.basePrice,
              currency: packageModel.currency,
              sourceFileName,
            }} />
          ) : null}

          {selectedExtras.length > 0 ? (
            <section className={styles.block}>
              <h3 className={styles.blockTitle}>Usługi dodatkowe</h3>
              <ul className={styles.changeList}>
                {selectedExtras.map((item, index) => (
                  <li key={`${item.name}-${index}`} className={styles.extraItem}>
                    <span aria-hidden="true">+</span>
                    <strong>{item.name}</strong>
                    {item.price == null ? null : <span>{formatMoney(item.price, item.currency)}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {selectedNotes.length > 0 ? (
            <section className={styles.block}>
              <h3 className={styles.blockTitle}>Pozostałe ustalenia</h3>
              <ul className={styles.changeList}>{selectedNotes.map((item, index) => <li key={`${item.text}-${index}`}>{item.text}</li>)}</ul>
            </section>
          ) : null}
        </div>
      )}

      <p className={styles.counts}>{countCopy.sentence}</p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onBack} disabled={applying}>Wróć do sprawdzenia</Button>
        <Button onClick={onApply} disabled={applying || count === 0}>{applying ? 'Zapisywanie…' : `Zastosuj ${count} ${countCopy.noun}`}</Button>
      </div>
    </section>
  )
}

function formatMoney(amount: number, currency: string | null | undefined): string {
  const code = currency || 'PLN'
  try {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: code, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${new Intl.NumberFormat('pl-PL').format(amount)} ${code}`
  }
}
