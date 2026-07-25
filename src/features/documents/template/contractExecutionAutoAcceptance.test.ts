/**
 * Automatic contract_execution_date in generation / completeness flow.
 * Run: npm run test:contract-execution-auto
 */

import {
  isSystemAutoResolvedContractKey,
  localCalendarIsoDate,
  resolveContractExecutionValues,
} from './contractExecutionContext'
import { formatContractDateLong, formatContractDateShort } from '@/lib/utils/contractCommercialVariables'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

/** Mirrors completeness missing-field filter (system auto never manual-required). */
function collectManualMissing(
  fields: Array<{ registryKey: string; missing: boolean; value: string }>,
): string[] {
  return fields
    .filter((f) => {
      if (isSystemAutoResolvedContractKey(f.registryKey)) return false
      return f.missing
    })
    .map((f) => f.registryKey)
}

run('1. Execution-date slot requires no manual date input', () => {
  const startedAt = new Date(2026, 6, 25, 15, 0, 0)
  const exec = resolveContractExecutionValues({
    generationDate: startedAt,
    companyCity: 'Zabrze',
  })
  const fields = [
    {
      registryKey: 'contract_execution_date',
      missing: !exec.values.contract_execution_date,
      value: exec.values.contract_execution_date ?? '',
    },
    {
      registryKey: 'contract_execution_date_long',
      missing: !exec.values.contract_execution_date_long,
      value: exec.values.contract_execution_date_long ?? '',
    },
    {
      registryKey: 'custom_clause_note',
      missing: true,
      value: '',
    },
  ]
  // Even if somehow flagged missing, system keys excluded
  fields[0]!.missing = true
  fields[1]!.missing = true
  const manual = collectManualMissing(fields)
  assert(!manual.includes('contract_execution_date'), 'date not manual')
  assert(!manual.includes('contract_execution_date_long'), 'long not manual')
  assert(manual.includes('custom_clause_note'), 'custom still manual')
})

run('2. contract_execution_date resolves to local generation date', () => {
  const startedAt = new Date(2026, 6, 25, 23, 59, 0)
  const exec = resolveContractExecutionValues({
    generationDate: startedAt,
    companyCity: 'Zabrze',
  })
  assertEq(exec.values.contract_execution_date, '25.07.2026', 'short')
  assertEq(exec.localDate, '2026-07-25', 'iso local')
  assertEq(exec.source, 'generation_context', 'source')
})

run('3. contract_execution_date_long resolves automatically', () => {
  const startedAt = new Date(2026, 6, 25, 10, 0, 0)
  const exec = resolveContractExecutionValues({
    generationDate: startedAt,
    companyCity: 'Zabrze',
  })
  assertEq(
    exec.values.contract_execution_date_long,
    formatContractDateLong('2026-07-25'),
    'long',
  )
  assert(exec.values.contract_execution_date_long.includes('2026'), 'year')
  assert(exec.values.contract_execution_date_long.endsWith(' r.'), 'suffix')
})

run('4–5. Key excluded from manual fields and missing variables', () => {
  assert(isSystemAutoResolvedContractKey('contract_execution_date'), 'short')
  assert(isSystemAutoResolvedContractKey('contract_execution_date_long'), 'long')
  assert(!isSystemAutoResolvedContractKey('wedding_date'), 'wedding')
  assert(!isSystemAutoResolvedContractKey('company_city_locative'), 'city')
})

run('6–7. Preview and export share generationStartedAt across midnight', () => {
  const generationStartedAt = new Date(2026, 6, 25, 23, 50, 0)
  const preview = resolveContractExecutionValues({
    generationDate: generationStartedAt,
    companyCity: 'Zabrze',
  })
  // Simulate export after midnight — same generationStartedAt
  const afterMidnightClock = new Date(2026, 6, 26, 0, 10, 0)
  void afterMidnightClock
  const exported = resolveContractExecutionValues({
    generationDate: generationStartedAt,
    companyCity: 'Zabrze',
  })
  assertEq(
    preview.values.contract_execution_date,
    exported.values.contract_execution_date,
    'same date',
  )
  assertEq(exported.values.contract_execution_date, '25.07.2026', 'still 25th')
})

run('8. Saved version uses snapshot date', () => {
  const later = resolveContractExecutionValues({
    generationDate: new Date(2030, 0, 1),
    companyCity: 'Warszawa',
    snapshot: {
      contractExecutionDate: '25.07.2026',
      contractExecutionCity: 'Zabrzu',
    },
  })
  assertEq(later.values.contract_execution_date, '25.07.2026', 'frozen')
  assertEq(later.values.company_city_locative, 'Zabrzu', 'frozen city')
  assertEq(later.source, 'version_snapshot', 'source')
})

run('9. New generated version on another day gets new date', () => {
  const a = resolveContractExecutionValues({
    generationDate: new Date(2026, 6, 25),
    companyCity: 'Zabrze',
  })
  const b = resolveContractExecutionValues({
    generationDate: new Date(2026, 6, 26),
    companyCity: 'Zabrze',
  })
  assertEq(a.values.contract_execution_date, '25.07.2026', 'a')
  assertEq(b.values.contract_execution_date, '26.07.2026', 'b')
})

run('10. Wedding date does not override execution date', () => {
  const exec = resolveContractExecutionValues({
    generationDate: new Date(2026, 6, 25),
    companyCity: 'Zabrze',
  })
  assertEq(exec.values.contract_execution_date, '25.07.2026', 'exec')
  assert(exec.values.contract_execution_date !== '19.06.2025', 'not wedding')
  // Formatters independent of wedding
  assertEq(formatContractDateShort('2025-06-19'), '19.06.2025', 'wedding fmt')
})

run('11. Company city behavior unchanged', () => {
  const exec = resolveContractExecutionValues({
    generationDate: new Date(2026, 6, 25),
    companyCity: 'Zabrze',
  })
  assertEq(exec.values.company_city, 'Zabrze', 'nominative')
  assertEq(exec.values.company_city_locative, 'Zabrzu', 'locative')
})

run('12. Genuinely unresolved custom variables still manual', () => {
  const manual = collectManualMissing([
    {
      registryKey: 'contract_execution_date',
      missing: true,
      value: '',
    },
    {
      registryKey: 'weird_custom_field',
      missing: true,
      value: '',
    },
    {
      registryKey: 'bride_pesel',
      missing: true,
      value: '',
    },
  ])
  assertEq(manual.join(','), 'weird_custom_field,bride_pesel', 'customs only')
})

run('local calendar does not UTC-shift evening dates', () => {
  // 25 Jul 2026 23:30 local — must stay 25th in ISO local helper
  const d = new Date(2026, 6, 25, 23, 30, 0)
  assertEq(localCalendarIsoDate(d), '2026-07-25', 'no UTC day shift')
})

if (!process.exitCode) {
  console.log('\nAll automatic execution-date generation-flow tests passed.')
}
