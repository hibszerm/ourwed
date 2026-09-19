import type { ComponentType, SVGProps } from 'react'
import {
  IconCalendar,
  IconClipboard,
  IconMail,
  IconMapPin,
  IconPhone,
  IconSessions,
  IconWeddings,
} from '@/components/icons'
import type { AssistantReference } from '../../v7/presentation/types'
import type { ContextCardModel } from './buildContextCards'
import { AssistantContextAction } from './AssistantActionControl'
import styles from '../Assistant.module.css'

type IconComp = ComponentType<SVGProps<SVGSVGElement>>

function headerIconFor(
  kind: AssistantReference['kind'],
  actions: ContextCardModel['actions'],
): IconComp {
  const hasQuestionnaire = actions.some(
    (a) => a.type === 'open_prewedding_questionnaire',
  )
  if (hasQuestionnaire && !actions.some((a) => a.type === 'open_wedding')) {
    return IconClipboard
  }
  switch (kind) {
    case 'phone':
      return IconPhone
    case 'email':
      return IconMail
    case 'address':
      return IconMapPin
    case 'session':
      return IconSessions
    case 'calendar':
      return IconCalendar
    case 'wedding':
      return hasQuestionnaire && actions.length === 1
        ? IconClipboard
        : IconWeddings
    default:
      return IconWeddings
  }
}

export function AssistantContextCard({
  card,
  onNavigate,
}: {
  card: ContextCardModel
  onNavigate: (path: string) => void
}) {
  const HeaderIcon = headerIconFor(card.kind, card.actions)

  return (
    <div
      className={styles.contextCard}
      data-testid="assistant-context-card"
      data-kind={card.kind}
      data-member-kinds={card.memberKinds.join(',')}
    >
      {card.memberRefIds.map((id) => (
        <span
          key={id}
          data-testid="assistant-presentation-ref"
          data-ref-id={id}
          hidden
        />
      ))}
      <div className={styles.contextCardHeader}>
        <div className={styles.contextCardIcon} aria-hidden>
          <HeaderIcon className={styles.contextCardIconSvg} />
        </div>
        <div className={styles.contextCardText}>
          <p className={styles.contextCardTitle}>{card.title}</p>
          {card.subtitle ? (
            <p className={styles.contextCardSubtitle}>{card.subtitle}</p>
          ) : null}
          {card.valueLines.map((line) => (
            <p key={line} className={styles.contextCardValue}>
              {line}
            </p>
          ))}
        </div>
      </div>
      {card.actions.length > 0 ? (
        <div className={styles.contextCardActions}>
          {card.actions.map((action, i) => (
            <AssistantContextAction
              key={`${card.id}-${action.type}-${i}`}
              action={action}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
