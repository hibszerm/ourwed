/**
 * Client-party universality — one or two persons, any gender/role.
 * Run: npm run test:client-party-readiness
 */

import {
  detectContractCandidates,
  candidatesToTemplateSlots,
} from './candidateDetection'
import {
  evaluateClientPartyReadiness,
  isClientPartyIdentityKey,
} from './clientPartyReadiness'
import { evaluatePackageContractReadiness } from './packageContractAllowlist'
import { isSlotPhysicallyBound } from './types'
import { buildPackageContractHealthReport } from './packageContractHealthAudit'

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

function analyzeClientClause(text: string, documentName: string) {
  const paragraphs = [{ index: 0, text }]
  const candidates = detectContractCandidates(paragraphs)
  const slots = candidatesToTemplateSlots(candidates)
  const physical = slots.filter(isSlotPhysicallyBound)
  const boundKeys = physical
    .map((s) => s.registryKey)
    .filter((k): k is string => Boolean(k))
  const clientParty = evaluateClientPartyReadiness({
    boundRegistryKeys: boundKeys,
  })
  const readiness = evaluatePackageContractReadiness({
    allowedRegistryKeys: boundKeys,
  })

  console.info('[package-contract-client-party-analysis]', {
    documentName,
    clientParty: {
      detectedPersons: clientParty.persons.map((p) => ({
        sourceText: physical.find((s) =>
          p.boundFullNameKeys.includes(s.registryKey ?? ''),
        )?.originalText,
        assignedKey: p.boundFullNameKeys[0] ?? null,
        role: p.role,
        physicalBindingCreated: p.boundFullNameKeys.length > 0,
        allowlisted: true,
        contributesToReadiness: p.boundFullNameKeys.length > 0,
      })),
      detectedAddresses: physical
        .filter((s) => s.registryKey?.includes('address'))
        .map((s) => s.registryKey),
      detectedPhones: physical
        .filter((s) => s.registryKey?.includes('phone'))
        .map((s) => s.registryKey),
      detectedPesels: physical
        .filter((s) => s.registryKey?.includes('pesel'))
        .map((s) => s.registryKey),
      categorySatisfied: clientParty.ready,
      failureReason: clientParty.ready
        ? null
        : clientParty.missingRequiredCapabilities.join(','),
    },
    candidates: candidates.map((c) => ({
      proposedKey: c.proposedKey,
      text: c.text,
      decision: c.decision,
      confidence: c.confidence,
      reason: c.reason,
    })),
    boundKeys,
    coupleReady: readiness.presentCategories.includes('couple'),
  })

  return { candidates, slots, physical, boundKeys, clientParty, readiness }
}

const FIXTURE_WOMAN =
  'Zawarta w dniu 01.01.2026 pomiędzy: Aleksandrą Biłas, zam. ul. Wrocławska 1 Kraków, tel. 600 100 200, zwaną dalej „Parą Młodą” a firmą Video Productions Marcin Hibszer, zwanym dalej „Filmowcem”.'

const FIXTURE_MAN =
  'Zawarta w dniu 01.01.2026 pomiędzy: Robertem Strojek, zam. ul. Wrocławska 1 Kraków, tel. 600 100 200, zwanego dalej „Parą Młodą” a firmą Video Productions Marcin Hibszer, zwanym dalej „Filmowcem”.'

run('prove divergence: feminine zwaną detects; masculine zwanego must detect equally', () => {
  const woman = analyzeClientClause(FIXTURE_WOMAN, 'fixture-woman')
  const man = analyzeClientClause(FIXTURE_MAN, 'fixture-man')

  assert(woman.clientParty.ready, 'woman client party ready')
  assert(man.clientParty.ready, 'man client party ready')
  assertEq(
    woman.clientParty.recognizedPersonCount,
    1,
    'woman person count',
  )
  assertEq(man.clientParty.recognizedPersonCount, 1, 'man person count')
  assert(
    woman.boundKeys.some(isClientPartyIdentityKey),
    'woman has identity binding',
  )
  assert(
    man.boundKeys.some(isClientPartyIdentityKey),
    'man has identity binding',
  )
  assert(
    woman.readiness.presentCategories.includes('couple'),
    'woman couple category',
  )
  assert(
    man.readiness.presentCategories.includes('couple'),
    'man couple category',
  )
})

run('A — one woman, no PESEL', () => {
  const r = analyzeClientClause(
    'Aleksandrą Biłas, zam. ul. Przykładowa 1, tel. 500 100 200, zwaną dalej „Parą Młodą”',
    'A',
  )
  assert(r.clientParty.ready, 'ready')
  assertEq(r.clientParty.recognizedPersonCount, 1, 'one person')
  assert(
    !r.boundKeys.some((k) => k.includes('pesel')),
    'no pesel required',
  )
  assertEq(r.clientParty.missingRequiredCapabilities.length, 0, 'no missing')
})

run('B — one man, no PESEL (parity with A)', () => {
  const r = analyzeClientClause(
    'Robertem Strojek, zam. ul. Przykładowa 1, tel. 500 100 200, zwanego dalej „Parą Młodą”',
    'B',
  )
  assert(r.clientParty.ready, 'ready')
  assertEq(r.clientParty.recognizedPersonCount, 1, 'one person')
  assert(
    !r.boundKeys.some((k) => k.includes('pesel')),
    'no pesel required',
  )
})

run('C — one person, unknown role (Zamawiający)', () => {
  const r = analyzeClientClause(
    'Alex Nowak, zam. ul. Lipowa 2, tel. 501 501 501, dalej jako „Zamawiający”',
    'C',
  )
  assert(r.clientParty.ready, 'ready with unknown role')
  assertEq(r.clientParty.recognizedPersonCount, 1, 'one person')
})

run('D — two people, shared address cue', () => {
  const r = analyzeClientClause(
    'Anną Kowalską i Janem Nowakiem, zam. ul. Wspólna 3, tel. 502 502 502, zwanymi dalej „Parą Młodą”',
    'D',
  )
  assert(r.clientParty.ready, 'ready')
  assert(
    r.boundKeys.includes('couple_full_names') ||
      r.clientParty.recognizedPersonCount >= 1,
    'composite or persons',
  )
})

run('E — two people separate introductions (partner keys satisfy)', () => {
  const readiness = evaluateClientPartyReadiness({
    boundRegistryKeys: [
      'partner1_full_name',
      'partner2_full_name',
      'bride_address',
      'groom_address',
      'bride_phone',
      'groom_phone',
    ],
  })
  assert(readiness.ready, 'ready')
  assertEq(readiness.recognizedPersonCount, 2, 'two persons')
})

run('F — two women identity keys', () => {
  const readiness = evaluateClientPartyReadiness({
    boundRegistryKeys: ['bride_full_name', 'partner2_full_name'],
  })
  assert(readiness.ready, 'ready without groom')
  assert(readiness.recognizedPersonCount >= 1, 'persons')
})

run('G — two men identity keys', () => {
  const readiness = evaluateClientPartyReadiness({
    boundRegistryKeys: ['groom_full_name', 'partner1_full_name'],
  })
  assert(readiness.ready, 'ready without bride')
})

run('H — one person with PESEL key bound', () => {
  const readiness = evaluateClientPartyReadiness({
    boundRegistryKeys: ['partner1_full_name', 'bride_pesel'],
  })
  assert(readiness.ready, 'ready with pesel')
})

run('I — one person without PESEL — still ready', () => {
  const readiness = evaluateClientPartyReadiness({
    boundRegistryKeys: ['partner1_full_name'],
    templateRegistryKeys: ['partner1_full_name'],
  })
  assert(readiness.ready, 'ready without pesel')
  assert(
    !readiness.missingRequiredCapabilities.includes('client_party_pesel'),
    'pesel not required',
  )
})

run('J — service provider only does not satisfy client readiness', () => {
  const r = analyzeClientClause(
    'firmą Video Productions Marcin Hibszer, zwanym dalej „Filmowcem”, NIP 525-000-00-00',
    'J',
  )
  assert(!r.clientParty.ready, 'not ready')
  assert(
    !r.boundKeys.some(isClientPartyIdentityKey),
    'no client identity from provider',
  )
  assert(
    r.clientParty.missingRegistryKeys.includes('client_party_identity'),
    'actionable missing key',
  )
})

run('K — client + provider: only client contributes', () => {
  const r = analyzeClientClause(FIXTURE_MAN, 'K')
  assert(r.clientParty.ready, 'client ready')
  assert(
    !r.boundKeys.includes('company_name') ||
      r.slots.every(
        (s) =>
          s.registryKey !== 'company_name' ||
          s.variableClassification === 'template_constant',
      ),
    'provider stays immutable / non-client',
  )
})

run('L — legacy bride_full_name still satisfies couple', () => {
  const readiness = evaluatePackageContractReadiness({
    allowedRegistryKeys: [
      'bride_full_name',
      'contract_execution_date',
      'wedding_date',
      'contract_value_formatted',
    ],
  })
  assert(readiness.ready, 'legacy ready')
  assert(readiness.clientParty.ready, 'client party')
})

run('L2 — legacy groom_full_name alone satisfies couple (was the asymmetry fear)', () => {
  const readiness = evaluatePackageContractReadiness({
    allowedRegistryKeys: [
      'groom_full_name',
      'contract_execution_date',
      'wedding_date',
      'contract_value',
    ],
  })
  assert(readiness.ready, 'groom-only ready')
  assert(readiness.presentCategories.includes('couple'), 'couple present')
})

run('M — Para Młoda label is not a name binding', () => {
  const r = analyzeClientClause(
    'Robertem Strojek, zam. ul. X 1, tel. 600 100 200, zwanego dalej „Parą Młodą”. Para Młoda zobowiązuje się.',
    'M',
  )
  const nameSlots = r.physical.filter((s) =>
    isClientPartyIdentityKey(s.registryKey),
  )
  assert(nameSlots.length >= 1, 'identity bound')
  assert(
    nameSlots.every((s) => !/Parą Młodą/i.test(s.originalText ?? '')),
    'role label not the name span',
  )
})

run('N — inflected forms (masculine + feminine) both bind', () => {
  const forms = [
    'Robertem Strojek, zam. ul. A 1, tel. 600 100 200, zwanego dalej „Parą Młodą”',
    'Aleksandrą Biłas, zam. ul. A 1, tel. 600 100 200, zwaną dalej „Parą Młodą”',
    'Janem Nowakiem, zam. ul. A 1, tel. 600 100 200, zwanym dalej „Parą Młodą”',
    'Anną Kowalską, zam. ul. A 1, tel. 600 100 200, zwaną dalej „Parą Młodą”',
  ]
  for (const text of forms) {
    const r = analyzeClientClause(text, 'N')
    assert(r.clientParty.ready, `ready: ${text.slice(0, 20)}`)
  }
})

run('health: bindings exist + incomplete categories → bindings_valid ok, required_data_ready critical', () => {
  const report = buildPackageContractHealthReport({
    paragraphs: [{ index: 0, text: 'Wynagrodzenie 9000 zł.' }],
    slots: [
      {
        id: '1',
        registryKey: 'contract_value_formatted',
        label: 'Wartość',
        enabled: true,
        physicallyBound: true,
        paragraphIndex: 0,
        startOffset: 14,
        endOffset: 22,
        originalText: '9000 zł',
        operation: 'replace',
        sourceHint: 'package',
        occurrences: 1,
      },
    ],
    requiredData: {
      ready: false,
      missingCategories: ['couple', 'contract_date', 'wedding_date'],
      missingRegistryKeys: ['client_party_identity'],
      blockingIssues: [],
      evidence: ['diagnostic:required_categories_incomplete'],
    },
  })
  const bindings = report.checks.find((c) => c.code === 'bindings_valid')
  const required = report.checks.find((c) => c.code === 'required_data_ready')
  assertEq(bindings?.status, 'ok', 'bindings ok when physical present')
  assertEq(required?.status, 'critical', 'required data separate')
  assertEq(
    required?.evidence,
    'diagnostic:required_categories_incomplete',
    'required evidence',
  )
  assert(
    bindings?.evidence !== 'diagnostic:bindings_present_readiness_incomplete',
    'no legacy mislabel',
  )
})

run('FIXTURE_1 vs FIXTURE_2 readiness invariant', () => {
  const a = analyzeClientClause(FIXTURE_WOMAN, 'FIXTURE_1')
  const b = analyzeClientClause(FIXTURE_MAN, 'FIXTURE_2')
  assertEq(a.clientParty.ready, true, 'F1 ready')
  assertEq(b.clientParty.ready, true, 'F2 ready')
  assertEq(
    a.clientParty.recognizedPersonCount,
    b.clientParty.recognizedPersonCount,
    'same person count',
  )
  assertEq(a.clientParty.recognizedPersonCount, 1, 'one person each')
})

console.log('\nClient-party readiness universality tests finished.')
