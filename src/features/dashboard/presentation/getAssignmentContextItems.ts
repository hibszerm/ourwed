/**
 * Subtle dashboard context checklist from data already on Wedding / Session.
 * No new business rules — only existing contract / deposit / questionnaire / link fields.
 */
import { getDepositPaid } from '@/lib/utils/finance'
import { buildSessionCommercialSummary } from '@/features/sessions/presentation/sessionFinance'
import type { CalendarUiEvent } from '@/features/calendar/utils/calendarEvents'
import type { Session } from '@/types/session'
import type { Wedding } from '@/types/wedding'

export interface AssignmentContextItem {
  id: string
  label: string
  /** Visual tone only — does not encode workflow stages. */
  tone: 'ok' | 'pending' | 'neutral'
}

export function getAssignmentContextItems(
  event: CalendarUiEvent,
  linkedSessionsForWedding: Session[] = [],
): AssignmentContextItem[] {
  if (event.entityType === 'wedding') {
    return weddingContextItems(event.wedding, linkedSessionsForWedding)
  }
  return sessionContextItems(event.session)
}

function weddingContextItems(
  wedding: Wedding,
  linkedSessions: Session[],
): AssignmentContextItem[] {
  const items: AssignmentContextItem[] = []

  const contractStatus = wedding.contract?.status
  if (contractStatus === 'signed') {
    items.push({ id: 'contract', label: 'Umowa podpisana', tone: 'ok' })
  } else if (contractStatus === 'sent') {
    items.push({ id: 'contract', label: 'Umowa wysłana', tone: 'pending' })
  } else if (contractStatus === 'generated') {
    items.push({ id: 'contract', label: 'Umowa wygenerowana', tone: 'pending' })
  } else {
    items.push({ id: 'contract', label: 'Brak podpisanej umowy', tone: 'pending' })
  }

  const depositPaid = getDepositPaid(wedding.payments ?? [])
  const agreedDeposit = wedding.depositAmount ?? 0
  if (depositPaid > 0) {
    items.push({ id: 'deposit', label: 'Zaliczka opłacona', tone: 'ok' })
  } else if (agreedDeposit > 0 || wedding.price > 0) {
    items.push({ id: 'deposit', label: 'Brak zaliczki', tone: 'pending' })
  }

  const contractQ = wedding.questionnaires?.contractData?.status
  const weddingQ = wedding.questionnaires?.weddingQuestionnaire?.status
  if (contractQ === 'not_sent' || weddingQ === 'not_sent') {
    items.push({
      id: 'questionnaire',
      label: 'Ankieta niewysłana',
      tone: 'pending',
    })
  } else if (contractQ === 'completed' || weddingQ === 'completed') {
    items.push({
      id: 'questionnaire',
      label: 'Ankieta uzupełniona',
      tone: 'ok',
    })
  }

  if (linkedSessions.length > 0) {
    items.push({
      id: 'linked-session',
      label:
        linkedSessions.length === 1
          ? 'Sesja powiązana'
          : `${linkedSessions.length} sesje powiązane`,
      tone: 'ok',
    })
  }

  return items.slice(0, 4)
}

function sessionContextItems(session: Session): AssignmentContextItem[] {
  const items: AssignmentContextItem[] = []

  if (session.linkedWeddingId) {
    items.push({ id: 'linked-wedding', label: 'Sesja powiązana', tone: 'ok' })
  } else {
    items.push({
      id: 'linked-wedding',
      label: 'Bez powiązanego ślubu',
      tone: 'neutral',
    })
  }

  const finance = buildSessionCommercialSummary(
    session.totalPrice,
    session.depositAmount,
    session.payments,
  )
  if (finance.paymentStatus === 'paid') {
    items.push({ id: 'finance', label: 'Opłacone', tone: 'ok' })
  } else if (finance.depositPaid > 0) {
    items.push({ id: 'finance', label: 'Zaliczka przyjęta', tone: 'ok' })
  } else if (finance.agreedDeposit > 0 && finance.depositPaid <= 0) {
    items.push({ id: 'finance', label: 'Brak zaliczki', tone: 'pending' })
  }

  return items.slice(0, 4)
}
