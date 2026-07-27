import { calendarEventService } from '@/lib/api/calendarEventService'
import { contractService } from '@/lib/api/contractService'
import { galleryService } from '@/lib/api/galleryService'
import { noteService } from '@/lib/api/noteService'
import { packageService } from '@/lib/api/packageService'
import { paymentService } from '@/lib/api/paymentService'
import { resolveStudioUserId } from '@/lib/api/studioUser'
import { getWeddingDemoInFlightMap } from '@/lib/api/tenantModuleCaches'
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
import { isLikelyUuid, asCatalogPackageId, throwOnError } from '@/lib/supabase/helpers'
import { snapshotPackageItemsFromStudioPackage, buildCreateWeddingCommercialFromPackage } from '@/lib/utils/commercial'
import type {
  CreateWeddingInput,
  Wedding,
  WeddingPackageItemSnapshot,
  WorkflowStage,
} from '@/types/wedding'

export { mapWeddingRowToModel, mapWeddingModelToRow } from '@/lib/api/weddings/weddingMappers'

/**
 * Wedding aggregate loader — `public.weddings` scalars + child-domain hydrate.
 * Nested writes belong in dedicated services (notes, timeline, payments, …).
 */

async function resolvePackageItemsSnapshot(
  input: CreateWeddingInput,
): Promise<WeddingPackageItemSnapshot[]> {
  if (input.packageItems && input.packageItems.length > 0) {
    return input.packageItems
  }
  const packageId = asCatalogPackageId(input.packageId)
  if (!packageId) return []
  try {
    const pkg = await packageService.get(packageId)
    return pkg ? snapshotPackageItemsFromStudioPackage(pkg) : []
  } catch {
    return []
  }
}

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
      package_name: null,
      package_id: null,
      contract_value: 0,
      deposit_amount: 0,
      currency: DEFAULT_WEDDING_CURRENCY,
      accent_color: null,
    })
    .select('*')
    .single()

  throwOnError(error)

  if (!data) {
    throw new Error('Nie udało się utworzyć demo ślubu w Supabase.')
  }

  return data as WeddingRow
}

let ensureDemoInFlightByUser = getWeddingDemoInFlightMap() as Map<
  string,
  Promise<WeddingRow[]>
>

async function loadWeddingsOrSeedDemo(userId: string): Promise<WeddingRow[]> {
  const existing = await fetchWeddingsForUser(userId)
  if (existing.length > 0) return existing

  const inflight = ensureDemoInFlightByUser.get(userId)
  if (inflight) return inflight

  const next = (async () => {
    const again = await fetchWeddingsForUser(userId)
    if (again.length > 0) return again
    const demo = await ensureDemoWedding(userId)
    await seedNewWeddingSideEffects(mapWeddingRowToModel(demo))
    return fetchWeddingsForUser(userId)
  })().finally(() => {
    ensureDemoInFlightByUser.delete(userId)
  })

  ensureDemoInFlightByUser.set(userId, next)
  return next
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

    const packageId = asCatalogPackageId(input.packageId)
    let commercial = {
      packageId,
      packageName: input.packageName || null,
      price: input.price,
      depositAmount:
        input.depositAmount ??
        (input.depositPaid ? Math.round(input.price * 0.3) : null),
      currency: input.currency || DEFAULT_WEDDING_CURRENCY,
      accentColor: input.accentColor || null,
      packageItems: await resolvePackageItemsSnapshot(input),
      coverageHours: input.coverageHours ?? null,
      coverageEndTime: input.coverageEndTime?.trim() || null,
      overtimeRate: input.overtimeRate ?? null,
      deliveryMonths: input.deliveryMonths ?? null,
      deliveryDays: input.deliveryDays ?? null,
      finalPaymentTerms: input.finalPaymentTerms ?? null,
      finalPaymentDueDate: input.finalPaymentDueDate?.trim() || null,
    }

    if (packageId) {
      const pkg = await packageService.get(packageId)
      if (!pkg) {
        throw new Error('Wybrany pakiet nie istnieje lub jest niedostępny.')
      }
      if (!pkg.isActive) {
        throw new Error('Wybrany pakiet jest nieaktywny.')
      }
      const snap = buildCreateWeddingCommercialFromPackage({
        weddingDate: input.date,
        pkg,
        overrides: {
          packageName: input.packageName || undefined,
          price: input.price,
          depositAmount: input.depositAmount,
          currency: input.currency,
          accentColor: input.accentColor,
          packageItems: input.packageItems,
          coverageHours: input.coverageHours,
          coverageEndTime: input.coverageEndTime,
          overtimeRate: input.overtimeRate,
          deliveryMonths: input.deliveryMonths,
          deliveryDays: input.deliveryDays,
          finalPaymentTerms: input.finalPaymentTerms,
          finalPaymentDueDate: input.finalPaymentDueDate,
        },
      })
      commercial = {
        packageId: snap.packageId ?? packageId,
        packageName: snap.packageName || null,
        price: snap.price,
        depositAmount: snap.depositAmount ?? null,
        currency: snap.currency || DEFAULT_WEDDING_CURRENCY,
        accentColor: snap.accentColor || null,
        packageItems: snap.packageItems,
        coverageHours: snap.coverageHours ?? null,
        coverageEndTime: snap.coverageEndTime?.trim() || null,
        overtimeRate: snap.overtimeRate ?? null,
        deliveryMonths: snap.deliveryMonths ?? null,
        deliveryDays: snap.deliveryDays ?? null,
        finalPaymentTerms: snap.finalPaymentTerms ?? null,
        finalPaymentDueDate: snap.finalPaymentDueDate?.trim() || null,
      }
    }

    const depositSnapshot = commercial.depositAmount

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
        package_name: commercial.packageName,
        package_id: commercial.packageId,
        contract_value: commercial.price,
        deposit_amount: depositSnapshot,
        currency: commercial.currency,
        accent_color: commercial.accentColor,
        package_items_snapshot: commercial.packageItems,
        coverage_hours: commercial.coverageHours,
        coverage_end_time: commercial.coverageEndTime,
        overtime_rate: commercial.overtimeRate,
        delivery_months: commercial.deliveryMonths,
        delivery_days: commercial.deliveryDays,
        final_payment_terms: commercial.finalPaymentTerms,
        final_payment_due_date: commercial.finalPaymentDueDate,
      })
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się utworzyć ślubu.')
    }

    const weddingId = (data as WeddingRow).id
    const today = new Date().toISOString().slice(0, 10)

    if (input.depositPaid && depositSnapshot != null && depositSnapshot > 0) {
      await paymentService.create({
        weddingId,
        type: 'deposit',
        amount: depositSnapshot,
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
        status: patch.status,
        workflow_stage: patch.workflow_stage,
        package_name: patch.package_name,
        package_id: patch.package_id,
        contract_value: patch.contract_value,
        deposit_amount: patch.deposit_amount,
        currency: patch.currency,
        accent_color: patch.accent_color,
        package_items_snapshot: patch.package_items_snapshot ?? [],
        coverage_hours: patch.coverage_hours ?? null,
        coverage_end_time: patch.coverage_end_time ?? null,
        overtime_rate: patch.overtime_rate ?? null,
        delivery_months: patch.delivery_months ?? null,
        delivery_days: patch.delivery_days ?? null,
        final_payment_terms: patch.final_payment_terms ?? null,
        final_payment_due_date: patch.final_payment_due_date ?? null,
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

    // Preserve view fields that live in form_answers (hydrated later / passed in).
    const withScalars: Wedding = {
      ...mapped,
      couple: {
        ...mapped.couple,
        partner1FirstName:
          wedding.couple.partner1FirstName ?? mapped.couple.partner1FirstName,
        partner1LastName:
          wedding.couple.partner1LastName ?? mapped.couple.partner1LastName,
        partner2FirstName:
          wedding.couple.partner2FirstName ?? mapped.couple.partner2FirstName,
        partner2LastName:
          wedding.couple.partner2LastName ?? mapped.couple.partner2LastName,
        partner1Phone: wedding.couple.partner1Phone ?? mapped.couple.partner1Phone,
        partner1Email: wedding.couple.partner1Email ?? mapped.couple.partner1Email,
        partner1Address: wedding.couple.partner1Address,
        partner1PostalCode: wedding.couple.partner1PostalCode,
        partner1City: wedding.couple.partner1City ?? mapped.couple.partner1City,
        partner2Phone: wedding.couple.partner2Phone,
        partner2Email: wedding.couple.partner2Email,
        partner2Address: wedding.couple.partner2Address,
        partner2PostalCode: wedding.couple.partner2PostalCode,
        partner2City: wedding.couple.partner2City,
        city: wedding.couple.city || mapped.couple.city,
      },
      accentColor: wedding.accentColor || mapped.accentColor,
      checklist: wedding.checklist,
      schedule: wedding.schedule,
      finances: wedding.finances,
      questionnaires: wedding.questionnaires,
      deliverables: wedding.deliverables,
      ceremonyLocation: wedding.ceremonyLocation,
      receptionLocation: wedding.receptionLocation,
      bridePreparationLocation: wedding.bridePreparationLocation,
      groomPreparationLocation: wedding.groomPreparationLocation,
      preparationLocation:
        wedding.bridePreparationLocation || wedding.preparationLocation,
      coverageHours: mapped.coverageHours ?? wedding.coverageHours,
      coverageEndTime: mapped.coverageEndTime ?? wedding.coverageEndTime,
      overtimeRate: mapped.overtimeRate ?? wedding.overtimeRate,
      deliveryMonths: mapped.deliveryMonths ?? wedding.deliveryMonths,
      deliveryDays: mapped.deliveryDays ?? wedding.deliveryDays,
      finalPaymentTerms:
        mapped.finalPaymentTerms ?? wedding.finalPaymentTerms,
      finalPaymentDueDate:
        mapped.finalPaymentDueDate ?? wedding.finalPaymentDueDate,
      ceremonyTime: mapped.ceremonyTime ?? wedding.ceremonyTime,
      status: mapped.status,
    }

    await calendarEventService.ensureWeddingDayEvent(withScalars)

    return finalizeWeddingView(withScalars)
  },

  async archive(id: string): Promise<Wedding> {
    const wedding = await weddingService.getById(id)
    if (!wedding) throw new Error('Nie znaleziono ślubu.')
    return weddingService.update({ ...wedding, status: 'archived' })
  },

  async delete(id: string): Promise<void> {
    if (!isLikelyUuid(id)) {
      throw new Error('Nieprawidłowy identyfikator ślubu.')
    }
    const userId = await resolveStudioUserId()
    const { error } = await supabase
      .from('weddings')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    throwOnError(error)
  },
}
