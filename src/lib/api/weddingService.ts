import { calendarEventService } from '@/lib/api/calendarEventService'
import { contractService } from '@/lib/api/contractService'
import { galleryService } from '@/lib/api/galleryService'
import { noteService } from '@/lib/api/noteService'
import { paymentService } from '@/lib/api/paymentService'
import { resolveStudioUserId } from '@/lib/api/studioUser'
import { timelineEventService } from '@/lib/api/timelineEventService'
import {
  finalizeWeddingView,
  finalizeWeddingViews,
} from '@/lib/api/weddings/weddingHydrate'
import {
  DEFAULT_WEDDING_CURRENCY,
  mapWeddingModelToRow,
  mapWeddingRowToModel,
  type WeddingRow,
} from '@/lib/api/weddings/weddingMappers'
import { supabase } from '@/lib/supabase'
import { isLikelyUuid, throwOnError } from '@/lib/supabase/helpers'
import type { CreateWeddingInput, Wedding, WorkflowStage } from '@/types/wedding'

export { mapWeddingRowToModel, mapWeddingModelToRow } from '@/lib/api/weddings/weddingMappers'

/**
 * Wedding aggregate loader — `public.weddings` scalars + child-domain hydrate.
 * Nested writes belong in dedicated services (notes, timeline, payments, …).
 */

async function fetchWeddingsForUser(userId: string): Promise<WeddingRow[]> {
  const { data, error } = await supabase
    .from('weddings')
    .select('*')
    .eq('user_id', userId)
    .order('wedding_date', { ascending: true, nullsFirst: false })

  throwOnError(error)
  return (data ?? []) as WeddingRow[]
}

async function ensureDemoWedding(userId: string): Promise<WeddingRow> {
  const { data, error } = await supabase
    .from('weddings')
    .insert({
      user_id: userId,
      bride_name: 'Anna',
      groom_name: 'Michał',
      email: 'anna.michal@email.pl',
      phone: '+48 600 123 456',
      wedding_date: '2026-08-15',
      ceremony_time: null,
      venue: 'Pałac w Wilanowie, Warszawa',
      status: 'active',
      workflow_stage: 'contract',
      package_name: 'Premium Full Day',
      contract_value: 45000,
      deposit_amount: 13500,
      currency: DEFAULT_WEDDING_CURRENCY,
    })
    .select('*')
    .single()

  throwOnError(error)

  if (!data) {
    throw new Error('Nie udało się utworzyć demo ślubu w Supabase.')
  }

  return data as WeddingRow
}

let ensureDemoInFlight: Promise<WeddingRow[]> | null = null

async function loadWeddingsOrSeedDemo(userId: string): Promise<WeddingRow[]> {
  const existing = await fetchWeddingsForUser(userId)
  if (existing.length > 0) return existing

  if (!ensureDemoInFlight) {
    ensureDemoInFlight = (async () => {
      const again = await fetchWeddingsForUser(userId)
      if (again.length > 0) return again
      const demo = await ensureDemoWedding(userId)
      await seedNewWeddingSideEffects(mapWeddingRowToModel(demo))
      return fetchWeddingsForUser(userId)
    })().finally(() => {
      ensureDemoInFlight = null
    })
  }

  return ensureDemoInFlight
}

async function seedNewWeddingSideEffects(wedding: Wedding): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const timeline = await timelineEventService.listByWeddingId(wedding.id)
  if (timeline.length === 0) {
    await timelineEventService.create({
      weddingId: wedding.id,
      type: 'created',
      title: 'Utworzono zlecenie.',
      description: 'Ślub dodany do CRM.',
      systemGenerated: true,
      date: today,
    })
  }
  await calendarEventService.ensureWeddingDayEvent(wedding)
  if (!(await contractService.getByWeddingId(wedding.id))) {
    await contractService.create({ weddingId: wedding.id, status: 'none' })
  }
  if (!(await galleryService.getByWeddingId(wedding.id))) {
    await galleryService.create({ weddingId: wedding.id, status: 'not_ready' })
  }
}

export const weddingService = {
  async getAll(): Promise<Wedding[]> {
    const userId = await resolveStudioUserId()
    const rows = await loadWeddingsOrSeedDemo(userId)
    return finalizeWeddingViews(rows.map(mapWeddingRowToModel))
  },

  async getById(id: string): Promise<Wedding | null> {
    if (!isLikelyUuid(id)) {
      return null
    }

    const userId = await resolveStudioUserId()

    const { data, error } = await supabase
      .from('weddings')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()

    throwOnError(error)

    if (!data) return null
    return finalizeWeddingView(mapWeddingRowToModel(data as WeddingRow))
  },

  async create(input: CreateWeddingInput): Promise<Wedding> {
    const userId = await resolveStudioUserId()
    const venue =
      input.receptionLocation?.trim() ||
      input.ceremonyLocation?.trim() ||
      null
    const workflowStage: WorkflowStage = input.depositPaid
      ? 'deposit'
      : 'reservation'
    const depositAmount = input.depositPaid
      ? (input.depositAmount ?? Math.round(input.price * 0.3))
      : null

    const { data, error } = await supabase
      .from('weddings')
      .insert({
        user_id: userId,
        bride_name: input.partner1.trim(),
        groom_name: input.partner2.trim(),
        email: null,
        phone: null,
        wedding_date: input.date || null,
        ceremony_time: null,
        venue,
        status: 'active',
        workflow_stage: workflowStage,
        package_name: input.packageName || null,
        contract_value: input.price,
        deposit_amount: depositAmount,
        currency: DEFAULT_WEDDING_CURRENCY,
      })
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się utworzyć ślubu.')
    }

    const weddingId = (data as WeddingRow).id
    const today = new Date().toISOString().slice(0, 10)

    if (input.depositPaid && depositAmount != null && depositAmount > 0) {
      await paymentService.create({
        weddingId,
        type: 'deposit',
        amount: depositAmount,
        paymentDate: input.depositPaymentDate ?? today,
        method: 'transfer',
        note: 'Zadatek przy utworzeniu ślubu',
      })
    }

    const base = mapWeddingRowToModel(data as WeddingRow)
    const withLocations: Wedding = {
      ...base,
      ceremonyLocation: input.ceremonyLocation?.trim() || undefined,
      receptionLocation: input.receptionLocation?.trim() || undefined,
    }

    await seedNewWeddingSideEffects(withLocations)

    if (input.notes?.trim()) {
      await noteService.create({
        weddingId,
        content: input.notes.trim(),
        author: 'Studio',
      })
    }

    return finalizeWeddingView(withLocations)
  },

  async update(wedding: Wedding): Promise<Wedding> {
    if (!isLikelyUuid(wedding.id)) {
      throw new Error('Nieprawidłowy identyfikator ślubu.')
    }

    const userId = await resolveStudioUserId()
    const patch = mapWeddingModelToRow(wedding)

    const { data, error } = await supabase
      .from('weddings')
      .update({
        bride_name: patch.bride_name,
        groom_name: patch.groom_name,
        email: patch.email,
        phone: patch.phone,
        wedding_date: patch.wedding_date,
        ceremony_time: patch.ceremony_time,
        venue: patch.venue,
        workflow_stage: patch.workflow_stage,
        package_name: patch.package_name,
        contract_value: patch.contract_value,
        currency: patch.currency,
      })
      .eq('id', wedding.id)
      .eq('user_id', userId)
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się zaktualizować ślubu.')
    }

    const mapped = mapWeddingRowToModel(data as WeddingRow)

    const withScalars: Wedding = {
      ...mapped,
      accentColor: wedding.accentColor || mapped.accentColor,
      checklist: wedding.checklist,
      schedule: wedding.schedule,
      finances: wedding.finances,
      questionnaires: wedding.questionnaires,
      deliverables: wedding.deliverables,
      ceremonyLocation: wedding.ceremonyLocation ?? mapped.ceremonyLocation,
      receptionLocation: wedding.receptionLocation ?? mapped.receptionLocation,
    }

    await calendarEventService.ensureWeddingDayEvent(withScalars)

    return finalizeWeddingView(withScalars)
  },
}
