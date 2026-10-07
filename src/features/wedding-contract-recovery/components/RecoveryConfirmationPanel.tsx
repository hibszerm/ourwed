import { Button } from '@/components/ui/Button'
import type { RecoveryFieldComparison, RecoveryProposal } from '../types'
import { buildRecoveryConfirmationGroups, buildRecoveryDecisionGroups, formatRecoveryValue, formatSelectedChangeCount, recoveryLogicalSelectionCount, recoverySectionLabel } from '../presentation'
import type { RecoveryDecisionGroup } from '../presentation'
import { PackageSnapshotCard } from './PackageSnapshotCard'
import styles from './RecoveryConfirmationPanel.module.css'

export function RecoveryConfirmationPanel({
  proposal,
  fields,
  includePackageSnapshot,
  currencyCode,
  error,
  applying,
  onBack,
  onApply,
}: {
  proposal: RecoveryProposal
  fields: RecoveryFieldComparison[]
  includePackageSnapshot: boolean
  currencyCode?: string
  error?: string | null
  applying: boolean
  onBack: () => void
  onApply: () => void
}) {
  const count = recoveryLogicalSelectionCount(fields, proposal, includePackageSnapshot)
  const countCopy = formatSelectedChangeCount(count)
  const selectedGroups = buildRecoveryConfirmationGroups(fields)
  const packageModel = includePackageSnapshot ? proposal.packageSnapshotProposal : null
  const packageNameContext = buildRecoveryDecisionGroups(fields).find((group) => group.id === 'package.name')
  const selectedExtras = proposal.extraProposals.filter((item) => item.selected && item.applicable)
  const selectedNotes = proposal.noteProposals.filter((item) => item.selected)
  const renderedSections = new Set(selectedGroups
    .filter((group) => !(packageModel && group.id === 'package.name'))
    .map((group) => group.sectionKey))
  if (packageModel) renderedSections.add('package')
  if (selectedExtras.length > 0) renderedSections.add('additional_services')
  if (selectedNotes.length > 0) renderedSections.add('other')
  const sectionOrder = ['clients', 'contact', 'wedding', 'locations', 'package', 'finances', 'travel', 'deadlines', 'additional_services', 'other', 'source_document'] as const
  const sectionKeys = sectionOrder.filter((key) => renderedSections.has(key))

  const formatValue = (field: RecoveryFieldComparison, value: unknown) =>
    formatRecoveryValue(field, value, currencyCode)

  return (
    <section className={styles.wrap}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Ostatni krok</p>
        <h2 className={styles.title}>Potwierdź zmiany</h2>
        <p>Wybrane informacje zostaną zapisane w tym zleceniu. Pozostałe dane nie zostaną zmienione.</p>
      </header>

      <div className={styles.content}>
        {count === 0 ? (
          <p className={styles.muted}>Nie wybrano zmian do zapisania.</p>
        ) : (
          <>
            {sectionKeys.map((sectionKey) => {
              if (sectionKey === 'package' && packageModel) {
                return (
                  <section key={sectionKey} className={styles.section}>
                    <h3 className={styles.sectionTitle}>{recoverySectionLabel(sectionKey)}</h3>
                    <PackageSnapshotCard confirmationMode confirmationCurrentName={packageNameContext?.currentValue ?? null} model={{
                      name: packageModel.name,
                      originalDescription: packageModel.originalDescription,
                      includedItems: packageModel.includedItems,
                      coverageHours: packageModel.coverageHours,
                      deliveryDays: packageModel.deliveryDays,
                      coverageTimeRange: packageModel.coverageTimeRange,
                      deliveryDeadlineText: packageModel.deliveryDeadlineText,
                      basePrice: packageModel.basePrice,
                      currency: packageModel.currency,
                    }} />
                  </section>
                )
              }
              if (sectionKey === 'additional_services' && selectedExtras.length > 0) {
                return (
                  <section key={sectionKey} className={styles.section}>
                    <h3 className={styles.sectionTitle}>{recoverySectionLabel(sectionKey)}</h3>
                    <ul className={styles.rows}>
                      {selectedExtras.map((item, index) => (
                        <li key={`${item.name}-${index}`} className={`${styles.row} ${styles.compactRow}`}>
                          <h4 className={styles.fieldLabel}>{item.name}</h4>
                          <div className={styles.extraValue}>
                            {item.price == null ? null : <strong>{formatMoney(item.price, item.currency)}</strong>}
                            <span>Zostanie dodana</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              }
              const groups = selectedGroups
                .filter((group) => group.sectionKey === sectionKey)
                // The rich package block already includes the selected package name.
                .filter((group) => !(packageModel && group.id === 'package.name'))
              if (groups.length === 0 && !(sectionKey === 'other' && selectedNotes.length > 0)) return null
              return (
                <section key={sectionKey} className={styles.section}>
                  <h3 className={styles.sectionTitle}>{recoverySectionLabel(sectionKey)}</h3>
                  {groups.length > 0 ? (
                    <ul className={styles.rows}>
                      {groups.map((group) => (
                        <DecisionConfirmationRow key={group.id} group={group} formatValue={formatValue} />
                      ))}
                    </ul>
                  ) : null}
                  {sectionKey === 'other' && selectedNotes.length > 0 ? (
                    <article className={`${styles.row} ${styles.notesRow}`}>
                      <h4 className={styles.fieldLabel}>Ustalenia z umowy źródłowej</h4>
                      <div>
                        <ul className={styles.noteList}>{selectedNotes.map((item, index) => <li key={`${item.sourceIndex}-${index}`}>{item.text}</li>)}</ul>
                        <p className={styles.noteHint}>Zapisane razem jako jedna notatka w zleceniu.</p>
                      </div>
                    </article>
                  ) : null}
                </section>
              )
            })}
          </>
        )}
      </div>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.footer}>
        <span className={styles.footerCount}>{countCopy.sentence}</span>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onBack} disabled={applying}>Wróć do sprawdzenia</Button>
          <Button variant="primary" onClick={onApply} disabled={applying || count === 0}>{applying ? 'Zapisywanie…' : `Zastosuj ${count} ${countCopy.noun}`}</Button>
        </div>
      </div>
    </section>
  )
}

function DecisionConfirmationRow({
  group,
  formatValue,
}: {
  group: RecoveryDecisionGroup
  formatValue: (field: RecoveryFieldComparison, value: unknown) => string
}) {
  const selectedFields = group.actionableFields.filter((field) => field.selectedAction === 'use_extracted')
  const renderSide = (side: 'currentValue' | 'extractedValue') => {
    const values = selectedFields.map((field) => {
      const value = formatValue(field, field[side])
      return group.id === 'partner1.address'
        ? `${field.label.replace('Adres klienta 1 — ', '')}: ${value}`
        : value
    }).filter((value) => group.id === 'partner1.address' || value !== '—')
    return values.join(group.id === 'partner1.address' ? ' · ' : ', ') || '—'
  }

  return (
    <li className={styles.row}>
      <h4 className={styles.fieldLabel}>{group.label}</h4>
      <div className={styles.values}>
        <div className={styles.valueSide} data-side="current">
          <span className={styles.colLabel}>Obecnie</span>
          <span className={styles.value}>{renderSide('currentValue')}</span>
        </div>
        <span className={styles.arrow} aria-hidden="true">→</span>
        <div className={styles.valueSide} data-side="after">
          <span className={styles.colLabel}>Po zmianie</span>
          <span className={styles.value}>{renderSide('extractedValue')}</span>
        </div>
      </div>
    </li>
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
