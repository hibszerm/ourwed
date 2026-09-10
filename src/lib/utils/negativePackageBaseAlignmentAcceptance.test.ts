/**
 * Client/server negative package-base alignment.
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/utils/negativePackageBaseAlignmentAcceptance.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  computeWeddingContractValue,
  rebaseEffectivePackageBase,
} from '@/lib/forms/weddingExtraPricing'
import { previewTravelFeeContractValue } from '@/lib/utils/travelFeeCommercial'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

{
  // NORMAL: CV > extras + travel
  const base = rebaseEffectivePackageBase({
    contractValue: 5000,
    extrasTotal: 1000,
    effectiveTravel: 800,
  })
  assert.equal(base, 3200)
  assert.equal(
    computeWeddingContractValue({
      packageBasePrice: base,
      extras: [{ priceSnapshot: 1000, quantity: 1 }],
      effectiveTravelFee: 800,
    }),
    5000,
  )
}

{
  // BOUNDARY: CV == extras + travel → packageBase 0
  const base = rebaseEffectivePackageBase({
    contractValue: 1800,
    extrasTotal: 1000,
    effectiveTravel: 800,
  })
  assert.equal(base, 0)
  assert.equal(
    computeWeddingContractValue({
      packageBasePrice: base,
      extras: [{ priceSnapshot: 1000, quantity: 1 }],
      effectiveTravelFee: 800,
    }),
    1800,
  )
}

{
  // NEGATIVE: CV 1500 / extras 1000 / travel 800 → base -300, total 1500
  const cv = 1500
  const extras = 1000
  const travel = 800
  const base = rebaseEffectivePackageBase({
    contractValue: cv,
    extrasTotal: extras,
    effectiveTravel: travel,
  })
  assert.equal(base, -300, 'client allows negative effective package base')
  assert.equal(
    computeWeddingContractValue({
      packageBasePrice: base,
      extras: [{ priceSnapshot: extras, quantity: 1 }],
      effectiveTravelFee: travel,
    }),
    1500,
    'client preserves agreed CV',
  )

  // charged travel amount change 800 → 900
  assert.equal(
    previewTravelFeeContractValue({
      currentContractValue: 1500,
      extrasTotal: 1000,
      previousEffectiveTravel: 800,
      nextStatus: 'charged',
      nextAmount: 900,
    }),
    1600,
    'preview: charged amount change preserves sticky base',
  )

  // charged → included
  assert.equal(
    previewTravelFeeContractValue({
      currentContractValue: 1500,
      extrasTotal: 1000,
      previousEffectiveTravel: 800,
      nextStatus: 'included',
      nextAmount: 0,
    }),
    700,
    'preview: charged → included',
  )

  // included → charged 800 (from CV 700 state after include)
  assert.equal(
    previewTravelFeeContractValue({
      currentContractValue: 700,
      extrasTotal: 1000,
      previousEffectiveTravel: 0,
      nextStatus: 'charged',
      nextAmount: 800,
    }),
    1500,
    'preview: included → charged restores travel delta',
  )

  // add extra +100 with sticky negative base
  assert.equal(
    computeWeddingContractValue({
      packageBasePrice: -300,
      extras: [{ priceSnapshot: 1100, quantity: 1 }],
      effectiveTravelFee: 800,
    }),
    1600,
    'add extra from negative base',
  )

  // remove extra back
  assert.equal(
    computeWeddingContractValue({
      packageBasePrice: -300,
      extras: [{ priceSnapshot: 1000, quantity: 1 }],
      effectiveTravelFee: 800,
    }),
    1500,
    'remove extra restores CV',
  )

  // Old SQL clamp would inflate:
  const sqlInflated = Math.max(0, 1500 - 1000 - 800) + 1000 + 800
  assert.equal(sqlInflated, 1800, 'document old clamp inflation')
}

{
  const mig = read(
    'supabase/migrations/20260910150000_negative_package_base_alignment.sql',
  )
  assert.ok(
    mig.includes('resolve_wedding_travel_fee'),
    'migration redefines travel RPC',
  )
  assert.ok(
    mig.includes('public_submit_form_by_token'),
    'migration redefines submit RPC',
  )
  assert.ok(
    mig.includes(
      'coalesce(v_row.contract_value, 0) - coalesce(v_extras, 0) - v_prev_travel',
    ),
    'travel RPC unclamped package_base',
  )
  assert.ok(
    !/v_package_base\s*:=\s*greatest\s*\(\s*0/i.test(mig),
    'travel RPC no package_base greatest(0)',
  )
  assert.ok(
    !/package_base\s*:=\s*greatest\s*\(\s*0/i.test(mig),
    'submit RPC no package_base greatest(0)',
  )
  // Travel amount read may still use greatest(0, amount) — that is intentional.
  assert.ok(
    mig.includes('greatest(0, coalesce(v_row.travel_fee_amount, 0))'),
    'keeps charged travel amount floor',
  )
}

{
  const preview = read('src/lib/utils/travelFeeCommercial.ts')
  const start = preview.indexOf('export function previewTravelFeeContractValue')
  const end = preview.indexOf('export function', start + 10)
  const slice = preview.slice(start, end > start ? end : undefined)
  assert.ok(
    slice.includes(
      'input.currentContractValue - input.extrasTotal - previous',
    ),
    'preview uses unclamped package base',
  )
  assert.ok(
    !/packageBase\s*=\s*Math\.max\(\s*0/i.test(slice),
    'preview no Math.max(0) on packageBase',
  )
}

{
  const rebaseSrc = read('src/lib/forms/weddingExtraPricing.ts')
  const start = rebaseSrc.indexOf('export function rebaseEffectivePackageBase')
  const end = rebaseSrc.indexOf('export function', start + 10)
  const fnSlice = rebaseSrc.slice(start, end > start ? end : undefined)
  assert.ok(
    fnSlice.includes('return cv - extras - travel'),
    'rebase returns unclamped cv - extras - travel',
  )
}

console.log('negativePackageBaseAlignmentAcceptance: ok')
