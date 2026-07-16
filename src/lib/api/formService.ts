import { mockPackages } from '@/mocks/packages'
import { mockForms } from '@/mocks/forms'
import { FORM_TEMPLATES, mockFormSettings } from '@/mocks/formTemplates'
import { formEngine } from '@/lib/forms/formEngine'
import { applyPackageChangeToWedding } from '@/lib/utils/packageChange'
import {
  createSystemNote,
  prependWeddingNote,
} from '@/lib/utils/systemNotes'
import { weddingService } from '@/lib/api/weddingService'
import { pendingWeddingService } from '@/lib/api/pendingWeddingService'
import type {
  AnswerValue,
  Form,
  FormSettings,
  FormSubmission,
  FormTemplate,
  QuestionAnswer,
  ResolvedForm,
  SubmitFormResult,
} from '@/types/form'
import type { Wedding } from '@/types/wedding'

let formsStore: Form[] = mockForms.map((f) => ({ ...f }))
let submissionsStore: FormSubmission[] = []

/**
 * Form Service — mock CRUD ready for Supabase.
 * Future: supabase.from('forms').select().eq('token', token)
 */
export const formService = {
  async getSettings(): Promise<FormSettings> {
    await delay(40)
    return { ...mockFormSettings }
  },

  async getByToken(token: string): Promise<Form | null> {
    await delay(80)
    return formsStore.find((f) => f.token === token) ?? null
  },

  async getTemplate(templateId: string): Promise<FormTemplate | null> {
    await delay(20)
    const tpl = formEngine.getTemplateById(FORM_TEMPLATES, templateId)
    return tpl ? structuredClone(tpl) : null
  },

  async getResolvedForm(token: string): Promise<ResolvedForm | null> {
    const form = await this.getByToken(token)
    if (!form) return null

    const template = await this.getTemplate(form.templateId)
    if (!template) return null

    const baseSettings = await this.getSettings()
    const settings: FormSettings = {
      ...baseSettings,
      ...form.settingsOverride,
      // Prefer template success copy when present
      successTitle: form.settingsOverride?.successTitle ?? template.successTitle,
      successDescription:
        form.settingsOverride?.successDescription ?? template.successDescription,
    }

    const initialAnswers = await buildInitialAnswers(form, template)

    return { form, template, settings, initialAnswers }
  },

  async submit(
    token: string,
    answers: QuestionAnswer[],
  ): Promise<SubmitFormResult | null> {
    await delay(250)

    const form = await this.getByToken(token)
    if (!form || form.status === 'closed') return null

    const template = await this.getTemplate(form.templateId)
    if (!template || template.comingSoon) return null

    const values = Object.fromEntries(answers.map((a) => [a.questionId, a.value]))
    const errors = formEngine.validateAnswers(template, values)
    if (Object.keys(errors).length > 0) {
      return null
    }

    const submission: FormSubmission = {
      id: `sub-${Date.now()}`,
      formId: form.id,
      answers,
      submittedAt: new Date().toISOString(),
    }
    submissionsStore = [...submissionsStore, submission]

    formsStore = formsStore.map((f) =>
      f.id === form.id ? { ...f, status: 'submitted' as const } : f,
    )

    if (form.weddingId) {
      const packageChanged = await applyAnswersToWedding(
        form.weddingId,
        template,
        answers,
      )
      return {
        success: true,
        submission,
        scenario: 'update_wedding',
        weddingId: form.weddingId,
        packageChanged,
      }
    }

    const pending = await pendingWeddingService.createFromSubmission(
      form,
      submission,
      template,
    )

    return {
      success: true,
      submission,
      scenario: 'pending_wedding',
      pendingWeddingId: pending.id,
    }
  },

  async listSubmissions(): Promise<FormSubmission[]> {
    return [...submissionsStore]
  },

  /**
   * Create an open form instance for a wedding and return a public token.
   * Used by "Wyślij ankietę" studio actions.
   */
  async createForWedding(
    weddingId: string,
    templateId: string,
  ): Promise<Form> {
    await delay(120)

    const template = await this.getTemplate(templateId)
    if (!template) {
      throw new Error(`Unknown template: ${templateId}`)
    }

    const token = `f-${weddingId}-${templateId.replace(/^tpl-/, '')}-${Date.now().toString(36)}`
    const form: Form = {
      id: `form-${Date.now()}`,
      token,
      templateId,
      weddingId,
      status: 'open',
      createdAt: new Date().toISOString(),
    }

    formsStore = [...formsStore, form]
    return form
  },
}

async function buildInitialAnswers(
  form: Form,
  template: FormTemplate,
): Promise<Record<string, AnswerValue>> {
  const initial: Record<string, AnswerValue> = {}

  if (!form.weddingId) {
    for (const q of formEngine.getInputQuestions(template)) {
      initial[q.id] = q.type === 'checkbox' ? false : q.type === 'multiselect' ? [] : ''
    }
    return initial
  }

  const wedding = await weddingService.getById(form.weddingId)
  if (!wedding) return initial

  const fieldValues = weddingToFieldMap(wedding)

  for (const q of formEngine.getInputQuestions(template)) {
    if (q.fieldKey && fieldValues[q.fieldKey] !== undefined) {
      initial[q.id] = fieldValues[q.fieldKey]
    } else if (q.type === 'checkbox') {
      initial[q.id] = false
    } else if (q.type === 'multiselect') {
      initial[q.id] = []
    } else {
      initial[q.id] = ''
    }
  }

  return initial
}

function weddingToFieldMap(wedding: Wedding): Record<string, AnswerValue> {
  const pkg = mockPackages.find((p) => p.name === wedding.packageName)
  return {
    weddingDate: wedding.date,
    packageId: pkg?.id ?? '',
    'partner1.firstName': wedding.couple.partner1,
    'partner1.lastName': '',
    'partner1.address': '',
    'partner1.postalCode': '',
    'partner1.city': wedding.couple.city || '',
    'partner1.phone': wedding.couple.partner1Phone || wedding.couple.phone || '',
    'partner1.email': wedding.couple.partner1Email || wedding.couple.email || '',
    'partner2.firstName': wedding.couple.partner2,
    'partner2.lastName': '',
    'partner2.address': '',
    'partner2.postalCode': '',
    'partner2.city': wedding.couple.city || '',
    'partner2.phone': wedding.couple.partner2Phone || '',
    'partner2.email': wedding.couple.partner2Email || '',
    preparationLocation: '',
    ceremonyLocation: wedding.ceremonyLocation ?? '',
    receptionLocation: wedding.receptionLocation ?? '',
    additionalNotes: '',
  }
}

async function applyAnswersToWedding(
  weddingId: string,
  template: FormTemplate,
  answers: QuestionAnswer[],
): Promise<boolean> {
  const wedding = await weddingService.getById(weddingId)
  if (!wedding) return false

  const fields = formEngine.answersToFieldMap(template, answers)
  const str = (key: string) => formEngine.getFieldString(fields, key)

  const packageId = str('packageId')
  const pkg = mockPackages.find((p) => p.id === packageId)
  let next = wedding
  let packageChanged = false

  if (pkg && pkg.name !== wedding.packageName) {
    next = applyPackageChangeToWedding(wedding, pkg)
    packageChanged = true
  }

  const today = new Date().toISOString().slice(0, 10)
  const notesBody = str('additionalNotes')
  const questionnaireNote = createSystemNote({
    body: notesBody,
    source: 'contract_questionnaire',
    createdAt: today,
    author: 'Para',
  })

  next = {
    ...next,
    date: str('weddingDate') || next.date,
    ceremonyLocation: str('ceremonyLocation') || next.ceremonyLocation,
    receptionLocation: str('receptionLocation') || next.receptionLocation,
    price: pkg?.price ?? next.price,
    packageName: pkg?.name ?? next.packageName,
    accentColor: pkg?.color ?? next.accentColor,
    couple: {
      ...next.couple,
      partner1: str('partner1.firstName') || next.couple.partner1,
      partner2: str('partner2.firstName') || next.couple.partner2,
      partner1Phone: str('partner1.phone') || next.couple.partner1Phone,
      partner1Email: str('partner1.email') || next.couple.partner1Email,
      partner2Phone: str('partner2.phone') || next.couple.partner2Phone,
      partner2Email: str('partner2.email') || next.couple.partner2Email,
      phone: str('partner1.phone') || next.couple.phone,
      email: str('partner1.email') || next.couple.email,
      city: str('partner1.city') || next.couple.city,
      venue: str('receptionLocation') || next.couple.venue,
    },
    questionnaires: {
      ...next.questionnaires,
      contractData: {
        status: 'completed',
        sentAt: next.questionnaires.contractData.sentAt ?? today,
        completedAt: today,
      },
    },
    timeline: [
      {
        id: `tl-${weddingId}-form-${Date.now()}`,
        title: 'Wypełniono ankietę do umowy',
        date: today,
        type: 'questionnaire_completed',
      },
      ...next.timeline,
    ],
    notes: prependWeddingNote(next.notes, questionnaireNote),
  }

  await weddingService.update(next)
  return packageChanged
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
