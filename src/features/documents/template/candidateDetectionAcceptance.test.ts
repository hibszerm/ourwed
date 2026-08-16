/**
 * Acceptance: two-pass candidate detection (names, company, price, dates).
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/candidateDetectionAcceptance.test.ts
 */

import {
  detectContractCandidates,
  hasVisiblePartyIdentityWithoutSlot,
  candidatesToTemplateSlots,
} from './candidateDetection'
import { buildSlotsFromAnalysis } from './buildSlotsFromAnalysis'
import { validateTemplateSlotBindings } from './templateReadiness'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'

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

const emptyAi: AiDocumentAnalysisResult = {
  schemaVersion: '1',
  model: 'test',
  promptVersion: 'test',
  analyzerId: 'test',
  analyzerVersion: '1',
  documentType: 'contract',
  overallConfidence: 1,
  fields: [],
  packageVariables: [],
  sections: [],
  clauses: [],
  warnings: [],
  analyzedAt: new Date().toISOString(),
  sourceTextLength: 0,
}

run('Test 1 — couple names in legal sentence → composite', () => {
  const paragraphs = [
    {
      index: 2,
      text: 'Marcin Nowak i Karolina Jolińska, zwaną dalej „Parą Młodą”',
    },
  ]
  const c = detectContractCandidates(paragraphs)
  const couple = c.find(
    (x) => x.proposedKey === 'couple_full_names' && x.decision === 'accepted',
  )
  assert(Boolean(couple), 'missing couple_full_names')
  assert(couple!.operation === 'composite', 'must be composite')
  assert(
    couple!.text === 'Marcin Nowak i Karolina Jolińska',
    `text=${couple!.text}`,
  )
  assert(
    couple!.componentKeys?.join(',') === 'partner1_full_name,partner2_full_name',
    'component keys',
  )
})

run('Test 2 — company name in legal sentence', () => {
  const paragraphs = [
    {
      index: 5,
      text: 'prowadzącym działalność pod firmą Atelier Studio, zwanym dalej „Filmowcem”',
    },
  ]
  const c = detectContractCandidates(paragraphs)
  const company = c.find(
    (x) => x.proposedKey === 'company_name' && x.decision !== 'rejected',
  )
  assert(Boolean(company), 'missing company_name')
  assert(
    company!.text.includes('Atelier Studio'),
    `text=${company!.text}`,
  )
})

run('Test 3 — price in prose', () => {
  const paragraphs = [
    {
      index: 29,
      text: 'Para Młoda zapłaci wynagrodzenie w wysokości 9500 zł.',
    },
  ]
  const c = detectContractCandidates(paragraphs)
  const price = c.find(
    (x) =>
      (x.proposedKey === 'package_price' ||
        x.proposedKey === 'contract_price' ||
        x.proposedKey === 'contract_value_formatted') &&
      x.decision !== 'rejected',
  )
  assert(Boolean(price), 'missing package_price / contract_value_formatted')
  assert(/9500/.test(price!.text), `text=${price!.text}`)
})

run('Test 4 — existing wedding date', () => {
  const paragraphs = [
    {
      index: 8,
      text: 'Ślub odbędzie się dnia 30.10.2024 r.',
    },
  ]
  const c = detectContractCandidates(paragraphs)
  const date = c.find(
    (x) => x.proposedKey === 'wedding_date' && x.decision !== 'rejected',
  )
  assert(Boolean(date), 'missing wedding_date')
  assert(date!.text === '30.10.2024', `text=${date!.text}`)
  assert(date!.operation === 'replace', 'replace op')
})

run('Test 5 — SWIFT absent does not appear', () => {
  const paragraphs = [
    {
      index: 0,
      text: 'Umowa ślubna bez danych bankowych SWIFT.',
    },
  ]
  const c = detectContractCandidates(paragraphs)
  assert(
    !c.some((x) => /swift/i.test(x.proposedKey) && x.decision !== 'rejected'),
    'SWIFT must not be detected',
  )
})

run('Test 6 — Rezydencja Lubomirskich is reception_location, not person', () => {
  const paragraphs = [
    {
      index: 11,
      text: 'przyjęcia weselnego, które odbędzie się w Rezydencji Lubomirskich - Retyrada – z czego w zakresie',
    },
  ]
  const c = detectContractCandidates(paragraphs)
  const loc = c.find(
    (x) =>
      x.proposedKey === 'reception_location' && x.decision !== 'rejected',
  )
  assert(Boolean(loc), 'missing reception_location')
  assert(/Lubomirskich/i.test(loc!.text), `text=${loc!.text}`)
  assert(
    !c.some(
      (x) =>
        x.proposedKey.includes('partner') &&
        /Lubomirskich/i.test(x.text) &&
        x.decision !== 'rejected',
    ),
    'must not classify venue as person',
  )
})

run('Test 7 — visible couple without slot → needs_review', () => {
  const paragraphs = [
    {
      index: 2,
      text: 'Jan Kowalski i Anna Nowak, zwaną dalej „Parą Młodą”',
    },
  ]
  // Simulate missed detection: empty slots
  assert(
    hasVisiblePartyIdentityWithoutSlot(paragraphs, []),
    'should warn when party cue present without slot',
  )

  // With proper detection, no warning
  const slots = candidatesToTemplateSlots(detectContractCandidates(paragraphs))
  assert(
    !hasVisiblePartyIdentityWithoutSlot(paragraphs, slots),
    'should not warn when couple slot detected',
  )
})

run('Integration — buildSlotsFromAnalysis on sample party intro', () => {
  const paragraphs = [
    {
      index: 2,
      text: 'Marcin Nowak i Karolina Jolińska, zwaną dalej „Parą Młodą”',
    },
    {
      index: 5,
      text: 'firmą Atelier Studio, zwanym dalej „Filmowcem” NIP 1234567890',
    },
    {
      index: 8,
      text: 'Ślub odbędzie się dnia 30.10.2024 r.',
    },
  ]
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    plainText: paragraphs.map((p) => p.text).join('\n'),
    paragraphs,
  })
  const keys = new Set(map.slots.map((s) => s.registryKey))
  assert(keys.has('couple_full_names'), 'couple')
  assert(keys.has('company_name'), 'company')
  assert(keys.has('wedding_date'), 'date')
  assert(map.analysisStatus !== 'needs_review', 'party detected → complete')
  const readiness = validateTemplateSlotBindings(map)
  assert(readiness.ready || readiness.boundCount > 0, 'should bind slots')
})

run('Real contract shape — Aleksandrą Biłas single party + Kamerzystami', () => {
  const paragraphs = [
    {
      index: 2,
      text: 'Aleksandrą Biłas, zam. ul. Wrocławska 67/73 Kraków, tel. 603 306 423, zwaną dalej „Parą Młodą”',
    },
    {
      index: 5,
      text: 'firmą Atelier Studio Jan Kowalski, stałe miejsce wykonywania działalności gospodarczej: ul. Przykładowa 1, 00-001 Warszawa, NIP 5250000000, REGON 123456789, tel. 500 100 200, tel. 500 100 201 zwaną dalej „Kamerzystami”.',
    },
    {
      index: 9,
      text: 'Przygotowań ślubnych, które odbędą się w Rezydencji Lubomirskich - Retyrada.',
    },
    {
      index: 10,
      text: 'ceremonii ślubu, która odbędzie się w Rzeszowie;',
    },
    {
      index: 11,
      text: 'przyjęcia weselnego, które odbędzie się w Rezydencji Lubomirskich - Retyrada – z czego w zakresie przyjęcia weselnego reportaż ślubny obejmuje czas maksymalnie do godziny 00.30. Czas pracy kamerzysty wynosi maksymalnie 12 godzin. Każda dodatkowa godzina to koszt w wysokości 800zł.',
    },
    {
      index: 12,
      text: 'Para młoda wybiera wykonanie dzieła w tzw. Pakiecie Movie, który obejmuje',
    },
    {
      index: 29,
      text: 'Z tytułu wykonania Umowy Para młoda zobowiązuje się zapłacić Kamerzyście wynagrodzenie w łącznej wysokości 8 000 zł (słownie: osiem tysięcy złotych) brutto',
    },
    {
      index: 30,
      text: 'Para młoda w terminie 7 dni od daty zawarcia Umowy zobowiązana jest do wpłaty zadatku w wysokości 1000 zł (słownie: tysiąc złotych) brutto na rachunek bankowy Kamerzysty o numerze: 70 2490 0005 0000 4500 4122 4894.',
    },
  ]
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    plainText: paragraphs.map((p) => p.text).join('\n'),
    paragraphs,
  })
  const byKey = Object.fromEntries(
    map.slots.filter((s) => s.registryKey).map((s) => [s.registryKey!, s]),
  )
  console.log(
    'detected keys',
    map.slots.map((s) => `${s.registryKey}:${s.physicallyBound ? 'bound' : 'u'}`),
  )
  assert(Boolean(byKey.partner1_full_name || byKey.couple_full_names), 'party name')
  assert(Boolean(byKey.company_name), 'company_name')
  assert(Boolean(byKey.company_nip), 'nip')
  assert(Boolean(byKey.package_name), 'package Movie')
  assert(
    Boolean(byKey.contract_value_formatted || byKey.package_price),
    '8000',
  )
  assert(
    Boolean(byKey.contract_value_words),
    'contract value words',
  )
  assert(
    Boolean(byKey.agreed_deposit_formatted || byKey.deposit_amount),
    '1000',
  )
  assert(Boolean(byKey.agreed_deposit_words), 'deposit words')
  assert(Boolean(byKey.ceremony_location), 'ceremony')
  assert(Boolean(byKey.reception_location), 'reception')
  assert(map.slots.length >= 12, `expected ≥12 got ${map.slots.length}`)
})

if (!process.exitCode) {
  console.log('\nAll candidate detection acceptance tests passed.')
}
