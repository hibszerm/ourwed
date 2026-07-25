/**
 * Dev-only seeder: ensure Video Mini catalog package + reference wedding exist.
 * Uses live company profile; never hardcodes company into production logic.
 */

import { companyDetailsService } from '@/lib/api/companyDetailsService'
import { noteService } from '@/lib/api/noteService'
import { packageItemService } from '@/lib/api/packageItemService'
import { packageService } from '@/lib/api/packageService'
import { paymentService } from '@/lib/api/paymentService'
import { resolveStudioUserId } from '@/lib/api/studioUser'
import { weddingService } from '@/lib/api/weddingService'
import {
  buildReferencePackageItemsSnapshot,
  REFERENCE_PACKAGE_ITEMS,
  REFERENCE_PACKAGE_SLUG,
  REFERENCE_WEDDING_MARKER,
} from '@/lib/dev/referenceWedding'
import { persistWeddingContractAnswerFields } from '@/lib/forms/persistWeddingContractAnswers'
import { defaultFinalPaymentDueDate } from '@/lib/utils/commercial'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import type { StudioPackage } from '@/types/package'
import type { Wedding } from '@/types/wedding'

async function ensureVideoMiniPackage(): Promise<StudioPackage> {
  const all = await packageService.list()
  const existing =
    all.find((p) => p.slug === REFERENCE_PACKAGE_SLUG) ||
    all.find((p) => p.name.trim().toLowerCase() === 'video mini')

  if (existing) {
    const updated = await packageService.update(existing.id, {
      name: 'Video Mini',
      description: existing.description || 'Pakiet video — teledysk + film ślubny.',
      price: 9500,
      depositAmount: 1000,
      currency: 'PLN',
      color: existing.color || '#1a1a1a',
      isActive: true,
      coverageHours: 12,
      coverageEndTime: '00:30',
      overtimeRate: 1400,
      deliveryMonths: 4,
      deliveryDays: null,
    })

    if ((updated.items ?? []).length === 0) {
      for (const item of REFERENCE_PACKAGE_ITEMS) {
        await packageItemService.create({
          packageId: updated.id,
          title: item.title,
          description: item.description,
          enabled: item.enabled,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
        })
      }
      return (await packageService.get(updated.id))!
    }
    return updated
  }

  const created = await packageService.create({
    name: 'Video Mini',
    slug: REFERENCE_PACKAGE_SLUG,
    description: 'Pakiet video — teledysk + film ślubny.',
    price: 9500,
    depositAmount: 1000,
    currency: 'PLN',
    color: '#1a1a1a',
    isActive: true,
    coverageHours: 12,
    coverageEndTime: '00:30',
    overtimeRate: 1400,
    deliveryMonths: 4,
    deliveryDays: null,
  })

  for (const item of REFERENCE_PACKAGE_ITEMS) {
    await packageItemService.create({
      packageId: created.id,
      title: item.title,
      description: item.description,
      enabled: item.enabled,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
    })
  }

  return (await packageService.get(created.id))!
}

async function findReferenceWeddingId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('weddings')
    .select('id')
    .eq('user_id', userId)
    .eq('bride_name', 'Marcin Nowak')
    .eq('wedding_date', '2026-07-24')
    .order('created_at', { ascending: true })
    .limit(1)
  throwOnError(error)
  return ((data ?? []) as Array<{ id: string }>)[0]?.id ?? null
}

/**
 * Create or refresh the studio's reference wedding for contract-readiness testing.
 * Safe to call repeatedly in development.
 */
export async function ensureReferenceWeddingSetup(): Promise<{
  package: StudioPackage
  wedding: Wedding
  companyReady: boolean
}> {
  const userId = await resolveStudioUserId()
  const pkg = await ensureVideoMiniPackage()
  const company = await companyDetailsService.get()
  const companyReady = Boolean(
    company?.companyName &&
      company.address &&
      company.nip &&
      company.regon &&
      company.phone &&
      (company.bankAccount || company.iban),
  )

  const packageItems = buildReferencePackageItemsSnapshot(
    pkg.items.map((i) => i.id),
  )
  const weddingDate = '2026-07-24'
  const finalDue = defaultFinalPaymentDueDate(weddingDate)

  const existingId = await findReferenceWeddingId(userId)
  if (existingId) {
    const current = await weddingService.getById(existingId)
    if (!current) throw new Error('Nie znaleziono ślubu referencyjnego.')

    const updated = await weddingService.update({
      ...current,
      couple: {
        ...current.couple,
        partner1: 'Marcin Nowak',
        partner2: current.couple.partner2 || 'Anna Nowak',
        partner1FirstName: 'Marcin',
        partner1LastName: 'Nowak',
        partner1Address: 'Grabowa 8A',
        partner1Phone: '777666251',
        phone: '777666251',
      },
      date: weddingDate,
      packageId: pkg.id,
      packageName: pkg.name,
      price: 9500,
      depositAmount: 1000,
      currency: 'PLN',
      accentColor: pkg.color || current.accentColor,
      packageItems,
      coverageHours: 12,
      coverageEndTime: '00:30',
      overtimeRate: 1400,
      deliveryMonths: 4,
      deliveryDays: null,
      finalPaymentDueDate: finalDue,
      preparationLocation:
        current.bridePreparationLocation ||
        current.preparationLocation ||
        'Dom pani młodej, Grabowa 8A',
      bridePreparationLocation:
        current.bridePreparationLocation ||
        current.preparationLocation ||
        'Dom pani młodej, Grabowa 8A',
      groomPreparationLocation:
        current.groomPreparationLocation ||
        'Hotel Centralny, ul. Główna 3',
      ceremonyLocation: current.ceremonyLocation || 'Kościół pw. św. Anny',
      receptionLocation:
        current.receptionLocation || 'Sala weselna Pod Lipami',
      workflowStage: 'deposit',
    })

    const paid = (updated.payments ?? [])
      .filter((p) => p.paid)
      .reduce((sum, p) => sum + p.amount, 0)
    if (paid < 1000) {
      await paymentService.create({
        weddingId: updated.id,
        type: 'deposit',
        amount: 1000,
        paymentDate: '2026-03-01',
        method: 'transfer',
        note: 'Zadatek — ślub referencyjny',
      })
    }

    const refreshed = await weddingService.getById(updated.id)
    const ready = refreshed ?? updated
    await persistWeddingContractAnswerFields(ready)
    return {
      package: pkg,
      wedding: (await weddingService.getById(ready.id)) ?? ready,
      companyReady,
    }
  }

  const created = await weddingService.create({
    partner1: 'Marcin Nowak',
    partner2: 'Anna Nowak',
    date: weddingDate,
    ceremonyLocation: 'Kościół pw. św. Anny',
    receptionLocation: 'Sala weselna Pod Lipami',
    packageId: pkg.id,
    packageName: pkg.name,
    price: 9500,
    depositPaid: true,
    depositAmount: 1000,
    depositPaymentDate: '2026-03-01',
    currency: 'PLN',
    accentColor: pkg.color || '#1a1a1a',
    packageItems,
    coverageHours: 12,
    coverageEndTime: '00:30',
    overtimeRate: 1400,
    deliveryMonths: 4,
    deliveryDays: null,
    finalPaymentDueDate: finalDue,
    notes: REFERENCE_WEDDING_MARKER,
  })

  // create() may not persist location splits / prep — update snapshot terms.
  const finalized = await weddingService.update({
    ...created,
    couple: {
      ...created.couple,
      partner1FirstName: 'Marcin',
      partner1LastName: 'Nowak',
      partner1Address: 'Grabowa 8A',
      partner1Phone: '777666251',
      phone: '777666251',
    },
    preparationLocation: 'Dom pani młodej, Grabowa 8A',
    bridePreparationLocation: 'Dom pani młodej, Grabowa 8A',
    groomPreparationLocation: 'Hotel Centralny, ul. Główna 3',
    ceremonyLocation: 'Kościół pw. św. Anny',
    receptionLocation: 'Sala weselna Pod Lipami',
    coverageHours: 12,
    coverageEndTime: '00:30',
    overtimeRate: 1400,
    deliveryMonths: 4,
    finalPaymentDueDate: finalDue,
    packageItems,
    workflowStage: 'deposit',
  })

  // Ensure marker note exists even if create notes path differs.
  const hasMarker = (finalized.notes ?? []).some(
    (n) => n.content === REFERENCE_WEDDING_MARKER,
  )
  if (!hasMarker) {
    await noteService.create({
      weddingId: finalized.id,
      content: REFERENCE_WEDDING_MARKER,
      author: 'System',
    })
  }

  const refreshed = await weddingService.getById(finalized.id)
  const ready = refreshed ?? finalized
  await persistWeddingContractAnswerFields(ready)

  return {
    package: pkg,
    wedding: (await weddingService.getById(ready.id)) ?? ready,
    companyReady,
  }
}
