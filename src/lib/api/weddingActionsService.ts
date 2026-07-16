import { contractService } from '@/lib/api/contractService'
import { createFormInstance, getActiveFormByCategory } from '@/lib/api/forms'
import { noteService } from '@/lib/api/noteService'
import { notificationService } from '@/lib/api/notificationService'
import { paymentService } from '@/lib/api/paymentService'
import { timelineEventService } from '@/lib/api/timelineEventService'
import { weddingService } from '@/lib/api/weddingService'
import { getDepositPaid } from '@/lib/utils/finance'
import { coupleName } from '@/lib/utils/dates'
import { getNextStage } from '@/lib/workflow/workflowEngine'
import type { FormCategory } from '@/types/formEngine'
import type {
  PaymentMethod,
  PaymentType,
  Wedding,
} from '@/types/wedding'

export type QuestionnaireKind = 'contractData' | 'weddingQuestionnaire'

const QUESTIONNAIRE_CONFIG: Record<
  QuestionnaireKind,
  {
    formCategory: FormCategory
    timelineTitle: string
    notificationTitle: string
    notificationMessage: (couple: string) => string
  }
> = {
  contractData: {
    formCategory: 'contract',
    timelineTitle: 'Wysłano: Dane do umowy.',
    notificationTitle: 'Dane do umowy — wysłano',
    notificationMessage: (couple) =>
      `Formularz „Dane do umowy” został wysłany do pary ${couple}.`,
  },
  weddingQuestionnaire: {
    formCategory: 'pre_wedding',
    timelineTitle: 'Wysłano ankietę przedślubną.',
    notificationTitle: 'Ankieta przedślubna wysłana',
    notificationMessage: (couple) =>
      `Ankieta przedślubna została wysłana do pary ${couple}.`,
  },
}

export interface SendQuestionnaireInput {
  weddingId: string
  kind: QuestionnaireKind
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
 * Studio actions for Wedding Detail — persist via dedicated domain services.
 */
export const weddingActionsService = {
  async sendQuestionnaire(
    input: SendQuestionnaireInput,
  ): Promise<{ wedding: Wedding; formToken: string; formUrl: string }> {
    const wedding = await requireWedding(input.weddingId)
    const config = QUESTIONNAIRE_CONFIG[input.kind]
    const qKey = input.kind

    if (wedding.questionnaires[qKey].status !== 'not_sent') {
      throw new Error('Ankieta została już wysłana.')
    }

    const form = await getActiveFormByCategory(config.formCategory)
    if (!form) {
      throw new Error(
        input.kind === 'contractData'
          ? 'Brak aktywnego formularza ankiety do umowy.'
          : 'Brak aktywnego formularza ankiety przedślubnej.',
      )
    }

    const instance = await createFormInstance(form.id, wedding.id)
    const formToken = instance.token
    const formUrl = `${window.location.origin}/form/${formToken}`

    const today = new Date().toISOString().slice(0, 10)
    const couple = coupleName(wedding.couple.partner1, wedding.couple.partner2)

    await weddingService.update({
      ...wedding,
      questionnaires: {
        ...wedding.questionnaires,
        [qKey]: {
          status: 'sent',
          sentAt: today,
        },
      },
    })

    await timelineEventService.create({
      weddingId: wedding.id,
      type: 'questionnaire_sent',
      title: config.timelineTitle,
      description: 'Wygenerowano link do ankiety.',
      date: today,
    })

    await notificationService.create({
      title: config.notificationTitle,
      message: config.notificationMessage(couple),
      type: 'success',
      entityType: 'wedding',
      entityId: wedding.id,
    })

    const updated = await weddingService.getById(wedding.id)
    if (!updated) {
      throw new Error('Nie znaleziono ślubu po wysłaniu ankiety.')
    }
    return { wedding: updated, formToken, formUrl }
  },

  async addPayment(input: AddPaymentInput): Promise<Wedding> {
    const wedding = await requireWedding(input.weddingId)
    const today = new Date().toISOString().slice(0, 10)
    const type = input.type ?? 'installment'
    const label =
      input.label ??
      (type === 'deposit' ? 'Zadatek' : 'Wpłata')
    const paymentDate = input.date || today

    await paymentService.create({
      weddingId: wedding.id,
      type,
      amount: input.amount,
      paymentDate,
      method: input.method,
      note: input.note?.trim() || undefined,
    })

    const payments = await paymentService.listByWeddingId(wedding.id)

    let workflowStage = wedding.workflowStage
    if (wedding.workflowStage === 'deposit' && getDepositPaid(payments) > 0) {
      const advanced = getNextStage('deposit')
      if (advanced) workflowStage = advanced
    }

    const methodLabel = PAYMENT_METHOD_LABELS[input.method]
    const couple = coupleName(wedding.couple.partner1, wedding.couple.partner2)

    if (workflowStage !== wedding.workflowStage) {
      await weddingService.update({
        ...wedding,
        workflowStage,
      })
    }

    await timelineEventService.create({
      weddingId: wedding.id,
      type: 'payment_received',
      title: 'Dodano wpłatę.',
      description: `${label}: ${input.amount} zł · ${methodLabel}`,
      date: paymentDate,
    })

    if (type === 'deposit') {
      await notificationService.create({
        title: 'Zadatek otrzymany',
        message: `Zarejestrowano zadatek dla pary ${couple}.`,
        type: 'success',
        entityType: 'wedding',
        entityId: wedding.id,
      })
    }

    const updated = await weddingService.getById(wedding.id)
    if (!updated) {
      throw new Error('Nie znaleziono ślubu po zapisaniu wpłaty.')
    }
    return updated
  },

  async addNote(input: AddNoteInput): Promise<Wedding> {
    const wedding = await requireWedding(input.weddingId)
    const content = input.content.trim()
    if (!content) throw new Error('Notatka nie może być pusta.')

    await noteService.create({
      weddingId: wedding.id,
      content,
      author: input.author ?? 'Karolina',
      pinned: input.pinned ?? false,
    })

    await timelineEventService.create({
      weddingId: wedding.id,
      type: 'note_added',
      title: 'Dodano notatkę.',
      description: content.slice(0, 100),
    })

    const updated = await weddingService.getById(wedding.id)
    if (!updated) {
      throw new Error('Nie znaleziono ślubu po zapisaniu notatki.')
    }
    return updated
  },

  async generateContract(weddingId: string): Promise<GenerateContractResult> {
    const wedding = await requireWedding(weddingId)
    const missingFields = getMissingContractFields(wedding)
    const today = new Date().toISOString().slice(0, 10)
    const couple = coupleName(wedding.couple.partner1, wedding.couple.partner2)

    await contractService.updateStatus(wedding.id, 'generated')

    const workflowStage =
      wedding.workflowStage === 'reservation' ? 'contract' : wedding.workflowStage

    if (workflowStage !== wedding.workflowStage) {
      await weddingService.update({
        ...wedding,
        workflowStage,
      })
    }

    await timelineEventService.create({
      weddingId: wedding.id,
      type: 'contract_generated',
      title: 'Wygenerowano umowę.',
      description:
        missingFields.length > 0
          ? `Wygenerowano z brakującymi polami: ${missingFields.join(', ')}`
          : undefined,
      date: today,
    })

    await notificationService.create({
      title: 'Umowa wygenerowana',
      message: `Umowa dla pary ${couple} jest gotowa do wysłania.`,
      type: 'info',
      entityType: 'wedding',
      entityId: wedding.id,
    })

    const updated = await weddingService.getById(wedding.id)
    if (!updated) {
      throw new Error('Nie znaleziono ślubu po wygenerowaniu umowy.')
    }

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
