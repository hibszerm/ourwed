import { contactService } from '@/lib/api/contactService'
import { noteService } from '@/lib/api/noteService'
import { paymentService } from '@/lib/api/paymentService'
import { taskService } from '@/lib/api/taskService'
import { travelService } from '@/lib/api/travelService'
import { weddingExtraServiceService } from '@/lib/api/weddingExtraServiceService'
import { weddingService } from '@/lib/api/weddingService'
import { persistWeddingContractAnswerFields } from '@/lib/forms/persistWeddingContractAnswers'
import { isLikelyUuid } from '@/lib/supabase/helpers'
import type { WeddingExtraService } from '@/types/package'
import type {
  Payment,
  Task,
  Wedding,
  WeddingContact,
  WeddingNote,
} from '@/types/wedding'

export interface WeddingEditDraft {
  wedding: Wedding
  contacts: WeddingContact[]
  extras: WeddingExtraService[]
  notes: WeddingNote[]
  tasks: Task[]
  payments: Payment[]
  /** Package price portion before extras — used to recompute contract value. */
  packageBasePrice: number
}

export interface WeddingEditSnapshot {
  wedding: Wedding
  contacts: WeddingContact[]
  extras: WeddingExtraService[]
  tasks: Task[]
}

export function createWeddingEditDraft(
  snapshot: WeddingEditSnapshot,
): WeddingEditDraft {
  const extras = structuredClone(snapshot.extras)
  const extrasTotal = extras.reduce(
    (sum, e) => sum + e.priceSnapshot * e.quantity,
    0,
  )
  const wedding = structuredClone(snapshot.wedding)
  return {
    wedding,
    contacts: structuredClone(snapshot.contacts),
    extras,
    notes: structuredClone(snapshot.wedding.notes),
    tasks: structuredClone(snapshot.tasks),
    payments: structuredClone(snapshot.wedding.payments),
    packageBasePrice: Math.max(0, wedding.price - extrasTotal),
  }
}

export function recomputeContractValue(draft: WeddingEditDraft): number {
  return weddingExtraServiceService.totalFromSnapshots(
    draft.packageBasePrice,
    draft.extras,
  )
}

export function validateWeddingEditDraft(draft: WeddingEditDraft): string | null {
  const { wedding } = draft
  if (!wedding.couple.partner1FirstName?.trim() && !wedding.couple.partner1.trim()) {
    return 'Podaj imię panny młodej.'
  }
  if (!wedding.couple.partner2FirstName?.trim() && !wedding.couple.partner2.trim()) {
    return 'Podaj imię pana młodego.'
  }
  if (!wedding.date?.trim()) {
    return 'Podaj datę ślubu.'
  }
  if (wedding.price < 0) {
    return 'Wartość umowy nie może być ujemna.'
  }
  if ((wedding.depositAmount ?? 0) < 0) {
    return 'Zaliczka nie może być ujemna.'
  }
  for (const contact of draft.contacts) {
    if (!contact.name.trim()) return 'Kontakt musi mieć nazwę.'
  }
  for (const note of draft.notes) {
    if (!note.content.trim()) return 'Notatka nie może być pusta.'
  }
  for (const task of draft.tasks) {
    if (!task.title.trim()) return 'Zadanie musi mieć tytuł.'
  }
  for (const payment of draft.payments) {
    if (payment.amount < 0) return 'Kwota wpłaty nie może być ujemna.'
  }
  for (const extra of draft.extras) {
    if (extra.quantity < 1) return 'Ilość usługi dodatkowej musi być ≥ 1.'
    if (extra.priceSnapshot < 0) return 'Cena usługi dodatkowej nie może być ujemna.'
  }
  return null
}

function isTempId(id: string): boolean {
  return !isLikelyUuid(id)
}

/**
 * Persist an entire wedding edit session as one unit of work.
 * Child entities are synced by create/update/delete against the draft.
 */
export async function persistWeddingEditDraft(
  original: WeddingEditSnapshot,
  draft: WeddingEditDraft,
): Promise<void> {
  const error = validateWeddingEditDraft(draft)
  if (error) throw new Error(error)

  const weddingId = draft.wedding.id
  const nextWedding: Wedding = {
    ...draft.wedding,
    price: draft.wedding.price,
    couple: {
      ...draft.wedding.couple,
      partner1: [
        draft.wedding.couple.partner1FirstName,
        draft.wedding.couple.partner1LastName,
      ]
        .map((p) => p?.trim())
        .filter(Boolean)
        .join(' ') || draft.wedding.couple.partner1,
      partner2: [
        draft.wedding.couple.partner2FirstName,
        draft.wedding.couple.partner2LastName,
      ]
        .map((p) => p?.trim())
        .filter(Boolean)
        .join(' ') || draft.wedding.couple.partner2,
      email:
        draft.wedding.couple.partner1Email?.trim() ||
        draft.wedding.couple.email,
      phone:
        draft.wedding.couple.partner1Phone?.trim() ||
        draft.wedding.couple.phone,
      city:
        draft.wedding.couple.partner1City?.trim() ||
        draft.wedding.couple.city,
    },
    payments: draft.payments,
    notes: draft.notes,
  }

  await weddingService.update(nextWedding)
  await persistWeddingContractAnswerFields(nextWedding)

  // Travel cache only. Locations are owned by WeddingDetailHero (autosave to
  // wedding_places). Draft location scalars must not clear saved places.
  try {
    await travelService.recalculate(weddingId)
  } catch {
    // Travel/Maps outage — wedding scalars and form answers already saved.
  }

  // Contacts
  const origContactIds = new Set(original.contacts.map((c) => c.id))
  const draftContactIds = new Set(draft.contacts.map((c) => c.id))
  for (const id of origContactIds) {
    if (!draftContactIds.has(id)) await contactService.delete(id)
  }
  for (const contact of draft.contacts) {
    if (isTempId(contact.id)) {
      await contactService.create({
        weddingId,
        name: contact.name,
        role: contact.role,
        phone: contact.phone,
        email: contact.email,
      })
    } else {
      await contactService.update(contact.id, {
        name: contact.name,
        role: contact.role ?? null,
        phone: contact.phone ?? null,
        email: contact.email ?? null,
      })
    }
  }

  // Extras
  const origExtraIds = new Set(original.extras.map((e) => e.id))
  const draftExtraIds = new Set(draft.extras.map((e) => e.id))
  for (const id of origExtraIds) {
    if (!draftExtraIds.has(id)) await weddingExtraServiceService.remove(id)
  }
  for (const extra of draft.extras) {
    if (isTempId(extra.id)) {
      await weddingExtraServiceService.add({
        weddingId,
        extraServiceId: extra.extraServiceId,
        quantity: extra.quantity,
        priceSnapshot: extra.priceSnapshot,
      })
    } else {
      await weddingExtraServiceService.update(extra.id, {
        quantity: extra.quantity,
        priceSnapshot: extra.priceSnapshot,
      })
    }
  }

  // Notes
  const origNoteIds = new Set(original.wedding.notes.map((n) => n.id))
  const draftNoteIds = new Set(draft.notes.map((n) => n.id))
  for (const id of origNoteIds) {
    if (!draftNoteIds.has(id)) await noteService.delete(id)
  }
  for (const note of draft.notes) {
    if (isTempId(note.id)) {
      await noteService.create({
        weddingId,
        content: note.content,
        author: note.author,
        pinned: note.pinned,
      })
    } else {
      await noteService.update(note.id, {
        content: note.content,
        author: note.author,
        pinned: note.pinned,
      })
    }
  }

  // Tasks
  const origTaskIds = new Set(original.tasks.map((t) => t.id))
  const draftTaskIds = new Set(draft.tasks.map((t) => t.id))
  for (const id of origTaskIds) {
    if (!draftTaskIds.has(id)) await taskService.delete(id)
  }
  for (const task of draft.tasks) {
    if (isTempId(task.id)) {
      await taskService.create({
        weddingId,
        title: task.title,
        dueDate: task.dueDate,
        status: task.completed ? 'done' : 'todo',
      })
    } else {
      await taskService.update(task.id, {
        title: task.title,
        dueDate: task.dueDate,
        status: task.completed ? 'done' : 'todo',
      })
    }
  }

  // Payments
  const origPaymentIds = new Set(original.wedding.payments.map((p) => p.id))
  const draftPaymentIds = new Set(draft.payments.map((p) => p.id))
  for (const id of origPaymentIds) {
    if (!draftPaymentIds.has(id)) await paymentService.delete(id)
  }
  for (const payment of draft.payments) {
    if (isTempId(payment.id)) {
      await paymentService.create({
        weddingId,
        type: payment.type,
        amount: payment.amount,
        paymentDate: payment.paidAt,
        dueDate: payment.dueDate,
        method: payment.method,
        note: payment.note,
        paid: payment.paid,
      })
    } else {
      await paymentService.update(payment.id, {
        type: payment.type,
        amount: payment.amount,
        paymentDate: payment.paidAt ?? null,
        dueDate: payment.dueDate ?? null,
        method: payment.method ?? null,
        note: payment.note ?? null,
        paid: payment.paid,
      })
    }
  }
}
