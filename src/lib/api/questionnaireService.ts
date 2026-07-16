import {
  archiveFormInstance,
  createFormInstance,
  deleteFormInstance,
  getActiveFormByCategory,
  getForm,
  getFormAnswersByInstanceId,
  getFormInstanceById,
  listFormAnswersByInstanceIds,
  listFormInstances,
  listPendingLeadInstances,
  markFormInstanceApproved,
  rejectFormInstance,
  revokeFormInstance,
} from '@/lib/api/forms'
import { noteService } from '@/lib/api/noteService'
import { notificationService } from '@/lib/api/notificationService'
import { timelineEventService } from '@/lib/api/timelineEventService'
import { weddingService } from '@/lib/api/weddingService'
import { packageService } from '@/lib/api/packageService'
import { asCatalogPackageId } from '@/lib/supabase/helpers'
import { extractAnswerFields } from '@/lib/forms/mergeFormAnswersIntoWedding'
import type {
  FormAnswerJson,
  FormAnswerRecord,
  FormDefinition,
  FormInstance,
  FormInstanceStatus,
} from '@/types/formEngine'
import type { Wedding } from '@/types/wedding'

export type QuestionnaireExpiration = '7d' | '14d' | '30d' | 'never'

export type QuestionnaireType = 'contract'

/** CRM-only display label for contract questionnaires (DB category stays `contract`). */
export const CONTRACT_QUESTIONNAIRE_UI_LABEL = 'Dane do umowy'

export function questionnaireTypeLabel(
  form: FormDefinition | null | undefined,
): string {
  if (form?.category === 'contract') return CONTRACT_QUESTIONNAIRE_UI_LABEL
  return form?.name?.trim() || 'Ankieta'
}

export interface QuestionnaireSearchFields {
  bride: string
  groom: string
  email: string
  phone: string
  weddingDate: string
}

export interface QuestionnaireListItem {
  instance: FormInstance
  form: FormDefinition | null
  /** CRM display name (e.g. "Dane do umowy"). */
  formName: string
  formUrl: string
  search: QuestionnaireSearchFields
}

export interface QuestionnaireTimelineEvent {
  id: string
  title: string
  at: string
  description?: string
}

export interface PendingQuestionnaireItem {
  instance: FormInstance
  form: FormDefinition | null
  formName: string
  coupleLabel: string
  weddingDate: string
  packageName: string
  ceremonyLocation: string
  receptionLocation: string
  phone: string
  email: string
  answerJson: FormAnswerJson | null
}

function fieldString(fields: Record<string, unknown>, key: string): string {
  const value = fields[key]
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function fullName(first: string, last: string): string {
  return [first, last].filter(Boolean).join(' ').trim()
}

function expiresAtFromOption(option: QuestionnaireExpiration): string | null {
  if (option === 'never') return null
  const days = option === '7d' ? 7 : option === '14d' ? 14 : 30
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function publicFormUrl(token: string): string {
  return `${window.location.origin}/form/${token}`
}

async function summarizeAnswers(answerJson: FormAnswerJson | null) {
  const fields = answerJson ? extractAnswerFields(answerJson) : {}
  const bride = fullName(
    fieldString(fields, 'partner1.firstName'),
    fieldString(fields, 'partner1.lastName'),
  )
  const groom = fullName(
    fieldString(fields, 'partner2.firstName'),
    fieldString(fields, 'partner2.lastName'),
  )
  const packageId = asCatalogPackageId(fieldString(fields, 'packageId'))
  const pkg = packageId ? await packageService.get(packageId) : null
  const phone = fieldString(fields, 'partner1.phone')
  const partner2Phone = fieldString(fields, 'partner2.phone')

  return {
    fields,
    bride,
    groom,
    coupleLabel:
      bride && groom ? `${bride} i ${groom}` : bride || groom || 'Para',
    weddingDate: fieldString(fields, 'weddingDate'),
    packageId: pkg?.id ?? null,
    packageName: pkg?.name ?? '',
    packagePrice: pkg?.price ?? 0,
    depositAmount: pkg?.depositAmount ?? 0,
    currency: pkg?.currency ?? 'PLN',
    accentColor: pkg?.color ?? undefined,
    ceremonyLocation: fieldString(fields, 'ceremonyLocation'),
    receptionLocation: fieldString(fields, 'receptionLocation'),
    preparationLocation: fieldString(fields, 'preparationLocation'),
    phone,
    email: fieldString(fields, 'partner1.email'),
    partner2Phone,
    city: fieldString(fields, 'partner1.city'),
    additionalNotes: fieldString(fields, 'additionalNotes'),
  }
}

function searchFromSummary(
  summary: Awaited<ReturnType<typeof summarizeAnswers>>,
): QuestionnaireSearchFields {
  return {
    bride: summary.bride,
    groom: summary.groom,
    email: summary.email,
    phone: [summary.phone, summary.partner2Phone].filter(Boolean).join(' '),
    weddingDate: summary.weddingDate,
  }
}

function searchFromWedding(wedding: Wedding): QuestionnaireSearchFields {
  return {
    bride: wedding.couple.partner1,
    groom: wedding.couple.partner2,
    email:
      wedding.couple.email ||
      wedding.couple.partner1Email ||
      wedding.couple.partner2Email ||
      '',
    phone:
      [
        wedding.couple.phone,
        wedding.couple.partner1Phone,
        wedding.couple.partner2Phone,
      ]
        .filter(Boolean)
        .join(' ') || '',
    weddingDate: wedding.date,
  }
}

export const QUESTIONNAIRE_STATUS_LABELS: Record<FormInstanceStatus, string> = {
  pending: 'Oczekuje',
  opened: 'Otwarta',
  submitted: 'Wysłana',
  expired: 'Wygasła',
  revoked: 'Unieważniona',
  approved: 'Zatwierdzona',
  rejected: 'Odrzucona',
  archived: 'Zarchiwizowana',
}

export type QuestionnaireStatusFilter =
  | 'all'
  | 'pending'
  | 'opened'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'expired'

export const QUESTIONNAIRE_STATUS_FILTERS: {
  id: QuestionnaireStatusFilter
  label: string
}[] = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'pending', label: 'Oczekuje' },
  { id: 'opened', label: 'Otwarta' },
  { id: 'submitted', label: 'Wysłana' },
  { id: 'approved', label: 'Zatwierdzona' },
  { id: 'rejected', label: 'Odrzucona' },
  { id: 'expired', label: 'Wygasła' },
]

export function questionnaireStatusVariant(
  status: FormInstanceStatus,
): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'pending':
      return 'neutral'
    case 'opened':
      return 'info'
    case 'submitted':
      return 'warning'
    case 'approved':
      return 'success'
    case 'expired':
    case 'revoked':
    case 'rejected':
      return 'danger'
    case 'archived':
      return 'neutral'
    default:
      return 'neutral'
  }
}

export function matchesQuestionnaireSearch(
  item: QuestionnaireListItem,
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    item.search.bride,
    item.search.groom,
    item.search.email,
    item.search.phone,
    item.search.weddingDate,
    item.formName,
  ]
    .join(' ')
    .toLowerCase()
  if (haystack.includes(q)) return true

  const digits = q.replace(/\D/g, '')
  if (digits.length >= 3) {
    const phoneDigits = item.search.phone.replace(/\D/g, '')
    if (phoneDigits.includes(digits)) return true
  }

  return false
}

/**
 * CRM Questionnaires module — orchestrates Form Engine for lead + wedding flows.
 */
export const questionnaireService = {
  async list(): Promise<QuestionnaireListItem[]> {
    const instances = await listFormInstances()
    const forms = await Promise.all(
      [...new Set(instances.map((i) => i.formId))].map((id) => getForm(id)),
    )
    const byId = new Map(
      forms.filter(Boolean).map((f) => [f!.id, f!] as const),
    )

    const answeredIds = instances
      .filter(
        (i) =>
          i.submittedAt ||
          i.status === 'submitted' ||
          i.status === 'approved',
      )
      .map((i) => i.id)
    const answersMap = await listFormAnswersByInstanceIds(answeredIds)

    const weddingIds = [
      ...new Set(
        instances.map((i) => i.weddingId).filter((id): id is string => Boolean(id)),
      ),
    ]
    const weddingMap = new Map<string, Wedding>()
    if (weddingIds.length > 0) {
      try {
        const weddings = await weddingService.getAll()
        for (const w of weddings) {
          if (weddingIds.includes(w.id)) weddingMap.set(w.id, w)
        }
      } catch {
        // Search enrichment is best-effort.
      }
    }

    return Promise.all(
      instances.map(async (instance) => {
        const form = byId.get(instance.formId) ?? null
        const answers = answersMap.get(instance.id)
        let search: QuestionnaireSearchFields = {
          bride: '',
          groom: '',
          email: '',
          phone: '',
          weddingDate: '',
        }

        if (answers?.answerJson) {
          search = searchFromSummary(await summarizeAnswers(answers.answerJson))
        } else if (instance.weddingId) {
          const wedding = weddingMap.get(instance.weddingId)
          if (wedding) search = searchFromWedding(wedding)
        }

        return {
          instance,
          form,
          formName: questionnaireTypeLabel(form),
          formUrl: publicFormUrl(instance.token),
          search,
        }
      }),
    )
  },

  async getById(id: string): Promise<QuestionnaireListItem | null> {
    const instance = await getFormInstanceById(id)
    if (!instance) return null
    const form = await getForm(instance.formId)
    const answers = await getFormAnswersByInstanceId(id)
    let search: QuestionnaireSearchFields = {
      bride: '',
      groom: '',
      email: '',
      phone: '',
      weddingDate: '',
    }
    if (answers?.answerJson) {
      search = searchFromSummary(await summarizeAnswers(answers.answerJson))
    } else if (instance.weddingId) {
      try {
        const wedding = await weddingService.getById(instance.weddingId)
        if (wedding) search = searchFromWedding(wedding)
      } catch {
        // ignore
      }
    }

    return {
      instance,
      form,
      formName: questionnaireTypeLabel(form),
      formUrl: publicFormUrl(instance.token),
      search,
    }
  },

  async getAnswers(instanceId: string): Promise<FormAnswerRecord | null> {
    return getFormAnswersByInstanceId(instanceId)
  },

  buildTimeline(
    instance: FormInstance,
  ): QuestionnaireTimelineEvent[] {
    const events: QuestionnaireTimelineEvent[] = [
      {
        id: 'created',
        title: `Wygenerowano: ${CONTRACT_QUESTIONNAIRE_UI_LABEL}`,
        at: instance.createdAt,
        description: 'Utworzono unikalny link.',
      },
    ]

    if (instance.openedAt) {
      events.push({
        id: 'opened',
        title: `Otwarto: ${CONTRACT_QUESTIONNAIRE_UI_LABEL}`,
        at: instance.openedAt,
      })
    }

    if (instance.submittedAt) {
      events.push({
        id: 'submitted',
        title: `Wypełniono: ${CONTRACT_QUESTIONNAIRE_UI_LABEL}`,
        at: instance.submittedAt,
        description: instance.weddingId
          ? undefined
          : 'Utworzono oczekujące zgłoszenie.',
      })
    }

    if (instance.approvedAt) {
      events.push({
        id: 'approved',
        title: 'Zatwierdzono — utworzono ślub',
        at: instance.approvedAt,
      })
    }

    if (instance.rejectedAt) {
      events.push({
        id: 'rejected',
        title: 'Odrzucono',
        at: instance.rejectedAt,
      })
    }

    if (instance.expiresAt) {
      events.push({
        id: 'expires',
        title: 'Wygaśnięcie',
        at: instance.expiresAt,
        description:
          instance.status === 'expired' ? 'Link wygasł.' : 'Planowany termin ważności.',
      })
    }

    if (instance.status === 'revoked') {
      events.push({
        id: 'revoked',
        title: 'Unieważniono',
        at: instance.openedAt ?? instance.createdAt,
      })
    }

    return events.sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    )
  },

  async generate(input: {
    type: QuestionnaireType
    expiration: QuestionnaireExpiration
  }): Promise<{ instance: FormInstance; formUrl: string; formName: string }> {
    const form = await getActiveFormByCategory('contract')
    if (!form) {
      throw new Error('Brak aktywnego formularza „Dane do umowy”.')
    }

    const instance = await createFormInstance(form.id, null, {
      weddingId: null,
      expiresAt: expiresAtFromOption(input.expiration),
    })

    return {
      instance,
      formUrl: publicFormUrl(instance.token),
      formName: questionnaireTypeLabel(form),
    }
  },

  async revoke(id: string): Promise<FormInstance> {
    return revokeFormInstance(id)
  },

  async delete(id: string): Promise<void> {
    return deleteFormInstance(id)
  },

  async reject(id: string): Promise<FormInstance> {
    const instance = await rejectFormInstance(id)
    await notificationService.create({
      title: 'Ankieta odrzucona',
      message: `Zgłoszenie „${CONTRACT_QUESTIONNAIRE_UI_LABEL}” zostało odrzucone.`,
      type: 'info',
      entityType: 'form_instance',
      entityId: id,
    })
    return instance
  },

  async archive(id: string): Promise<FormInstance> {
    return archiveFormInstance(id)
  },

  async listPending(): Promise<PendingQuestionnaireItem[]> {
    const instances = await listPendingLeadInstances()
    const items: PendingQuestionnaireItem[] = []

    for (const instance of instances) {
      const form = await getForm(instance.formId)
      const answers = await getFormAnswersByInstanceId(instance.id)
      const summary = await summarizeAnswers(answers?.answerJson ?? null)
      items.push({
        instance,
        form,
        formName: questionnaireTypeLabel(form),
        coupleLabel: summary.coupleLabel,
        weddingDate: summary.weddingDate,
        packageName: summary.packageName,
        ceremonyLocation: summary.ceremonyLocation,
        receptionLocation: summary.receptionLocation,
        phone: summary.phone,
        email: summary.email,
        answerJson: answers?.answerJson ?? null,
      })
    }

    return items
  },

  async approve(instanceId: string): Promise<{ wedding: Wedding; instance: FormInstance }> {
    const instance = await getFormInstanceById(instanceId)
    if (!instance) throw new Error('Nie znaleziono ankiety.')
    if (instance.status !== 'submitted' || instance.weddingId) {
      throw new Error('Tę ankietę nie można zatwierdzić.')
    }

    const answers = await getFormAnswersByInstanceId(instanceId)
    if (!answers) throw new Error('Brak odpowiedzi w ankiecie.')

    const summary = await summarizeAnswers(answers.answerJson)
    if (!summary.bride || !summary.groom) {
      throw new Error('Ankieta nie zawiera imion pary.')
    }

    const wedding = await weddingService.create({
      partner1: summary.bride,
      partner2: summary.groom,
      date: summary.weddingDate,
      packageId: summary.packageId,
      packageName: summary.packageName || 'Pakiet',
      price: summary.packagePrice || 0,
      depositAmount: summary.depositAmount || undefined,
      currency: summary.currency,
      accentColor: summary.accentColor,
      depositPaid: false,
      ceremonyLocation: summary.ceremonyLocation || undefined,
      receptionLocation: summary.receptionLocation || undefined,
      notes: summary.additionalNotes || undefined,
    })

    await weddingService.update({
      ...wedding,
      couple: {
        ...wedding.couple,
        partner1: summary.bride,
        partner2: summary.groom,
        partner1Phone: summary.phone || undefined,
        partner2Phone: summary.partner2Phone || undefined,
        partner1Email: summary.email || undefined,
        phone: summary.phone,
        email: summary.email,
        city: summary.city,
        venue: summary.receptionLocation || summary.ceremonyLocation,
      },
      questionnaires: {
        ...wedding.questionnaires,
        contractData: {
          status: 'completed',
          sentAt: instance.createdAt.slice(0, 10),
          completedAt: instance.submittedAt?.slice(0, 10),
        },
      },
    })

    if (summary.additionalNotes) {
      await noteService.create({
        weddingId: wedding.id,
        content: summary.additionalNotes,
        author: 'Para',
      })
    }

    await timelineEventService.create({
      weddingId: wedding.id,
      type: 'questionnaire_completed',
      title: `Zaakceptowano: ${CONTRACT_QUESTIONNAIRE_UI_LABEL}.`,
      description: 'Oczekujące zgłoszenie → ślub utworzony z ankiety.',
      systemGenerated: true,
    })

    const approved = await markFormInstanceApproved(instanceId, wedding.id)

    await notificationService.create({
      title: 'Nowe zlecenie z ankiety',
      message: `${summary.coupleLabel} — dodano do CRM.`,
      type: 'success',
      entityType: 'wedding',
      entityId: wedding.id,
      link: `/sluby/${wedding.id}`,
    })

    const refreshed = await weddingService.getById(wedding.id)
    return { wedding: refreshed ?? wedding, instance: approved }
  },
}
