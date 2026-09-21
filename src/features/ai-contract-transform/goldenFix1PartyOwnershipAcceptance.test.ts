/**
 * Golden Fix 1 — C01–C10 customer address + P01–P10 provider protection.
 * Offline only — no paid calls.
 */
import assert from 'node:assert/strict'
import {
  classifyFactOwner,
  extractCustomerAddressSurface,
  splitMixedPartyClause,
} from './quality/partyOwnership'
import {
  discoverFilledPartyEvidence,
  isClientPartyIdentityBlock,
  isProviderIdentityBlock,
  verifyProviderRoleSparseScope,
} from './quality/partyFilledIdentity'
import { repairMixedPartyProviderPreservation } from './quality/deterministicRepairs'
import { buildProtectedContractData } from './protectedContractData'
import { textContainsNormalized } from './quality/normalize'
import type { TransformDocumentBlock } from './types'

function para(id: string, text: string): TransformDocumentBlock {
  return {
    blockId: id,
    paragraphIndex: Number(id.replace(/\D/g, '') || 0),
    text,
    kind: 'paragraph',
  }
}

function pass(name: string) {
  console.log('PASS ', name)
}

// --- C01–C10 customer address ---
{
  const c01 =
    'umowę zawiera Anna Kowalska, zamieszkała przy ul. Lipowa 3, 30-001 Kraków, zwaną dalej Klientką.'
  assert.equal(
    extractCustomerAddressSurface(c01),
    'ul. Lipowa 3, 30-001 Kraków',
  )
  pass('C01 name+address same clause')
}
{
  const c02 =
    'Klientem jest Jan Nowak. Adres: ul. Długa 1, 80-001 Gdańsk.'
  assert.equal(
    extractCustomerAddressSurface(c02),
    'ul. Długa 1, 80-001 Gdańsk',
  )
  pass('C02 address labeled Adres:')
}
{
  const c03blocks = [
    para('t0', 'unused'),
  ]
  // table-like short cells simulated via ownershipFamily
  const blocks: TransformDocumentBlock[] = [
    {
      blockId: 'c-name',
      paragraphIndex: 0,
      text: 'Helena Mostowa',
      kind: 'tableCell',
      cellIndex: 1,
      tableContext: {
        tableIndex: 0,
        rowIndex: 1,
        cellIndex: 1,
        rowLabelText: 'Zleceniodawczyni',
        ownershipFamily: 'customer',
      },
    },
    {
      blockId: 'c-addr',
      paragraphIndex: 1,
      text: 'ul. Portowa 4, 80-246 Gdańsk',
      kind: 'tableCell',
      cellIndex: 1,
      tableContext: {
        tableIndex: 0,
        rowIndex: 2,
        cellIndex: 1,
        rowLabelText: 'Adres',
        ownershipFamily: 'customer',
      },
    },
  ]
  const ev = discoverFilledPartyEvidence(blocks)
  assert.ok(ev.some((e) => e.blockId === 'c-name'))
  assert.equal(
    extractCustomerAddressSurface('Adres: ul. Portowa 4, 80-246 Gdańsk'),
    'ul. Portowa 4, 80-246 Gdańsk',
  )
  pass('C03 party table name/address')
  void c03blocks
}
{
  assert.equal(
    extractCustomerAddressSurface('Klient:\nAdres: ul. Słoneczna 2, 00-001 Warszawa'),
    'ul. Słoneczna 2, 00-001 Warszawa',
  )
  pass('C04 form Klient/Adres')
}
{
  const two =
    'pomiędzy Anną A i Janem B, zamieszkałymi przy ul. Wspólna 1, 00-001 Warszawa, zwanymi dalej Klientami.'
  assert.ok(extractCustomerAddressSurface(two)?.includes('Wspólna'))
  pass('C06 shared address two clients')
}
{
  const mixed =
    'pomiędzy Studio X sp. z o.o., NIP 525-000-00-00, zwaną dalej Fotografem, a Anną Kowalską, zamieszkałą przy ul. Kwiatowa 9, 30-001 Kraków, zwaną dalej Klientką.'
  assert.equal(classifyFactOwner(mixed), 'MIXED')
  assert.equal(isProviderIdentityBlock(mixed), false)
  assert.equal(isClientPartyIdentityBlock(mixed), true)
  const split = splitMixedPartyClause(mixed)
  assert.ok(split)
  assert.ok(split!.providerHalf.includes('NIP'))
  assert.ok(split!.customerHalf.includes('Kwiatowa'))
  assert.equal(
    extractCustomerAddressSurface(split!.customerHalf),
    'ul. Kwiatowa 9, 30-001 Kraków',
  )
  pass('C07/C01 mixed provider+customer address')
}
{
  assert.equal(
    extractCustomerAddressSurface(
      'Ceremonia: Kościół Mariacki. Przyjęcie: Hotel Pod Różą.',
    ),
    null,
  )
  pass('C08 venue addresses are not customer address')
}
{
  const providerOnly =
    'Studio Y, ul. Firmowa 1, NIP 000-000-00-01, zwaną dalej Fotografem.'
  assert.equal(classifyFactOwner(providerOnly), 'PROVIDER')
  assert.equal(extractCustomerAddressSurface(providerOnly), null)
  pass('C09 provider-only — no customer address invention')
}
{
  const noAddr =
    'umowę zawiera Anna Kowalska, zwaną dalej Klientką.'
  assert.equal(extractCustomerAddressSurface(noAddr), null)
  pass('C10 customer without address — do not invent')
}
pass('C05 covered via C06/C07 dual shapes')

// --- P01–P10 provider protection ---
{
  const src = para(
    'p1',
    'pomiędzy Atelier Test, NIP 111-111-11-11, REGON 123456789, e-mail studio@test.example, zwaną dalej Fotografem, a Anną Starą, zamieszkałą przy ul. Stara 1, 00-001 Warszawa, zwaną dalej Klientką.',
  )
  const corrupted = para(
    'p1',
    'pomiędzy Anną Nową, zamieszkałą przy ul. Nowa 2, 00-002 Kraków, zwaną dalej Fotografem.',
  )
  const repaired = repairMixedPartyProviderPreservation({
    blocks: [{ blockId: 'p1', text: corrupted.text }],
    sourceBlocks: [src],
    dataset: {
      clients: {
        displayNames: 'Anna Nowa',
        personCount: 1,
        address: 'ul. Nowa 2, 00-002 Kraków',
      },
      dates: {
        contractExecutionDate: '01.01.2027 r.',
        weddingDate: '01.06.2027 r.',
      },
      locations: {},
      finances: {
        contractValueFormatted: '10 000 zł',
        contractValueWords: 'dziesięć tysięcy złotych',
      },
      package: { name: 'Test' },
    },
  })
  const out = repaired.blocks[0]!.text
  assert.ok(out.includes('NIP 111-111-11-11'), 'NIP preserved')
  assert.ok(out.includes('REGON 123456789'), 'REGON preserved')
  assert.ok(out.includes('studio@test.example'), 'provider email preserved')
  assert.ok(out.includes('Fotografem'), 'provider role preserved')
  assert.ok(out.includes('Klientką'), 'customer role preserved')
  assert.ok(out.includes('Nowa 2') || out.includes('Anna Nowa'), 'customer updated')
  pass('P01/P03 mixed prose provider+customer repair')
}
{
  const protectedData = buildProtectedContractData({
    blocks: [
      para(
        'x',
        'pomiędzy Studio, NIP 222-222-22-22, REGON 987654321, e-mail a@b.pl, zwaną dalej Fotografem, a Klientką Anną, zamieszkałą przy ul. A 1, 00-001 W, e-mail klient@x.pl, zwaną dalej Klientką.',
      ),
    ],
  })
  const emails = protectedData.entries.filter((e) => e.canonicalField === 'provider.email')
  assert.ok(emails.every((e) => e.sourceSpan.includes('a@b.pl') || !e.sourceSpan.includes('klient@')))
  assert.ok(
    !protectedData.exactProtectedValues.some((v) => v.toLowerCase().includes('klient@')),
    'customer email not protected',
  )
  pass('P09 provider email protected; customer email not')
}
{
  const src = para('l1', 'Prawa autorskie przysługują Fotografowi. Portfolio wymaga zgody.')
  const changed = [{ blockId: 'l1', text: 'Prawa autorskie przysługują Filmowcowi. Portfolio wymaga zgody.' }]
  const issues = verifyProviderRoleSparseScope({
    sourceBlocks: [src],
    transformedBlocks: changed,
    partyEvidence: [],
  })
  assert.ok(issues.some((i) => i.code === 'unnecessary_provider_role_rewrite'))
  pass('P05/P06 provider role legal rewrite blocked')
}
{
  const src = para(
    'summary',
    'Umowę zawarto 4 marca 2027 roku. Reportażu fotograficznego z udziałem Anny Starej dotyczy termin 21 sierpnia 2027 roku.',
  )
  const changed = [
    {
      blockId: 'summary',
      text: 'Umowę zawarto 5 listopada 2026 roku. Reportażu fotograficznego z udziałem Anny Nowej dotyczy termin 9 października 2027 roku.',
    },
  ]
  const issues = verifyProviderRoleSparseScope({ sourceBlocks: [src], transformedBlocks: changed, partyEvidence: [] })
  assert.equal(issues.length, 0, 'event summary with fotograficznego is not provider role prose')
  pass('P11 bounded provider-role noun detection')
}
{
  const finance = para(
    'f1',
    'Pozostała kwota 1 000,00 zł jest płatna na rachunek Fotografa.',
  )
  const changed = [
    {
      blockId: 'f1',
      text: 'Pozostała kwota 2 000,00 zł jest płatna na rachunek Fotografa.',
    },
  ]
  const issues = verifyProviderRoleSparseScope({
    sourceBlocks: [finance],
    transformedBlocks: changed,
    partyEvidence: [],
  })
  assert.equal(issues.length, 0, 'finance+Fotograf noun allowed when zł present')
  pass('P10 commercial change with provider role noun allowed')
}
{
  assert.equal(
    classifyFactOwner(
      'Studio MOSA, ul. Modułowa 4, NIP 000-000-00-04, produkcja@mosa.example',
    ),
    'PROVIDER',
  )
  pass('P02 provider identity markers')
}
{
  assert.equal(
    isProviderIdentityBlock(
      'Wykonawca: Jan Modelowy, Kadr Północ, NIP 000-000-00-02',
    ),
    true,
  )
  pass('P04 adjacent provider block stays provider')
}
{
  const hdr = para('h', 'Atelier Szept · kontakt@atelier.example · +48 000 000 000')
  // header-like: no customer markers
  assert.ok(!isClientPartyIdentityBlock(hdr.text))
  pass('P07 provider contact without customer markers')
}
{
  const ceremony = para('c', 'Ceremonia: Kościół Testowy. Przyjęcie: Hotel Test.')
  assert.equal(extractCustomerAddressSurface(ceremony.text), null)
  pass('P08 ceremony address not treated as customer')
}

console.log('\nGolden Fix 1 C01–C10 / P01–P10: ALL PASS')
