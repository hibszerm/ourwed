import { noteService } from '@/lib/api/noteService'
import { notificationService } from '@/lib/api/notificationService'
import { taskService } from '@/lib/api/taskService'
import { timelineEventService } from '@/lib/api/timelineEventService'
import { weddingService } from '@/lib/api/weddingService'
import type { PendingWedding, PendingWeddingStatus } from '@/types/form'

/**
 * Pending Weddings queue (Scenario B — form without existing wedding).
 * In-memory until a `pending_weddings` table exists.
 * Isolated from the Form Engine production path (`/form/:token`).
 */
const samplePending: PendingWedding = {
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
  packageId: '',
  packageName: '',
  packagePrice: 0,
  ceremonyLocation: 'Kościół Mariacki, Kraków',
  receptionLocation: 'Pałac Decjusza',
  preparationLocation: 'Hotel Stary',
  additionalNotes: 'Prosimy o kontakt wieczorem.',
  systemNotes: [
    {
      id: 'n-pw-sample',
      content: 'Prosimy o kontakt wieczorem.',
      createdAt: '2026-07-15',
      author: 'Para',
      source: 'contract_questionnaire',
      badge: 'Dane do umowy',
    },
  ],
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
}

let pendingStore: PendingWedding[] = [samplePending]

export const pendingWeddingService = {
  async getAll(): Promise<PendingWedding[]> {
    return [...pendingStore]
  },

  async getPending(): Promise<PendingWedding[]> {
    return pendingStore.filter((p) => p.status === 'pending')
  },

  async getById(id: string): Promise<PendingWedding | null> {
    return pendingStore.find((p) => p.id === id) ?? null
  },

  async accept(id: string): Promise<PendingWedding | null> {
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

    for (const note of pending.systemNotes) {
      await noteService.create({
        weddingId: wedding.id,
        content: note.content,
        author: note.author,
      })
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
    })

    await timelineEventService.create({
      weddingId: wedding.id,
      type: 'created',
      title: 'Zaakceptowano zgłoszenie z formularza',
      description: 'Status: Oczekuje na zatwierdzenie → Zaakceptowano',
      date: today,
    })

    await taskService.create({
      weddingId: wedding.id,
      title: 'Wyślij umowę do podpisu',
      dueDate: today,
    })

    await notificationService.create({
      title: 'Nowe zlecenie zaakceptowane',
      message: `${pending.coupleLabel} — dodano do kalendarza.`,
      type: 'success',
      entityType: 'wedding',
      entityId: wedding.id,
    })

    return setStatus(id, 'accepted', { weddingId: wedding.id, reviewedAt: today })
  },

  async reject(id: string): Promise<PendingWedding | null> {
    const pending = pendingStore.find((p) => p.id === id)
    if (!pending || pending.status !== 'pending') return null

    await notificationService.create({
      title: 'Zgłoszenie odrzucone',
      message: `${pending.coupleLabel} — odrzucono.`,
      type: 'info',
    })

    return setStatus(id, 'rejected', {
      reviewedAt: new Date().toISOString().slice(0, 10),
    })
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
