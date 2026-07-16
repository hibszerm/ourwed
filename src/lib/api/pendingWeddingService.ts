import { mockPackages } from '@/mocks/packages'
import { addNotification } from '@/mocks/notifications'
import { formEngine } from '@/lib/forms/formEngine'
import { createSystemNote, prependWeddingNote } from '@/lib/utils/systemNotes'
import { weddingService } from '@/lib/api/weddingService'
import type {
  Form,
  FormSubmission,
  FormTemplate,
  PendingWedding,
  PendingWeddingStatus,
} from '@/types/form'

const sampleNote = createSystemNote({
  body: 'Prosimy o kontakt wieczorem.',
  source: 'contract_questionnaire',
  createdAt: '2026-07-15',
  author: 'Para',
  id: 'n-pw-sample',
})

let pendingStore: PendingWedding[] = [
  {
    id: 'pw-sample',
    status: 'pending',
    formId: 'form-sample',
    submissionId: 'sub-sample',
    coupleLabel: 'Ola i Tomek',
    partner1FirstName: 'Ola',
    partner1LastName: 'Nowak',
    partner2FirstName: 'Tomek',
    partner2LastName: 'Kowalski',
    weddingDate: '2027-06-12',
    packageId: 'p1',
    packageName: 'Premium Full Day',
    packagePrice: 45000,
    ceremonyLocation: 'Kościół Mariacki, Kraków',
    receptionLocation: 'Pałac Decjusza',
    preparationLocation: 'Hotel Stary',
    additionalNotes: 'Prosimy o kontakt wieczorem.',
    systemNotes: sampleNote ? [sampleNote] : [],
    partner1: {
      firstName: 'Ola',
      lastName: 'Nowak',
      address: 'ul. Długa 1',
      postalCode: '31-147',
      city: 'Kraków',
      phone: '+48 500 100 200',
      email: 'ola@email.pl',
    },
    partner2: {
      firstName: 'Tomek',
      lastName: 'Kowalski',
      address: 'ul. Długa 1',
      postalCode: '31-147',
      city: 'Kraków',
      phone: '+48 500 100 201',
      email: 'tomek@email.pl',
    },
    submittedAt: '2026-07-15T10:30:00.000Z',
  },
]

/**
 * Pending Weddings — Scenario B (form without existing wedding).
 * Ready for Supabase table `pending_weddings`.
 */
export const pendingWeddingService = {
  async getAll(): Promise<PendingWedding[]> {
    await delay(80)
    return [...pendingStore]
  },

  async getPending(): Promise<PendingWedding[]> {
    const all = await this.getAll()
    return all.filter((p) => p.status === 'pending')
  },

  async getById(id: string): Promise<PendingWedding | null> {
    await delay(40)
    return pendingStore.find((p) => p.id === id) ?? null
  },

  async createFromSubmission(
    form: Form,
    submission: FormSubmission,
    template: FormTemplate,
  ): Promise<PendingWedding> {
    await delay(100)

    const fields = formEngine.answersToFieldMap(template, submission.answers)
    const str = (key: string) => formEngine.getFieldString(fields, key)

    const packageId = str('packageId')
    const pkg = mockPackages.find((p) => p.id === packageId)
    const p1First = str('partner1.firstName')
    const p2First = str('partner2.firstName')
    const additionalNotes = str('additionalNotes')
    const submittedDate = submission.submittedAt.slice(0, 10)

    const questionnaireNote = createSystemNote({
      body: additionalNotes,
      source: 'contract_questionnaire',
      createdAt: submittedDate,
      author: 'Para',
    })

    const pending: PendingWedding = {
      id: `pw-${Date.now()}`,
      status: 'pending',
      formId: form.id,
      submissionId: submission.id,
      coupleLabel: `${p1First} i ${p2First}`,
      partner1FirstName: p1First,
      partner1LastName: str('partner1.lastName'),
      partner2FirstName: p2First,
      partner2LastName: str('partner2.lastName'),
      weddingDate: str('weddingDate'),
      packageId: packageId || (mockPackages[0]?.id ?? ''),
      packageName: pkg?.name ?? '—',
      packagePrice: pkg?.price ?? 0,
      ceremonyLocation: str('ceremonyLocation'),
      receptionLocation: str('receptionLocation'),
      preparationLocation: str('preparationLocation'),
      additionalNotes,
      systemNotes: questionnaireNote ? [questionnaireNote] : [],
      partner1: {
        firstName: p1First,
        lastName: str('partner1.lastName'),
        address: str('partner1.address'),
        postalCode: str('partner1.postalCode'),
        city: str('partner1.city'),
        phone: str('partner1.phone'),
        email: str('partner1.email'),
      },
      partner2: {
        firstName: p2First,
        lastName: str('partner2.lastName'),
        address: str('partner2.address'),
        postalCode: str('partner2.postalCode'),
        city: str('partner2.city'),
        phone: str('partner2.phone'),
        email: str('partner2.email'),
      },
      submittedAt: submission.submittedAt,
    }

    pendingStore = [pending, ...pendingStore]
    return pending
  },

  /**
   * Akceptuj → Wedding + calendar (via wedding list) + first task + timeline + notification.
   * System notes from the questionnaire are copied onto the Wedding.
   */
  async accept(id: string): Promise<PendingWedding | null> {
    await delay(200)
    const pending = pendingStore.find((p) => p.id === id)
    if (!pending || pending.status !== 'pending') return null

    const wedding = await weddingService.create({
      partner1: pending.partner1FirstName,
      partner2: pending.partner2FirstName,
      date: pending.weddingDate,
      packageName: pending.packageName,
      price: pending.packagePrice,
      depositPaid: false,
      ceremonyLocation: pending.ceremonyLocation,
      receptionLocation: pending.receptionLocation,
    })

    const today = new Date().toISOString().slice(0, 10)

    let notes = wedding.notes
    for (const note of [...pending.systemNotes].reverse()) {
      notes = prependWeddingNote(notes, note)
    }

    await weddingService.update({
      ...wedding,
      couple: {
        ...wedding.couple,
        partner1Phone: pending.partner1.phone,
        partner1Email: pending.partner1.email,
        partner2Phone: pending.partner2.phone,
        partner2Email: pending.partner2.email,
        phone: pending.partner1.phone,
        email: pending.partner1.email,
        city: pending.partner1.city,
      },
      questionnaires: {
        ...wedding.questionnaires,
        contractData: {
          status: 'completed',
          sentAt: pending.submittedAt.slice(0, 10),
          completedAt: today,
        },
      },
      notes,
      timeline: [
        {
          id: `tl-${wedding.id}-accepted`,
          title: 'Zaakceptowano zgłoszenie z formularza',
          date: today,
          description: 'Status: Oczekuje na zatwierdzenie → Zaakceptowano',
          type: 'created',
        },
        ...wedding.timeline,
      ],
    })

    addNotification({
      id: `n-accept-${Date.now()}`,
      title: 'Nowe zlecenie zaakceptowane',
      message: `${pending.coupleLabel} — dodano do kalendarza.`,
      createdAt: today,
      read: false,
      type: 'success',
    })

    return setStatus(id, 'accepted', { weddingId: wedding.id, reviewedAt: today })
  },

  async reject(id: string): Promise<PendingWedding | null> {
    await delay(150)
    const pending = pendingStore.find((p) => p.id === id)
    if (!pending || pending.status !== 'pending') return null

    const today = new Date().toISOString().slice(0, 10)
    addNotification({
      id: `n-reject-${Date.now()}`,
      title: 'Zgłoszenie odrzucone',
      message: `${pending.coupleLabel} — odrzucono.`,
      createdAt: today,
      read: false,
      type: 'info',
    })

    return setStatus(id, 'rejected', { reviewedAt: today })
  },
}

function setStatus(
  id: string,
  status: PendingWeddingStatus,
  extra: Partial<PendingWedding>,
): PendingWedding | null {
  let updated: PendingWedding | null = null
  pendingStore = pendingStore.map((p) => {
    if (p.id !== id) return p
    updated = { ...p, status, ...extra }
    return updated
  })
  return updated
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
