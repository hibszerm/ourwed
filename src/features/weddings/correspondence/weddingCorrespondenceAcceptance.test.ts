/**
 * Wedding correspondence — multi-entry validation, links, mapping, legacy fallback.
 */

import {
  getCorrespondenceDisplay,
  parseWeddingCorrespondence,
  parseWeddingCorrespondenceCollection,
  validateWeddingCorrespondence,
  validateWeddingCorrespondenceEntries,
} from '@/features/weddings/correspondence/weddingCorrespondence'
import {
  mapWeddingModelToRow,
  mapWeddingRowToModel,
  type WeddingRow,
} from '@/lib/api/weddings/weddingMappers'
import type { Wedding } from '@/types/wedding'

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

function baseRow(overrides: Partial<WeddingRow> = {}): WeddingRow {
  return {
    id: 'w1',
    user_id: 'u1',
    bride_name: 'Anna',
    groom_name: 'Michał',
    email: 'anna@example.com',
    phone: null,
    wedding_date: '2026-08-01',
    ceremony_time: null,
    venue: null,
    status: 'active',
    workflow_stage: 'reservation',
    package_name: null,
    package_id: null,
    contract_value: 0,
    deposit_amount: null,
    currency: 'PLN',
    accent_color: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

run('1. Email validates and lowercases', () => {
  const r = validateWeddingCorrespondence({
    channel: 'email',
    value: '  Anna@Example.COM ',
  })
  assert(r.ok, 'ok')
  if (r.ok) assertEq(r.normalized?.value, 'anna@example.com', 'lower')
})

run('2. Invalid email rejected', () => {
  const r = validateWeddingCorrespondence({
    channel: 'email',
    value: 'not-an-email',
  })
  assert(!r.ok, 'reject')
})

run('3. Instagram handle and URL normalize', () => {
  const a = validateWeddingCorrespondence({
    channel: 'instagram',
    value: 'anna_i_michal',
  })
  assert(a.ok && a.normalized?.value === '@anna_i_michal', 'handle')
  const b = validateWeddingCorrespondence({
    channel: 'instagram',
    value: 'https://www.instagram.com/anna_i_michal/',
  })
  assert(
    b.ok && b.normalized?.value === 'https://instagram.com/anna_i_michal',
    'url preserved',
  )
})

run('4. Facebook URL links; plain name is text', () => {
  const url = getCorrespondenceDisplay({
    channel: 'facebook',
    value: 'https://facebook.com/anna.kowalska',
  })
  assert(url?.kind === 'external', 'url external')
  const plain = getCorrespondenceDisplay({
    channel: 'facebook',
    value: 'Anna Kowalska',
  })
  assert(plain?.kind === 'text', 'plain text')
})

run('5. Email display uses mailto', () => {
  const d = getCorrespondenceDisplay({
    channel: 'email',
    value: 'anna@example.com',
  })
  assertEq(d?.kind, 'mailto', 'mailto')
  assert(d?.kind === 'mailto' && d.href === 'mailto:anna@example.com', 'href')
})

run('6. Missing correspondence is empty collection', () => {
  assertEq(parseWeddingCorrespondence(null, null), null, 'legacy parse')
  assertEq(
    parseWeddingCorrespondenceCollection({}).length,
    0,
    'collection empty',
  )
  assertEq(getCorrespondenceDisplay(null), null, 'display')
  const empty = validateWeddingCorrespondenceEntries([])
  assert(empty.ok && empty.normalized.length === 0, 'empty ok')
})

run('7. Mapper prefers jsonb collection and dual-writes legacy', () => {
  const row = baseRow({
    correspondence: [
      { id: 'c1', channel: 'instagram', value: '@para' },
      { id: 'c2', channel: 'email', value: 'a@b.pl' },
    ],
    correspondence_channel: 'facebook',
    correspondence_value: 'stale',
  })
  const model = mapWeddingRowToModel(row)
  assertEq(model.correspondence?.length, 2, 'len')
  assertEq(model.correspondence?.[0]?.channel, 'instagram', 'first channel')
  assertEq(model.correspondence?.[1]?.value, 'a@b.pl', 'second value')
  const back = mapWeddingModelToRow(model)
  assert(Array.isArray(back.correspondence), 'jsonb array')
  assertEq((back.correspondence as unknown[]).length, 2, 'jsonb len')
  assertEq(back.correspondence_channel, 'instagram', 'legacy first channel')
  assertEq(back.correspondence_value, '@para', 'legacy first value')
})

run('8. Unrelated wedding update keeps correspondence array', () => {
  const wedding = mapWeddingRowToModel(
    baseRow({
      correspondence: [
        { id: 'c1', channel: 'email', value: 'a@b.pl' },
        { id: 'c2', channel: 'instagram', value: '@para' },
      ],
    }),
  ) as Wedding
  wedding.price = 12000
  const patch = mapWeddingModelToRow(wedding)
  assertEq((patch.correspondence as unknown[]).length, 2, 'kept array')
  assertEq(patch.correspondence_channel, 'email', 'kept legacy channel')
  assertEq(patch.correspondence_value, 'a@b.pl', 'kept legacy value')
  assertEq(patch.contract_value, 12000, 'price updated')
})

run('9. Legacy scalar falls back when jsonb empty', () => {
  const model = mapWeddingRowToModel(
    baseRow({
      correspondence: [],
      correspondence_channel: 'instagram',
      correspondence_value: '@legacy',
    }),
  )
  assertEq(model.correspondence?.length, 1, 'fallback len')
  assertEq(model.correspondence?.[0]?.value, '@legacy', 'fallback value')
})

run('10. Multiple same-channel values allowed; exact duplicates rejected', () => {
  const ok = validateWeddingCorrespondenceEntries([
    { id: '1', channel: 'instagram', value: '@anna' },
    { id: '2', channel: 'instagram', value: '@michal' },
  ])
  assert(ok.ok && ok.normalized.length === 2, 'two instagram ok')

  const dup = validateWeddingCorrespondenceEntries([
    { id: '1', channel: 'email', value: 'A@B.pl' },
    { id: '2', channel: 'email', value: 'a@b.pl' },
  ])
  assert(!dup.ok, 'duplicate rejected')
})

run('11. Channel without value rejected; empty draft rows skipped', () => {
  const missing = validateWeddingCorrespondenceEntries([
    { id: '1', channel: 'email', value: '  ' },
  ])
  assert(!missing.ok, 'missing value')
  const skipped = validateWeddingCorrespondenceEntries([
    { id: '1', channel: '', value: '' },
    { id: '2', channel: 'facebook', value: 'Anna' },
  ])
  assert(skipped.ok && skipped.normalized.length === 1, 'skip empty')
})

run('12. Instagram username builds safe profile URL', () => {
  const d = getCorrespondenceDisplay({
    channel: 'instagram',
    value: '@anna_i_michal',
  })
  assert(d?.kind === 'external', 'external')
  assert(
    d?.kind === 'external' && d.href === 'https://instagram.com/anna_i_michal',
    'href',
  )
})

run('13. Instagram full URL remains valid link', () => {
  const d = getCorrespondenceDisplay({
    channel: 'instagram',
    value: 'https://instagram.com/anna_i_michal',
  })
  assert(d?.kind === 'external', 'external')
  assert(
    d?.kind === 'external' && d.href === 'https://instagram.com/anna_i_michal',
    'href',
  )
})

run('14. Empty legacy wedding maps to empty array', () => {
  const model = mapWeddingRowToModel(baseRow())
  assert(Array.isArray(model.correspondence), 'array')
  assertEq(model.correspondence?.length, 0, 'empty')
})

console.log('\nwedding correspondence: done')
