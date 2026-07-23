/**
 * Acceptance: physical slot binding + deterministic render + quality.
 * Run: npm run test:contract-quality
 */

import { applyBoundSlotsToParagraphs } from './applyBoundSlots'
import { verifyContractTransformation } from './contractQualityCheck'
import { bindSlotsToDocument } from './slotBinder'
import { validateTemplateSlotBindings } from './templateReadiness'
import type { TemplateSlot } from './types'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
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

const paragraphs = [
  { index: 9, text: 'Przygotowań ślubnych, które odbędą się w ;' },
  { index: 10, text: 'ceremonii ślubu, która odbędzie się w.;' },
  {
    index: 11,
    text:
      'przyjęcia weselnego, które odbędzie się w  – z czego w zakresie przyjęcia weselnego reportaż ślubny obejmuje czas maksymalnie do godziny . Czas pracy filmowca wynosi maksymalnie godzin. Każda dodatkowa godzina to koszt w wysokości .',
  },
]

run('Binder — preparation / ceremony / reception / time / overtime', () => {
  const { slots, unboundRegistryKeys } = bindSlotsToDocument({
    registryKeys: [
      'preparation_location',
      'ceremony_location',
      'reception_location',
      'coverage_end_time',
      'overtime_rate',
    ],
    paragraphs,
  })

  const byKey = Object.fromEntries(
    slots.filter((s) => s.physicallyBound).map((s) => [s.registryKey!, s]),
  )

  assert(Boolean(byKey.preparation_location), 'preparation_location unbound')
  assert(byKey.preparation_location!.paragraphIndex === 9, 'prep para')
  assert(byKey.preparation_location!.operation === 'insert', 'prep insert')

  assert(Boolean(byKey.ceremony_location), 'ceremony_location unbound')
  assert(byKey.ceremony_location!.paragraphIndex === 10, 'ceremony para')
  assert(
    byKey.ceremony_location!.originalText?.includes('.') ||
      byKey.ceremony_location!.operation === 'replace',
    'ceremony should replace malformed "."',
  )

  assert(Boolean(byKey.reception_location), 'reception_location unbound')
  assert(Boolean(byKey.coverage_end_time), 'coverage_end_time unbound')
  assert(Boolean(byKey.overtime_rate), 'overtime_rate unbound')

  assert(
    byKey.reception_location!.paragraphIndex === 11 &&
      byKey.coverage_end_time!.paragraphIndex === 11 &&
      byKey.overtime_rate!.paragraphIndex === 11,
    'multi slots on para 11',
  )

  // Ranges must not overlap
  const p11 = [byKey.reception_location!, byKey.coverage_end_time!, byKey.overtime_rate!]
  for (let i = 0; i < p11.length; i++) {
    for (let j = i + 1; j < p11.length; j++) {
      const a = p11[i]!
      const b = p11[j]!
      const ar = { start: a.startOffset!, end: a.endOffset! }
      const br = { start: b.startOffset!, end: b.endOffset! }
      assert(
        !(ar.start < br.end && br.start < ar.end),
        `overlap ${a.registryKey} / ${b.registryKey}`,
      )
    }
  }

  assert(unboundRegistryKeys.length === 0, `unbound: ${unboundRegistryKeys}`)

  const readiness = validateTemplateSlotBindings({
    version: 1,
    slots,
    unmappedDynamics: [],
    unboundRegistryKeys,
  })
  assert(readiness.ready, `not ready: ${readiness.unresolvedKeys.join(',')}`)
})

run('Deterministic render — preparation + ceremony punctuation', () => {
  const { slots } = bindSlotsToDocument({
    registryKeys: ['preparation_location', 'ceremony_location'],
    paragraphs: paragraphs.slice(0, 2),
  })

  const resolved = {
    preparation_location:
      'Poznańska 92, 44-335 Jastrzębie-Zdrój, Polska',
    ceremony_location: 'Willa Słoneczna, Słoneczna 16, 43-426 Dębowiec, Polska',
  }

  const applied = applyBoundSlotsToParagraphs({
    original: paragraphs.slice(0, 2),
    slots,
    resolved,
  })
  assert(applied.failures.length === 0, applied.failures[0]?.reason ?? 'fail')

  const prep = applied.paragraphs.find((p) => p.index === 9)!.text
  const cer = applied.paragraphs.find((p) => p.index === 10)!.text

  assert(
    prep ===
      'Przygotowań ślubnych, które odbędą się w Poznańska 92, 44-335 Jastrzębie-Zdrój, Polska;',
    `prep got: ${prep}`,
  )
  assert(
    cer ===
      'ceremonii ślubu, która odbędzie się w Willa Słoneczna, Słoneczna 16, 43-426 Dębowiec, Polska;',
    `ceremony got: ${cer}`,
  )

  const quality = verifyContractTransformation({
    original: paragraphs.slice(0, 2),
    transformed: applied.paragraphs,
    resolvedByKey: resolved,
    slots,
  })
  assert(quality.ok, quality.report ?? 'quality fail')
  assert(
    (quality.failures ?? []).every(
      (f) => (f.expectedVariableChanges?.length ?? 0) > 0 || quality.ok,
    ),
    'slots should be bound in report when failing',
  )
})

run('Multi-slot paragraph 11 render + quality PASS', () => {
  const { slots } = bindSlotsToDocument({
    registryKeys: [
      'reception_location',
      'coverage_end_time',
      'overtime_rate',
    ],
    paragraphs: [paragraphs[2]!],
  })

  const resolved = {
    reception_location: 'Villa Love, Lwowska, 34-144 Izdebnik, Polska',
    coverage_end_time: '00.30',
    overtime_rate: '1000zł',
  }

  const applied = applyBoundSlotsToParagraphs({
    original: [paragraphs[2]!],
    slots,
    resolved,
  })
  assert(applied.failures.length === 0, applied.failures[0]?.reason ?? 'fail')

  const text = applied.paragraphs[0]!.text
  assert(text.includes('Villa Love'), 'reception inserted')
  assert(text.includes('00.30'), 'time inserted exactly')
  assert(!text.includes('max do'), 'must not invent max do')
  assert(text.includes('1000zł'), 'overtime inserted')

  const quality = verifyContractTransformation({
    original: [paragraphs[2]!],
    transformed: applied.paragraphs,
    resolvedByKey: resolved,
    slots,
  })
  assert(quality.ok, quality.report ?? 'quality fail')
})

run('Legal rewrite still FAILS', () => {
  const slots: TemplateSlot[] = [
    {
      id: 'x',
      registryKey: 'preparation_location',
      label: 'x',
      sourceHint: 'wedding',
      occurrences: 1,
      enabled: true,
      physicallyBound: true,
      operation: 'insert',
      paragraphIndex: 9,
      leftAnchor: 'Przygotowań ślubnych, które odbędą się w',
      rightAnchor: ';',
      startOffset: 44,
      endOffset: 44,
      prefix: ' ',
      suffix: '',
    },
  ]
  const quality = verifyContractTransformation({
    original: [paragraphs[0]!],
    transformed: [
      {
        index: 9,
        text: 'Przygotowań ślubnych, które odbędą się w Poznań; dodatkowo zmienia się treść prawną.',
      },
    ],
    resolvedByKey: { preparation_location: 'Poznań' },
    slots,
  })
  assert(!quality.ok, 'expected FAIL')
})

if (!process.exitCode) {
  console.log('\nAll slot-binding acceptance tests passed.')
}
