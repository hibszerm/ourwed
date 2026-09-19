import type { ComponentType, SVGProps } from 'react'
import { MessageSquare, Navigation } from 'lucide-react'
import {
  IconCalendar,
  IconClipboard,
  IconMail,
  IconPhone,
  IconSessions,
  IconWeddings,
} from '@/components/icons'
import type { AssistantAction } from '../../v7/presentation/types'
import {
  executeAssistantAction,
  labelForAssistantAction,
} from '../../v7/presentation/executeAssistantAction'
import styles from '../Assistant.module.css'

type IconComp = ComponentType<SVGProps<SVGSVGElement>>

export type ActionVisualTier = 'direct' | 'navigate'

export function actionVisualTier(action: AssistantAction): ActionVisualTier {
  switch (action.type) {
    case 'call_phone':
    case 'send_sms':
    case 'compose_email':
    case 'navigate_address':
      return 'direct'
    default:
      return 'navigate'
  }
}

export function iconForAssistantAction(action: AssistantAction): IconComp {
  switch (action.type) {
    case 'call_phone':
      return IconPhone
    case 'send_sms':
      return MessageSquare
    case 'compose_email':
      return IconMail
    case 'navigate_address':
      return Navigation
    case 'open_wedding':
      return IconWeddings
    case 'open_session':
      return IconSessions
    case 'open_prewedding_questionnaire':
      return IconClipboard
    case 'open_calendar':
      return IconCalendar
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

/** Shared contextual action control — always a bordered button, never a text link. */
export function AssistantContextAction({
  action,
  onNavigate,
}: {
  action: AssistantAction
  onNavigate: (path: string) => void
}) {
  const Icon = iconForAssistantAction(action)
  const tier = actionVisualTier(action)
  const label = labelForAssistantAction(action)

  return (
    <button
      type="button"
      data-testid="assistant-presentation-action"
      data-action-type={action.type}
      data-tier={tier}
      className={
        tier === 'direct'
          ? styles.contextActionDirect
          : styles.contextAction
      }
      aria-label={label}
      onClick={() => {
        executeAssistantAction(action, {
          navigate: (path) => {
            onNavigate(path)
          },
        })
      }}
    >
      <Icon className={styles.contextActionIcon} aria-hidden />
      <span className={styles.contextActionLabel}>{label}</span>
    </button>
  )
}

/** @deprecated alias — prefer AssistantContextAction */
export const AssistantActionControl = AssistantContextAction
