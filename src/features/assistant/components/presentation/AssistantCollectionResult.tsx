/**
 * Phase 2H.2 — compact chronological collection list (weddings / sessions / mixed).
 * Rows execute existing AssistantAction evidence only — never invent routes.
 */

import { ChevronRight } from 'lucide-react'
import type { AssistantReference } from '../../v7/presentation/types'
import {
  executeAssistantAction,
  labelForAssistantAction,
} from '../../v7/presentation/executeAssistantAction'
import { deriveCollectionItems } from './deriveCollectionItems'
import styles from '../Assistant.module.css'

const PL_MONTHS = [
  'STY',
  'LUT',
  'MAR',
  'KWI',
  'MAJ',
  'CZE',
  'LIP',
  'SIE',
  'WRZ',
  'PAŹ',
  'LIS',
  'GRU',
] as const

export function formatCollectionDateParts(
  iso: string | undefined,
): { day: string; month: string } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [, m, d] = iso.split('-')
  const mi = Number(m) - 1
  if (mi < 0 || mi > 11 || !d) return null
  return { day: String(Number(d)), month: PL_MONTHS[mi]! }
}

export function AssistantCollectionResult({
  references,
  onNavigate,
}: {
  references: AssistantReference[]
  onNavigate: (path: string) => void
}) {
  const items = deriveCollectionItems(references)
  if (items.length < 2) return null

  const kinds = new Set(items.map((i) => i.kind))
  const dataKind =
    kinds.size === 1 ? items[0]!.kind : 'mixed'

  return (
    <ul
      className={styles.collectionList}
      data-testid="assistant-collection"
      data-kind={dataKind}
      data-phase="2h2"
    >
      {items.map((item) => {
        const dateParts = formatCollectionDateParts(item.date)
        const interactive = Boolean(item.action)

        const body = (
          <>
            <span className={styles.collectionDate} aria-hidden={!dateParts}>
              {dateParts ? (
                <>
                  <span className={styles.collectionDay}>{dateParts.day}</span>
                  <span className={styles.collectionMonth}>{dateParts.month}</span>
                </>
              ) : (
                <span className={styles.collectionDateEmpty} />
              )}
            </span>
            <span className={styles.collectionBody}>
              <span className={styles.collectionTitle}>{item.title}</span>
            </span>
            <span className={styles.collectionType}>{item.typeLabel}</span>
            {interactive ? (
              <ChevronRight className={styles.collectionChevron} aria-hidden />
            ) : (
              <span className={styles.collectionChevronSpacer} aria-hidden />
            )}
          </>
        )

        if (!interactive || !item.action) {
          return (
            <li
              key={item.id}
              className={styles.collectionRow}
              data-testid="assistant-collection-row"
              data-kind={item.kind}
              data-interactive="false"
            >
              {body}
            </li>
          )
        }

        const action = item.action
        const aria = labelForAssistantAction(action)
        return (
          <li key={item.id} className={styles.collectionRowWrap}>
            <button
              type="button"
              className={styles.collectionRow}
              data-testid="assistant-collection-row"
              data-kind={item.kind}
              data-interactive="true"
              data-action-type={action.type}
              aria-label={`${aria}: ${item.title}`}
              onClick={() => {
                executeAssistantAction(action, {
                  navigate: (path) => onNavigate(path),
                })
              }}
            >
              {body}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
