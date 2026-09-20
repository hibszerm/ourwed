/**
 * CG7.1 — filled party identity generalization (offline, no OpenAI).
 *
 * P01–P10 party fixtures + language/provider-role sparse-scope regressions.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/ai-contract-transform/cg71FilledPartyIdentityAcceptance.test.ts
 */

import { runPostReconstructionQualityGate } from './quality/buildQualityReport'
import { buildExpectationManifest } from './quality/expectationManifest'
import {
  discoverFilledPartyEvidence,
  isClientPartyIdentityBlock,
  isProviderIdentityBlock,
  verifyFilledPartyIdentity,
  verifyProviderRoleSparseScope,
} from './quality/partyFilledIdentity'
import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from './types'
import type { ProtectedContractData } from './types'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function dataset(personCount: 1 | 2): ContractTransformationDataset {
  return {
    clients: {
      personCount,
      displayNames:
        personCount === 2 ? 'Anna Testowa i Jan Próbny' : 'Anna Testowa',
      address: 'ul. Kwiatowa 12, 30-001 Kraków',
      phone: '+48 500 100 200',
    },
    dates: {
      contractExecutionDate: '20.09.2026 r.',
      weddingDate: '19.06.2027 r.',
    },
    package: { name: 'Pakiet QA Premium' },
    finances: {
      contractValueFormatted: '11 200 zł',
      contractValueWords: 'jedenaście tysięcy dwieście złotych',
      depositFormatted: '2 800 zł',
      depositWords: 'dwa tysiące osiemset złotych',
      remainingFormatted: '8 400 zł',
      remainingWords: 'osiem tysięcy czterysta złotych',
    },
    locations: {},
  }
}

function emptyProtected(): ProtectedContractData {
  return { exactProtectedValues: [], protectedPatterns: [] }
}

function blocksFrom(
  rows: Array<{
    id: string
    text: string
    kind?: 'paragraph' | 'tableCell'
    tableContext?: TransformDocumentBlock['tableContext']
  }>,
): { source: TransformDocumentBlock[]; asIs: TransformedBlock[] } {
  const source = rows.map((r, i) => ({
    blockId: r.id,
    paragraphIndex: i,
    text: r.text,
    kind: r.kind ?? ('paragraph' as const),
    ...(r.tableContext ? { tableContext: r.tableContext } : {}),
  }))
  const asIs = rows.map((r) => ({ blockId: r.id, text: r.text }))
  return { source, asIs }
}

function rewriteParty(
  source: TransformDocumentBlock[],
  partyId: string,
  text: string,
): TransformedBlock[] {
  return source.map((b) =>
    b.blockId === partyId ? { blockId: b.blockId, text } : { blockId: b.blockId, text: b.text },
  )
}

function surround(party: string, extra: Array<{ id: string; text: string }> = []) {
  return [
    { id: 'title', text: 'UMOWA O DZIEŁO — REALIZACJA USŁUGI ŚLUBNEJ' },
    { id: 'open', text: 'zawarta w dniu 12.03.2026 r. w Poznaniu, pomiędzy:' },
    { id: 'party', text: party },
    { id: 'and', text: 'a' },
    {
      id: 'provider',
      text:
        'Studio Klatka Filmowa Anna Nowak, NIP 7790001111, z siedzibą ul. Garbary 10, 61-001 Poznań, zwanym dalej „Filmowcem”.',
    },
    {
      id: 'scope',
      text: '1. Przedmiotem Umowy jest film ślubny z dnia 14.08.2027 r.',
    },
    {
      id: 'money',
      text:
        'Wynagrodzenie wynosi 11 200 zł (słownie: jedenaście tysięcy dwieście złotych) brutto. Zadatek 2 800 zł (słownie: dwa tysiące osiemset złotych). Pozostała część 8 400 zł (słownie: osiem tysięcy czterysta złotych).',
    },
    {
      id: 'portfolio',
      text:
        'Zamawiający wyraża zgodę na publikację wybranych ujęć w portfolio Filmowca, na stronie internetowej oraz w mediach społecznościowych.',
    },
    {
      id: 'copyright',
      text:
        'Prawa autorskie do utworów powstałych w ramach Umowy przysługują Filmowcowi.',
    },
    { id: 'sig', text: 'Zamawiający                                      Wykonawca' },
    ...extra,
  ]
}

// ---- Discovery unit checks ----
{
  assert(
    isClientPartyIdentityBlock(
      'Katarzyną Przykładową, zam. ul. Lipowa 3, zwaną dalej „Zamawiającym”,',
    ),
    'U01-style clause is client party',
  )
  assert(
    isProviderIdentityBlock(
      'Studio Klatka Filmowa Anna Nowak, NIP 7790001111, zwanym dalej „Filmowcem”.',
    ),
    'provider NIP clause is provider',
  )
  assert(
    !isClientPartyIdentityBlock(
      'Studio Klatka Filmowa Anna Nowak, NIP 7790001111, zwanym dalej „Filmowcem”.',
    ),
    'provider is not client party',
  )
  console.log('PASS  discovery: client vs provider structural markers')
}

// ---- P01 one old client, nominative/simple ----
{
  const { source, asIs } = blocksFrom(
    surround('Klientem jest: Marta Demo, zam. ul. Lipowa 1, Warszawa.'),
  )
  const evidence = discoverFilledPartyEvidence(source)
  assert(evidence.some((e) => e.blockId === 'party'), 'P01: party discovered')
  const manifest = buildExpectationManifest({
    sourceBlocks: source,
    dataset: dataset(1),
    protectedData: emptyProtected(),
  })
  assert(
    (manifest.sourcePartyEvidence ?? []).some((e) => e.blockId === 'party'),
    'P01: sourcePartyEvidence',
  )
  assert(
    manifest.requiredReplacements.some(
      (r) =>
        r.canonicalField === 'customer.names' &&
        r.sourceBlockIds.includes('party'),
    ),
    'P01: requiredReplacements lists party block',
  )
  const staleGate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: asIs,
    dataset: dataset(1),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(!staleGate.downloadAllowed, 'P01: stale identity fail-closed')
  assert(
    staleGate.report.blockingIssues.some(
      (i) => i.code === 'stale_party_identity_remaining' || i.code === 'party_identity_canonical_missing',
    ),
    'P01: blocking party identity issue',
  )
  const good = rewriteParty(
    source,
    'party',
    'Klientem jest: Anna Testowa, zam. ul. Kwiatowa 12, 30-001 Kraków.',
  )
  const goodGate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: good,
    dataset: dataset(1),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(goodGate.downloadAllowed, 'P01: correct rewrite downloadable')
  assert(
    !goodGate.blocks.some((b) => /Marta Demo/i.test(b.text)),
    'P01: old client absent',
  )
  assert(
    goodGate.blocks.some((b) => /Anna Testowa/i.test(b.text)),
    'P01: canonical present',
  )
  console.log('PASS  P01: one old client nominative')
}

// ---- P02 declined Polish form ----
{
  const { source } = blocksFrom(
    surround(
      'Katarzyną Przykładową, zam. ul. Lipowa 3, 60-001 Poznań, tel. 500 111 222, zwaną dalej „Zamawiającym”,',
    ),
  )
  const evidence = discoverFilledPartyEvidence(source)
  assert(evidence.some((e) => e.blockId === 'party'), 'P02: declined party discovered')
  assert(
    evidence
      .find((e) => e.blockId === 'party')!
      .identitySurfaces.some((s) => /Katarzyn/i.test(s)),
    'P02: declined surface inventoried',
  )
  const stale = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: source.map((b) => ({ blockId: b.blockId, text: b.text })),
    dataset: dataset(1),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(!stale.downloadAllowed, 'P02: stale declined identity blocked')
  const good = rewriteParty(
    source,
    'party',
    'Anną Testową, zam. ul. Kwiatowa 12, 30-001 Kraków, tel. +48 500 100 200, zwaną dalej „Zamawiającym”,',
  )
  const goodGate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: good,
    dataset: dataset(1),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(goodGate.downloadAllowed, 'P02: declined rewrite OK')
  assert(
    !goodGate.blocks.some((b) => /Katarzyn/i.test(b.text)),
    'P02: Katarzyna absent',
  )
  console.log('PASS  P02: declined Polish form')
}

// ---- P03 two old clients ----
{
  const { source } = blocksFrom(
    surround('Klientami są: Marta Demo oraz Tomasz Demo, zam. ul. Kwiatowa 8, Kraków.'),
  )
  const good = rewriteParty(
    source,
    'party',
    'Klientami są: Anna Testowa oraz Jan Próbny, zam. ul. Kwiatowa 12, 30-001 Kraków.',
  )
  const gate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: good,
    dataset: dataset(2),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(gate.downloadAllowed, 'P03: two-person OK')
  assert(!gate.blocks.some((b) => /Marta Demo|Tomasz Demo/i.test(b.text)), 'P03: old absent')
  assert(
    gate.blocks.some((b) => /Anna Testowa/.test(b.text) && /Jan Próbny/.test(b.text)),
    'P03: both current',
  )
  console.log('PASS  P03: two old clients')
}

// ---- P04 two clients different surname forms ----
{
  const { source } = blocksFrom(
    surround(
      'z Anną Kowalską oraz Piotrem Nowakiem, zwanymi dalej „Zamawiającymi”.',
    ),
  )
  const good = rewriteParty(
    source,
    'party',
    'z Anną Testową oraz Janem Próbnym, zwanymi dalej „Zamawiającymi”.',
  )
  const gate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: good,
    dataset: dataset(2),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(gate.downloadAllowed, 'P04: mixed surnames OK')
  assert(
    !/Kowalsk|Piotrem Nowakiem|Piotra Nowaka/i.test(
      gate.blocks.find((b) => b.blockId === 'party')?.text ?? '',
    ),
    'P04: old surnames absent from party block',
  )
  console.log('PASS  P04: different surname forms')
}

// ---- P05 party details in table ----
{
  const { source, asIs } = blocksFrom([
    {
      id: 't-label',
      text: 'Zamawiający',
      kind: 'tableCell',
      tableContext: {
        tableIndex: 0,
        rowIndex: 0,
        cellIndex: 0,
        ownershipFamily: 'customer',
        rowLabelText: 'Zamawiający',
      },
    },
    {
      id: 't-name',
      text: 'Olga Próba',
      kind: 'tableCell',
      tableContext: {
        tableIndex: 0,
        rowIndex: 0,
        cellIndex: 1,
        ownershipFamily: 'customer',
        rowLabelText: 'Zamawiający',
      },
    },
    {
      id: 'provider',
      text: 'Studio X Sp. z o.o., NIP 1234567890, zwany dalej „Fotografem”.',
    },
    { id: 'money', text: 'Wynagrodzenie 11 200 zł.' },
  ])
  const evidence = discoverFilledPartyEvidence(source)
  assert(evidence.some((e) => e.blockId === 't-name'), 'P05: table party discovered')
  const preIssues = verifyFilledPartyIdentity({
    evidence,
    sourceBlocks: source,
    transformedBlocks: asIs,
    dataset: dataset(1),
  })
  assert(
    preIssues.some(
      (i) =>
        i.code === 'stale_party_identity_remaining' ||
        i.code === 'party_identity_canonical_missing',
    ),
    'P05: pre-repair stale identity detected',
  )
  // Exact table-cell name (whole block = name) may be repaired deterministically.
  const staleGate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: asIs,
    dataset: dataset(1),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(
    staleGate.blocks.some((b) => b.blockId === 't-name' && /Anna Testowa/.test(b.text)),
    'P05: table cell repaired to canonical name',
  )
  assert(
    !staleGate.blocks.some((b) => /Olga Próba/.test(b.text)),
    'P05: old table name absent after gate',
  )
  const good = source.map((b) =>
    b.blockId === 't-name'
      ? { blockId: b.blockId, text: 'Anna Testowa' }
      : { blockId: b.blockId, text: b.text },
  )
  const gate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: good,
    dataset: dataset(1),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(gate.downloadAllowed, 'P05: table rewrite OK')
  console.log('PASS  P05: party in table')
}

// ---- P06 address + phone in party clause ----
{
  const { source } = blocksFrom(
    surround(
      'Igor Samotny, zam. ul. Długa 9, 00-001 Warszawa, tel. 600 700 800, zwany dalej „Zamawiającym”.',
    ),
  )
  const good = rewriteParty(
    source,
    'party',
    'Anna Testowa, zam. ul. Kwiatowa 12, 30-001 Kraków, tel. +48 500 100 200, zwana dalej „Zamawiającym”.',
  )
  const gate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: good,
    dataset: dataset(1),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(gate.downloadAllowed, 'P06: address+phone OK')
  assert(!gate.blocks.some((b) => /Igor Samotny|600 700 800/i.test(b.text)), 'P06: old absent')
  console.log('PASS  P06: address + phone party clause')
}

// ---- P07 provider person name elsewhere — must NOT be treated as party / replaced ----
{
  const { source } = blocksFrom(
    surround(
      'Klientem jest: Marta Demo.',
      [
        {
          id: 'second',
          text:
            'Drugi operator: Marek Operatorowy prowadzi rejestrację równoległą na zlecenie Filmowca.',
        },
      ],
    ),
  )
  const evidence = discoverFilledPartyEvidence(source)
  assert(!evidence.some((e) => e.blockId === 'second'), 'P07: second shooter not party evidence')
  assert(!evidence.some((e) => e.blockId === 'provider'), 'P07: provider not party evidence')
  const good = rewriteParty(source, 'party', 'Klientem jest: Anna Testowa.')
  // Leave Marek Operatorowy untouched
  const gate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: good,
    dataset: dataset(1),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(gate.downloadAllowed, 'P07: download OK')
  assert(
    gate.blocks.some((b) => /Marek Operatorowy/.test(b.text)),
    'P07: provider person name preserved',
  )
  console.log('PASS  P07: provider person name not replaced')
}

// ---- P08 venue/person-like proper noun elsewhere ----
{
  const { source } = blocksFrom(
    surround(
      'Klientem jest: Marta Demo.',
      [
        {
          id: 'venue',
          text: 'Opiekę nad przygotowaniem stołu kwiatowego sprawuje Anna Rydzyńska z firmy Florystyka Nova.',
        },
      ],
    ),
  )
  const evidence = discoverFilledPartyEvidence(source)
  assert(!evidence.some((e) => e.blockId === 'venue'), 'P08: venue not party evidence')
  const good = rewriteParty(source, 'party', 'Klientem jest: Anna Testowa.')
  const gate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: good,
    dataset: dataset(1),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(gate.downloadAllowed, 'P08: OK')
  assert(
    gate.blocks.some((b) => /Anna Rydzyńska|Florystyka Nova/.test(b.text)),
    'P08: venue person preserved',
  )
  console.log('PASS  P08: venue/person-like noun preserved')
}

// ---- P09 old party name repeated in signature/client section ----
{
  const { source } = blocksFrom(
    surround('Klientem jest: Marta Demo, zwaną dalej „Zamawiającym”.', [
      { id: 'sig-name', text: 'Marta Demo                                      Wykonawca' },
    ]),
  )
  // Only rewrite grounded party block — signature still has stale name
  const partial = rewriteParty(
    source,
    'party',
    'Klientem jest: Anna Testowa, zwaną dalej „Zamawiającym”.',
  )
  // Signature block is NOT in evidence unless discovered; if not discovered, scoped gate
  // only checks evidence blocks. Discover signature if it looks like party? It doesn't
  // match CLIENT_PARTY_MARKER — so scoped invariant doesn't require signature scrub.
  // Product: scoped to identified party regions. Signature coherence is acceptance soft.
  const evidence = discoverFilledPartyEvidence(source)
  assert(evidence.every((e) => e.blockId === 'party'), 'P09: only party clause evidenced')
  const issues = verifyFilledPartyIdentity({
    evidence,
    sourceBlocks: source,
    transformedBlocks: partial,
    dataset: dataset(1),
  })
  assert(
    !issues.some((i) => i.code === 'stale_party_identity_remaining'),
    'P09: grounded party region clean',
  )
  // If signature were also evidenced, stale would block — simulate that path:
  const withSigEvidence = [
    ...evidence,
    {
      blockId: 'sig-name',
      sourceText: 'Marta Demo                                      Wykonawca',
      identitySurfaces: ['Marta Demo'],
    },
  ]
  const sigIssues = verifyFilledPartyIdentity({
    evidence: withSigEvidence,
    sourceBlocks: source,
    transformedBlocks: partial,
    dataset: dataset(1),
  })
  assert(
    sigIssues.some((i) => i.code === 'stale_party_identity_remaining'),
    'P09: identified signature region with stale identity would fail-closed',
  )
  console.log('PASS  P09: scoped signature stale identity')
}

// ---- P10 PLACEHOLDER_STRONY — CG4 path unchanged ----
{
  const { source } = blocksFrom([
    { id: 'p0', text: 'zawarta z PLACEHOLDER_STRONY.' },
    { id: 'p1', text: 'Wynagrodzenie wynosi 11 200 zł.' },
    { id: 'p2', text: 'Zadatek 2 800 zł.' },
    { id: 'sig', text: 'Podpisy stron' },
  ])
  const evidence = discoverFilledPartyEvidence(source)
  assert(evidence.length === 0, 'P10: placeholder not filled-party evidence')
  const gate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: source.map((b) => ({ blockId: b.blockId, text: b.text })),
    dataset: dataset(1),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(gate.downloadAllowed, 'P10: CG4 repair still allows download')
  assert(
    !gate.blocks.some((b) => b.text.includes('PLACEHOLDER_STRONY')),
    'P10: placeholder repaired',
  )
  assert(
    gate.blocks.some((b) => b.text.includes('Anna Testowa')),
    'P10: displayNames applied',
  )
  console.log('PASS  P10: PLACEHOLDER_STRONY CG4 unchanged')
}

// ---- Language / provider-role: party rewrite must not damage legal clauses ----
{
  const { source } = blocksFrom(
    surround(
      'Katarzyną Przykładową, zam. ul. Lipowa 3, zwaną dalej „Zamawiającym”,',
    ),
  )
  // Correct party rewrite; leave portfolio/copyright untouched (correct Polish)
  const good = rewriteParty(
    source,
    'party',
    'Anną Testową, zam. ul. Kwiatowa 12, zwaną dalej „Zamawiającym”,',
  )
  const gate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: good,
    dataset: dataset(1),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(gate.downloadAllowed, 'LANG: good party rewrite downloadable')
  assert(
    gate.blocks.some((b) => /portfolio Filmowca/.test(b.text)),
    'LANG: portfolio Filmowca preserved',
  )
  assert(
    gate.blocks.some((b) => /przysługują Filmowcowi/.test(b.text)),
    'LANG: przysługują Filmowcowi preserved',
  )
  assert(
    !gate.blocks.some((b) => /portfolio Filmowiec\b/.test(b.text)),
    'LANG: no portfolio Filmowiec damage',
  )
  assert(
    !gate.blocks.some((b) => /przysługują Filmowiec\b/.test(b.text)),
    'LANG: no przysługują Filmowiec damage',
  )

  // Simulate model damaging provider-role blocks unnecessarily → fail-closed
  const damaged = good.map((b) => {
    if (b.blockId === 'portfolio') {
      return {
        blockId: b.blockId,
        text: b.text.replace('Filmowca', 'Filmowiec'),
      }
    }
    if (b.blockId === 'copyright') {
      return {
        blockId: b.blockId,
        text: b.text.replace('Filmowcowi', 'Filmowiec'),
      }
    }
    return b
  })
  const scopeIssues = verifyProviderRoleSparseScope({
    sourceBlocks: source,
    transformedBlocks: damaged,
    partyEvidence: discoverFilledPartyEvidence(source),
  })
  assert(
    scopeIssues.some((i) => i.code === 'unnecessary_provider_role_rewrite'),
    'LANG: unnecessary provider-role rewrite blocked',
  )
  const damagedGate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: damaged,
    dataset: dataset(1),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(!damagedGate.downloadAllowed, 'LANG: damaged provider clauses fail-closed')
  console.log('PASS  LANG: provider-role sparse scope + U01 grammar regression')
}

// ---- Invented second partner ----
{
  const { source } = blocksFrom(
    surround(
      'Katarzyną Przykładową, zam. ul. Lipowa 3, zwaną dalej „Zamawiającym”,',
    ),
  )
  const invented = rewriteParty(
    source,
    'party',
    'Anną Testową oraz Janem Próbnym, zam. ul. Kwiatowa 12, zwanymi dalej „Zamawiającymi”.',
  )
  const gate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: invented,
    dataset: dataset(1),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(!gate.downloadAllowed, 'invented partner fail-closed')
  assert(
    gate.report.blockingIssues.some((i) => i.code === 'invented_second_party'),
    'invented_second_party code',
  )
  console.log('PASS  invented second partner blocked for one-person')
}

console.log('\nCG7.1 filled-party identity acceptance: ALL PASS')
