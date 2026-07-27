/**
 * Client-party detection: Klientami + two persons + shared contacts + multi-para.
 * Run: npm run test:client-party-klientami
 */

import {
  detectContractCandidates,
  candidatesToTemplateSlots,
} from './candidateDetection'
import {
  evaluateClientPartyReadiness,
  isClientPartyIdentityKey,
} from './clientPartyReadiness'
import {
  findClientPartyRoleAnchor,
  normalizeClientPartyRoleLabel,
  isProviderPartyRoleLabel,
} from './clientPartyRolePhrases'
import { evaluatePackageContractReadiness } from './packageContractAllowlist'
import { buildSlotsFromAnalysis } from './buildSlotsFromAnalysis'
import { isSlotPhysicallyBound } from './types'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'

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

function emptyAi(): AiDocumentAnalysisResult {
  return {
    documentType: 'contract',
    fields: [],
    confidence: 1,
    warnings: [],
  } as unknown as AiDocumentAnalysisResult
}

function pipeline(paragraphs: Array<{ index: number; text: string }>) {
  const candidates = detectContractCandidates(paragraphs)
  const slots = candidatesToTemplateSlots(candidates)
  const map = buildSlotsFromAnalysis({
    ai: emptyAi(),
    plainText: paragraphs.map((p) => p.text).join('\n'),
    paragraphs,
    sourceKind: 'docx',
  })
  const physical = map.slots.filter(isSlotPhysicallyBound)
  const boundKeys = physical
    .map((s) => s.registryKey)
    .filter((k): k is string => Boolean(k))
  const clientParty = evaluateClientPartyReadiness({
    boundRegistryKeys: boundKeys,
  })
  const readiness = evaluatePackageContractReadiness({
    allowedRegistryKeys: boundKeys,
  })
  return { candidates, slots, physical, boundKeys, clientParty, readiness, map }
}

const KWIATKOWSCY_MULTI = [
  {
    index: 0,
    text: 'Zawarta w dniu 14.03.2027 r. w Krakowie, zwana dalej „Umową”,',
  },
  { index: 1, text: 'pomiędzy:' },
  { index: 2, text: 'Anną Kwiatkowską i Tomaszem Kwiatkowskim,' },
  { index: 3, text: 'zam. ul. Lipowa 12/4, 30-702 Kraków,' },
  { index: 4, text: 'tel. 512 340 221,' },
  { index: 5, text: 'zwanymi dalej „Klientami”' },
  { index: 6, text: 'a' },
  {
    index: 7,
    text: 'firmą Studio Foto Lumen Anna Wiśniewska, stałe miejsce wykonywania działalności gospodarczej: ul. Krakowska 22/3, 30-002 Kraków, NIP 679-000-00-00, REGON 123456789, tel. 601 220 330, zwaną dalej „Fotografem”.',
  },
]

const KWIATKOWSCY_SINGLE =
  'Anną Kwiatkowską i Tomaszem Kwiatkowskim, zam. ul. Lipowa 12/4, 30-702 Kraków, tel. 512 340 221, zwanymi dalej „Klientami”'

run('role-label normalize: Klientami → client', () => {
  assertEq(normalizeClientPartyRoleLabel('Klientami'), 'client', 'Klientami')
  assertEq(normalizeClientPartyRoleLabel('Klientów'), 'client', 'Klientów')
  assertEq(normalizeClientPartyRoleLabel('Parą Młodą'), 'couple', 'Para')
  assertEq(normalizeClientPartyRoleLabel('Zamawiającymi'), 'client', 'Zam')
  assertEq(normalizeClientPartyRoleLabel('Narzeczonymi'), 'couple', 'Nar')
  assert(isProviderPartyRoleLabel('Fotografem'), 'Fotografem is provider')
  assertEq(
    normalizeClientPartyRoleLabel('Fotografem'),
    null,
    'Fotografem not client',
  )
})

run('role anchor finds zwanymi dalej Klientami', () => {
  const hit = findClientPartyRoleAnchor(
    'tel. 512 340 221, zwanymi dalej „Klientami”',
  )
  assert(hit != null, 'anchor found')
  assertEq(hit!.family, 'client', 'family')
  assert(/Klientami/i.test(hit!.roleLabel), 'label')
})

run('4 — two persons + zwanymi dalej Klientami (single para)', () => {
  const r = pipeline([{ index: 0, text: KWIATKOWSCY_SINGLE }])
  assert(r.clientParty.ready, 'ready')
  assertEq(r.clientParty.recognizedPersonCount, 2, 'two persons via composite')
  assert(
    r.boundKeys.some(isClientPartyIdentityKey),
    'identity binding',
  )
  assert(
    r.boundKeys.includes('couple_full_names') ||
      (r.boundKeys.includes('partner1_full_name') &&
        r.boundKeys.includes('partner2_full_name')),
    'identity key shape',
  )
  const id = r.physical.find((s) => isClientPartyIdentityKey(s.registryKey))
  assert(id != null, 'physical identity')
  assert(
    !/Klientami|zwanymi|zam\.|tel\./i.test(id!.originalText ?? ''),
    'role/contact not in identity span',
  )
  assert(/Kwiatkowsk/i.test(id!.originalText ?? ''), 'names in span')
})

run('10 — Kwiatkowscy multi-paragraph DOCX structure', () => {
  const r = pipeline(KWIATKOWSCY_MULTI)
  assert(r.clientParty.ready, 'ready')
  assertEq(r.clientParty.recognizedPersonCount, 2, 'two persons')
  assert(r.readiness.presentCategories.includes('couple'), 'couple category')
  assertEq(r.readiness.missingRegistryKeys.includes('client_party_identity'), false, 'no missing identity')
  assert(
    !r.boundKeys.some((k) => k.startsWith('company_') && isClientPartyIdentityKey(k)),
    'no company identity',
  )
  // Provider name must not be a client identity binding
  const clientIds = r.physical.filter((s) =>
    isClientPartyIdentityKey(s.registryKey),
  )
  assert(
    clientIds.every((s) => !/Wiśniewska|Studio Foto Lumen/i.test(s.originalText ?? '')),
    'provider excluded from identity',
  )
})

run('3 — two persons + zwanymi dalej Parą Młodą', () => {
  const r = pipeline([
    {
      index: 0,
      text: 'Anną Kowalską i Janem Nowakiem, zam. ul. Wspólna 3, tel. 502 502 502, zwanymi dalej „Parą Młodą”',
    },
  ])
  assert(r.clientParty.ready, 'ready')
  assertEq(r.clientParty.recognizedPersonCount, 2, 'two')
})

run('5 — shared address and phone accepted', () => {
  const r = pipeline([{ index: 0, text: KWIATKOWSCY_SINGLE }])
  assert(r.clientParty.ready, 'ready')
  assert(
    r.boundKeys.includes('bride_address') ||
      r.boundKeys.includes('client_address'),
    'shared address bound',
  )
  assert(
    r.boundKeys.includes('bride_phone') || r.boundKeys.includes('client_phone'),
    'shared phone bound',
  )
})

run('7 — one person + zwanym dalej Klientem', () => {
  const r = pipeline([
    {
      index: 0,
      text: 'Robertem Strojkiem, zam. ul. A 1, tel. 600 100 200, zwanym dalej „Klientem”',
    },
  ])
  assert(r.clientParty.ready, 'ready')
  assertEq(r.clientParty.recognizedPersonCount, 1, 'one')
})

run('8 — one person + zwaną dalej Klientką', () => {
  const r = pipeline([
    {
      index: 0,
      text: 'Aleksandrą Biłas, zam. ul. A 1, tel. 600 100 200, zwaną dalej „Klientką”',
    },
  ])
  assert(r.clientParty.ready, 'ready')
})

run('11 — provider-only not ready', () => {
  const r = pipeline([
    {
      index: 0,
      text: 'firmą Studio Foto Lumen Anna Wiśniewska, tel. 601 220 330, zwaną dalej „Fotografem”.',
    },
  ])
  assert(!r.clientParty.ready, 'not ready')
  assert(
    r.clientParty.missingRegistryKeys.includes('client_party_identity'),
    'missing identity',
  )
})

run('12 — provider natural person does not satisfy client', () => {
  const r = pipeline(KWIATKOWSCY_MULTI)
  assert(r.clientParty.ready, 'client ready from Kwiatkowscy')
  const ids = r.physical.filter((s) => isClientPartyIdentityKey(s.registryKey))
  assert(
    ids.every((s) => /Kwiatkowsk/i.test(s.originalText ?? '')),
    'only client names',
  )
})

run('14 — repeated Klienci in later clauses does not invent identities', () => {
  const r = pipeline([
    { index: 0, text: KWIATKOWSCY_SINGLE },
    {
      index: 1,
      text: 'Klienci zobowiązują się do współpracy. Klienci pokrywają koszty dojazdu.',
    },
  ])
  const ids = r.physical.filter((s) => isClientPartyIdentityKey(s.registryKey))
  assert(ids.length >= 1, 'at least one identity')
  assert(
    ids.every((s) => /Kwiatkowsk/i.test(s.originalText ?? '')),
    'no fake identities from legal "Klienci"',
  )
})

console.log('\nKlientami / multi-paragraph client-party tests finished.')
