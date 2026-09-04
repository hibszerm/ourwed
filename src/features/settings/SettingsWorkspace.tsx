import type { ReactNode } from 'react'
import styles from './SettingsWorkspace.module.css'

type SettingsFieldGridColumns =
  | 1
  | 2
  | 3
  | 'identity'
  | 'postal'
  | 'street'
  | 'bank'
  | 'contact'
  | 'compact'

const GRID_COLUMN_CLASS: Record<SettingsFieldGridColumns, string> = {
  1: styles.cols1,
  2: styles.cols2,
  3: styles.cols3,
  identity: styles.colsIdentity,
  postal: styles.colsPostal,
  street: styles.colsStreet,
  bank: styles.colsBank,
  contact: styles.colsContact,
  compact: styles.colsCompact,
}

/**
 * Presentation-only Settings document surface.
 * No queries, mutations, or domain logic.
 */
export function SettingsWorkspace({
  children,
  testId = 'settings-workspace',
}: {
  children: ReactNode
  testId?: string
}) {
  return (
    <div className={styles.workspace} data-testid={testId}>
      {children}
    </div>
  )
}

export function SettingsCallout({ children }: { children: ReactNode }) {
  return (
    <p className={styles.callout}>
      <span className={styles.calloutMark} aria-hidden>
        i
      </span>
      <span>{children}</span>
    </p>
  )
}

export function SettingsHealthSummary({
  title,
  items,
  missingCopy,
}: {
  title: string
  items: Array<{ id: string; label: string; status: string }>
  missingCopy?: Record<string, string>
}) {
  return (
    <section className={styles.health} aria-label={title}>
      <h2 className={styles.healthTitle}>{title}</h2>
      <ul className={styles.healthList}>
        {items.map((item) => (
          <li
            key={item.id}
            className={styles.healthItem}
            data-status={item.status}
          >
            <span className={styles.healthMark} aria-hidden>
              {item.status === 'ok' ? '✓' : '△'}
            </span>
            <span>
              {item.status === 'ok'
                ? item.label
                : (missingCopy?.[item.id] ?? `Brak: ${item.label}`)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SettingsSection({
  children,
  labelledBy,
}: {
  children: ReactNode
  labelledBy?: string
}) {
  return (
    <section className={styles.section} aria-labelledby={labelledBy}>
      {children}
    </section>
  )
}

export function SettingsSectionHeader({
  id,
  title,
  description,
}: {
  id?: string
  title: string
  description?: string
}) {
  return (
    <header className={styles.sectionHeader}>
      <h2 id={id} className={styles.sectionTitle}>
        {title}
      </h2>
      {description ? <p className={styles.sectionLead}>{description}</p> : null}
    </header>
  )
}

export function SettingsDivider() {
  return <hr className={styles.divider} />
}

export function SettingsFieldGrid({
  columns = 1,
  children,
}: {
  columns?: SettingsFieldGridColumns
  children: ReactNode
}) {
  return (
    <div className={`${styles.grid} ${GRID_COLUMN_CLASS[columns]}`}>
      {children}
    </div>
  )
}

export function SettingsFileField({
  label,
  path,
  children,
}: {
  label: string
  path?: string
  children: ReactNode
}) {
  return (
    <label className={styles.fileField}>
      <span className={styles.fileLabel}>{label}</span>
      {children}
      {path ? <span className={styles.filePath}>{path}</span> : null}
    </label>
  )
}

export function SettingsHelper({ children }: { children: ReactNode }) {
  return <p className={styles.helper}>{children}</p>
}

export function SettingsReadonlyField({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper?: string
}) {
  return (
    <div className={styles.readonlyField}>
      <span className={styles.readonlyLabel}>{label}</span>
      <p className={styles.readonlyValue}>{value}</p>
      {helper ? <p className={styles.helper}>{helper}</p> : null}
    </div>
  )
}

export function SettingsPreferenceList({ children }: { children: ReactNode }) {
  return <ul className={styles.preferenceList}>{children}</ul>
}

export function SettingsPreferenceRow({
  titleId,
  title,
  description,
  control,
}: {
  titleId: string
  title: string
  description: string
  control: ReactNode
}) {
  return (
    <li className={styles.preferenceRow}>
      <div className={styles.preferenceCopy}>
        <p id={titleId} className={styles.preferenceTitle}>
          {title}
        </p>
        <p className={styles.preferenceDesc}>{description}</p>
      </div>
      {control}
    </li>
  )
}

export function SettingsSwitch({
  id,
  checked,
  disabled,
  labelledBy,
  testId,
  onCheckedChange,
}: {
  id: string
  checked: boolean
  disabled?: boolean
  labelledBy?: string
  testId?: string
  onCheckedChange: (next: boolean) => void
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      className={styles.switch}
      data-testid={testId}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className={styles.switchTrack} aria-hidden>
        <span className={styles.switchThumb} />
      </span>
    </button>
  )
}

export function SettingsMuted({ children }: { children: ReactNode }) {
  return <p className={styles.muted}>{children}</p>
}

export function SettingsAlert({ children }: { children: ReactNode }) {
  return (
    <div className={styles.alert} role="alert">
      {children}
    </div>
  )
}

export function SettingsConfirmHint({
  children,
  testId,
}: {
  children: ReactNode
  testId?: string
}) {
  return (
    <p className={styles.confirmHint} data-testid={testId}>
      {children}
    </p>
  )
}

export function SettingsSaveStatus({
  status,
  children,
  testId,
}: {
  status: string
  children: ReactNode
  testId?: string
}) {
  return (
    <span
      className={styles.saveStatus}
      data-status={status}
      data-save-state={status}
      data-testid={testId}
      aria-live="polite"
    >
      {children}
    </span>
  )
}
