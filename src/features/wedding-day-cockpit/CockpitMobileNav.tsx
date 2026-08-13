/**
 * Sticky mobile section anchors for long Cockpit pages.
 */

import styles from './WeddingDayCockpit.module.css'

const ANCHORS = [
  { id: 'cockpit-teraz', label: 'Teraz' },
  { id: 'cockpit-plan', label: 'Plan' },
  { id: 'cockpit-wazne', label: 'Ważne' },
  { id: 'cockpit-kontakt', label: 'Kontakt' },
] as const

export function CockpitMobileNav() {
  return (
    <nav
      className={styles.mobileNav}
      aria-label="Sekcje dnia ślubu"
      data-testid="cockpit-mobile-nav"
    >
      <ul className={styles.mobileNavList}>
        {ANCHORS.map((a) => (
          <li key={a.id}>
            <a className={styles.mobileNavLink} href={`#${a.id}`}>
              {a.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
