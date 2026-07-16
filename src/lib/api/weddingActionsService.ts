import { formService } from '@/lib/api/formService'
import { weddingService } from '@/lib/api/weddingService'
import { getDepositPaid } from '@/lib/utils/finance'
import { coupleName } from '@/lib/utils/dates'
import {
  createTimelineEntry,
  prependTimelineEntry,
} from '@/lib/utils/timeline'
import { getNextStage } from '@/lib/workflow/workflowEngine'
import { addNotification } from '@/mocks/notifications'
import type {
  Payment,
  PaymentMethod,
  PaymentType,
  Wedding,
  WeddingNote,
} from '@/types/wedding'

export type QuestionnaireKind = 'contractData' | 'weddingQuestionnaire'

const QUESTIONNAIRE_CONFIG: Record<
  QuestionnaireKind,
  {
    templateId: string
    timelineTitle: string
    notificationTitle: string
    notificationMessage: (couple: string) => string
  }
> = {
  contractData: {
    templateId: 'tpl-contract',
    timelineTitle: 'Wysłano ankietę do umowy.',
    notificationTitle: 'Ankieta do umowy wysłana',
    notificationMessage: (couple) =>
      `Formularz danych do umowy został wysłany do pary ${couple}.`,
  },
  weddingQuestionnaire: {
    templateId: 'tpl-wedding-q',
    timelineTitle: 'Wysłano ankietę przedślubną.',
    notificationTitle: 'Ankieta przedślubna wysłana',
    notificationMessage: (couple) =>
      `Ankieta przedślubna została wysłana do pary ${couple}.`,
  },
}

export interface SendQuestionnaireInput {
  weddingId: string
  kind: QuestionnaireKind
  recipientEmail: string
  message?: string
}

export interface AddPaymentInput {
  weddingId: string
  amount: number
  date: string
  method: PaymentMethod
  note?: string
  /** Defaults to installment; use deposit for zadatek. */
  type?: PaymentType
  label?: string
}

export interface AddNoteInput {
  weddingId: string
  content: string
  pinned?: boolean
  author?: string
}

export interface GenerateContractResult {
  wedding: Wedding
  missingFields: string[]
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  transfer: 'Przelew',
  cash: 'Gotówka',
  blik: 'BLIK',
  other: 'Inne',
}

/**
 * Studio actions for Wedding Detail — mock implementations ready for Supabase.
 */
export const weddingActionsService = {
  async sendQuestionnaire(
    input: SendQuestionnaireInput,
  ): Promise<{ wedding: Wedding; formToken: string }> {
    const wedding = await requireWedding(input.weddingId)
    const config = QUESTIONNAIRE_CONFIG[input.kind]
    const qKey = input.kind

    if (wedding.questionnaires[qKey].status !== 'not_sent') {
      throw new Error('Ankieta została już wysłana.')
    }

    const form = await formService.createForWedding(
      wedding.id,
      config.templateId,
    )

    const today = new Date().toISOString().slice(0, 10)
    const couple = coupleName(wedding.couple.partner1, wedding.couple.partner2)

    const next: Wedding = {
      ...wedding,
      questionnaires: {
        ...wedding.questionnaires,
        [qKey]: {
          status: 'sent',
          sentAt: today,
        },
      },
      timeline: prependTimelineEntry(
        wedding.timeline,
        createTimelineEntry({
          title: config.timelineTitle,
          type: 'questionnaire_sent',
          description: `Wysłano na ${input.recipientEmail}${
            input.message?.trim() ? ` — ${input.message.trim().slice(0, 80)}` : ''
          }`,
        }),
      ),
    }

    const updated = await weddingService.update(next)

    addNotification({
      id: `notif-${Date.now()}`,
      title: config.notificationTitle,
      message: config.notificationMessage(couple),
      createdAt: today,
      read: false,
      type: 'success',
    })

    // Mock: form token is available for future email / copy-link UX
    void form.token

    return { wedding: updated, formToken: form.token }
  },

  async addPayment(input: AddPaymentInput): Promise<Wedding> {
    const wedding = await requireWedding(input.weddingId)
    const today = new Date().toISOString().slice(0, 10)
    const type = input.type ?? 'installment'
    const label =
      input.label ??
      (type === 'deposit' ? 'Zadatek' : 'Wpłata')

    const payment: Payment = {
      id: `p-${wedding.id}-${Date.now()}`,
      label,
      amount: input.amount,
      type,
      paid: true,
      paidAt: input.date || today,
      method: input.method,
      note: input.note?.trim() || undefined,
    }

    let workflowStage = wedding.workflowStage
    const payments = [...wedding.payments, payment]

    // Advance from deposit → preparation when a deposit is recorded
    if (wedding.workflowStage === 'deposit' && getDepositPaid(payments) > 0) {
      const advanced = getNextStage('deposit')
      if (advanced) workflowStage = advanced
    }

    const methodLabel = PAYMENT_METHOD_LABELS[input.method]
    const couple = coupleName(wedding.couple.partner1, wedding.couple.partner2)

    const next: Wedding = {
      ...wedding,
      payments,
      workflowStage,
      timeline: prependTimelineEntry(
        wedding.timeline,
        createTimelineEntry({
          title: 'Dodano wpłatę.',
          type: 'payment_received',
          description: `${label}: ${input.amount} zł · ${methodLabel}`,
          date: input.date || today,
        }),
      ),
    }

    const updated = await weddingService.update(next)

    if (type === 'deposit') {
      addNotification({
        id: `notif-${Date.now()}`,
        title: 'Zadatek otrzymany',
        message: `Zarejestrowano zadatek dla pary ${couple}.`,
        createdAt: today,
        read: false,
        type: 'success',
      })
    }

    return updated
  },

  async addNote(input: AddNoteInput): Promise<Wedding> {
    const wedding = await requireWedding(input.weddingId)
    const today = new Date().toISOString().slice(0, 10)
    const content = input.content.trim()
    if (!content) throw new Error('Notatka nie może być pusta.')

    const note: WeddingNote = {
      id: `n-${wedding.id}-${Date.now()}`,
      content,
      createdAt: today,
      author: input.author ?? 'Karolina',
      pinned: input.pinned ?? false,
    }

    const next: Wedding = {
      ...wedding,
      notes: [note, ...wedding.notes],
      timeline: prependTimelineEntry(
        wedding.timeline,
        createTimelineEntry({
          title: 'Dodano notatkę.',
          type: 'note_added',
          description: content.slice(0, 100),
        }),
      ),
    }

    return weddingService.update(next)
  },

  async generateContract(weddingId: string): Promise<GenerateContractResult> {
    const wedding = await requireWedding(weddingId)
    const missingFields = getMissingContractFields(wedding)
    const today = new Date().toISOString().slice(0, 10)
    const couple = coupleName(wedding.couple.partner1, wedding.couple.partner2)

    const next: Wedding = {
      ...wedding,
      contract: {
        ...wedding.contract,
        status: 'generated',
        generatedAt: today,
      },
      workflowStage:
        wedding.workflowStage === 'reservation' ? 'contract' : wedding.workflowStage,
      timeline: prependTimelineEntry(
        wedding.timeline,
        createTimelineEntry({
          title: 'Wygenerowano umowę.',
          type: 'contract_generated',
          description:
            missingFields.length > 0
              ? `Wygenerowano z brakującymi polami: ${missingFields.join(', ')}`
              : undefined,
        }),
      ),
    }

    const updated = await weddingService.update(next)

    addNotification({
      id: `notif-${Date.now()}`,
      title: 'Umowa wygenerowana',
      message: `Umowa dla pary ${couple} jest gotowa do wysłania.`,
      createdAt: today,
      read: false,
      type: 'info',
    })

    return { wedding: updated, missingFields }
  },

  /** Suggested deposit amount (30% of contract price). */
  getSuggestedDepositAmount(wedding: Wedding): number {
    return Math.round(wedding.price * 0.3)
  },

  hasDepositPayment(wedding: Wedding): boolean {
    return wedding.payments.some((p) => p.type === 'deposit' && p.paid)
  },
}

async function requireWedding(id: string): Promise<Wedding> {
  const wedding = await weddingService.getById(id)
  if (!wedding) throw new Error('Nie znaleziono ślubu.')
  return wedding
}

function getMissingContractFields(wedding: Wedding): string[] {
  const missing: string[] = []
  const { couple, questionnaires } = wedding

  if (questionnaires.contractData.status !== 'completed') {
    missing.push('ankieta do umowy nieukończona')
  }
  if (!couple.partner1?.trim()) missing.push('imię panny młodej')
  if (!couple.partner2?.trim()) missing.push('imię pana młodego')
  if (!couple.email?.trim() && !couple.partner1Email?.trim()) {
    missing.push('adres e-mail')
  }
  if (!couple.phone?.trim() && !couple.partner1Phone?.trim()) {
    missing.push('telefon')
  }
  if (!wedding.ceremonyLocation?.trim()) missing.push('miejsce ceremonii')
  if (!wedding.receptionLocation?.trim()) missing.push('miejsce przyjęcia')

  return missing
}
