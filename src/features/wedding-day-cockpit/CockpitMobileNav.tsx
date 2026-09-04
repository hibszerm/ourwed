/**
 * Sticky mobile section anchors for long Cockpit pages.
 * Labels stay honest: hero is first-incomplete, not clock-now.
 */

import styles from './WeddingDayCockpit.module.css'

type Props = {
  hasCritical: boolean
}

export function CockpitMobileNav({ hasCritical }: Props) {
  const anchors = [
    { id: 'cockpit-punkt', label: 'Punkt' },
    { id: 'cockpit-plan', label: 'Plan' },
    ...(hasCritical ? [{ id: 'cockpit-wazne', label: 'Ważne' }] : []),
    { id: 'cockpit-kontakt', label: 'Kontakt' },
  ]

  return (
    <nav
      className={styles.mobileNav}
      aria-label="Sekcje dnia ślubu"
      data-testid="cockpit-mobile-nav"
    >
      <ul className={styles.mobileNavList}>
        {anchors.map((a) => (
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
