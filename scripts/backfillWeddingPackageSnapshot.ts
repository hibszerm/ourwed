/**
 * Idempotent backfill: copy missing commercial terms from linked Package
 * onto Weddings that already have package_id but incomplete snapshot fields.
 *
 * Never overwrites non-empty Wedding fields.
 *
 * Usage (with env):
 *   npx tsx --env-file=.env.local scripts/backfillWeddingPackageSnapshot.ts
 *   npx tsx --env-file=.env.local scripts/backfillWeddingPackageSnapshot.ts --apply
 */

import { createClient } from '@supabase/supabase-js'
import {
  applyCommercialPackageSnapshot,
} from '../src/lib/utils/commercial'
import { parseFinalPaymentTerms } from '../src/lib/utils/finalPaymentTerms'
import type { StudioPackage } from '../src/types/package'
import type { Wedding } from '../src/types/wedding'

const APPLY = process.argv.includes('--apply')

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env ${name}`)
  return v
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (typeof value === 'number') return !Number.isFinite(value)
  return false
}

async function main() {
  const url = env('VITE_SUPABASE_URL')
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || env('VITE_SUPABASE_ANON_KEY')
  const supabase = createClient(url, key)

  const { data: weddings, error: wErr } = await supabase
    .from('weddings')
    .select('*')
    .not('package_id', 'is', null)
  if (wErr) throw wErr

  let changed = 0
  let skipped = 0

  for (const row of weddings ?? []) {
    const packageId = row.package_id as string
    const { data: pkgRow, error: pErr } = await supabase
      .from('packages')
      .select('*')
      .eq('id', packageId)
      .maybeSingle()
    if (pErr) throw pErr
    if (!pkgRow) {
      console.log(`SKIP ${row.id} — package ${packageId} missing`)
      skipped += 1
      continue
    }

    const { data: items } = await supabase
      .from('package_items')
      .select('*')
      .eq('package_id', packageId)
      .order('sort_order', { ascending: true })

    const pkg: StudioPackage = {
      id: pkgRow.id,
      name: pkgRow.name,
      slug: pkgRow.slug,
      description: pkgRow.description,
      price: Number(pkgRow.price) || 0,
      depositAmount: Number(pkgRow.deposit_amount) || 0,
      currency: pkgRow.currency || 'PLN',
      color: pkgRow.color,
      isActive: pkgRow.is_active,
      sortOrder: pkgRow.sort_order,
      questionnaireFormId: pkgRow.questionnaire_form_id ?? null,
      activeContractTemplateId: pkgRow.active_contract_template_id ?? null,
      activeContractTemplateVersionId:
        pkgRow.active_contract_template_version_id ?? null,
      coverageHours: pkgRow.coverage_hours != null ? Number(pkgRow.coverage_hours) : null,
      coverageEndTime: pkgRow.coverage_end_time?.trim() || null,
      overtimeRate: pkgRow.overtime_rate != null ? Number(pkgRow.overtime_rate) : null,
      deliveryMonths: pkgRow.delivery_months != null ? Number(pkgRow.delivery_months) : null,
      deliveryDays: pkgRow.delivery_days != null ? Number(pkgRow.delivery_days) : null,
      finalPaymentTerms: parseFinalPaymentTerms(pkgRow.final_payment_terms),
      createdAt: pkgRow.created_at,
      updatedAt: pkgRow.updated_at,
      items: (items ?? []).map((item, index) => ({
        id: item.id,
        packageId: item.package_id,
        title: item.title,
        description: item.description,
        sortOrder: item.sort_order ?? index,
        enabled: item.enabled !== false,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        createdAt: item.created_at,
      })),
    }

    const weddingStub = {
      id: row.id,
      date: (row.wedding_date as string) || '',
      packageId,
      packageName: row.package_name || '',
      price: Number(row.contract_value) || 0,
      depositAmount: Number(row.deposit_amount) || 0,
      currency: row.currency || 'PLN',
      accentColor: row.accent_color || '#0a0a0a',
      packageItems: Array.isArray(row.package_items_snapshot)
        ? row.package_items_snapshot
        : [],
      coverageHours: row.coverage_hours,
      coverageEndTime: row.coverage_end_time,
      overtimeRate: row.overtime_rate,
      deliveryMonths: row.delivery_months,
      deliveryDays: row.delivery_days,
      finalPaymentTerms: parseFinalPaymentTerms(row.final_payment_terms),
      finalPaymentDueDate: row.final_payment_due_date,
      couple: {
        partner1: row.bride_name || '',
        partner2: row.groom_name || '',
        email: '',
        phone: '',
        venue: '',
        city: '',
      },
      status: 'active',
      workflowStage: 'reservation',
      checklist: [],
      schedule: [],
      payments: [],
      finances: [],
      questionnaires: {
        contractData: { status: 'not_sent' },
        weddingQuestionnaire: { status: 'not_sent' },
      },
      contract: { status: 'none' },
      notes: [],
      deliverables: [],
      timeline: [],
      createdAt: row.created_at,
    } as Wedding

    const snap = applyCommercialPackageSnapshot(weddingStub, pkg, {
      preserveContractValue: true,
      preserveFinalPaymentDueDate: true,
    })

    const patch: Record<string, unknown> = {}
    if (isEmpty(row.coverage_hours) && snap.coverageHours != null) {
      patch.coverage_hours = snap.coverageHours
    }
    if (isEmpty(row.coverage_end_time) && snap.coverageEndTime) {
      patch.coverage_end_time = snap.coverageEndTime
    }
    if (isEmpty(row.overtime_rate) && snap.overtimeRate != null) {
      patch.overtime_rate = snap.overtimeRate
    }
    if (isEmpty(row.delivery_months) && snap.deliveryMonths != null) {
      patch.delivery_months = snap.deliveryMonths
    }
    if (isEmpty(row.delivery_days) && snap.deliveryDays != null) {
      patch.delivery_days = snap.deliveryDays
    }
    if (
      isEmpty(row.final_payment_terms) &&
      snap.finalPaymentTerms != null
    ) {
      patch.final_payment_terms = snap.finalPaymentTerms
    }
    if (
      isEmpty(row.final_payment_due_date) &&
      snap.finalPaymentDueDate
    ) {
      patch.final_payment_due_date = snap.finalPaymentDueDate
    }
    const itemsEmpty =
      !Array.isArray(row.package_items_snapshot) ||
      row.package_items_snapshot.length === 0
    if (itemsEmpty && snap.packageItems.length > 0) {
      patch.package_items_snapshot = snap.packageItems
    }

    if (Object.keys(patch).length === 0) {
      skipped += 1
      continue
    }

    console.log(
      `${APPLY ? 'APPLY' : 'DRY'} ${row.id} ← ${pkg.name}: ${Object.keys(patch).join(', ')}`,
    )
    if (APPLY) {
      const { error } = await supabase
        .from('weddings')
        .update(patch)
        .eq('id', row.id)
      if (error) throw error
    }
    changed += 1
  }

  console.log(
    `\nDone. ${APPLY ? 'Updated' : 'Would update'}: ${changed}, skipped: ${skipped}`,
  )
  if (!APPLY && changed > 0) {
    console.log('Re-run with --apply to persist.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
