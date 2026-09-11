/**
 * Contract document freshness acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/contractDocumentFreshnessAcceptance.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CONTRACT_FRESHNESS_COPY,
  diffContractResolvedValuesForFreshness,
  isGeneratedContractContentStale,
  parseContractArtifactSnapshot,
  shouldExcludeContractFreshnessKey,
} from './contractDocumentFreshness'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

{
  const snap = parseContractArtifactSnapshot({
    kind: 'generated_wedding_contract',
    provenance: {
      replacement: {
        resolvedValues: { partner1_full_name: 'Anna' },
        omittedKeys: [],
      },
    },
  })
  assert.ok(snap)
  assert.equal(
    parseContractArtifactSnapshot({ kind: 'other' }),
    null,
    'rejects non-contract snapshots',
  )
}

{
  const same = diffContractResolvedValuesForFreshness(
    { partner1_full_name: 'Anna Kowalska', contract_value: '5000' },
    { partner1_full_name: 'Anna Kowalska', contract_value: '5000' },
  )
  assert.equal(same.stale, false)
}

{
  const name = diffContractResolvedValuesForFreshness(
    { partner1_full_name: 'Anna Kowalska' },
    { partner1_full_name: 'Anna Nowak' },
  )
  assert.equal(name.stale, true)
  assert.ok(name.changedKeys.includes('partner1_full_name'))
}

{
  const cv = diffContractResolvedValuesForFreshness(
    { contract_value: '5000' },
    { contract_value: '6000' },
  )
  assert.equal(cv.stale, true)
}

{
  const deposit = diffContractResolvedValuesForFreshness(
    { agreed_deposit: '1000' },
    { agreed_deposit: '1500' },
  )
  assert.equal(deposit.stale, true)
}

{
  const travel = diffContractResolvedValuesForFreshness(
    { travel_fee: '800' },
    { travel_fee: '0' },
  )
  assert.equal(travel.stale, true)
}

{
  // Payment ledger alone must not stale
  const paid = diffContractResolvedValuesForFreshness(
    { total_paid: '0', partner1_full_name: 'Anna' },
    { total_paid: '1000', partner1_full_name: 'Anna' },
  )
  assert.equal(paid.stale, false, 'total_paid excluded')
  assert.equal(shouldExcludeContractFreshnessKey('total_paid'), true)
  assert.equal(
    shouldExcludeContractFreshnessKey('contract_execution_date'),
    true,
  )
}

{
  assert.equal(
    isGeneratedContractContentStale({
      storedResolvedValues: null,
      currentResolvedValues: { a: '1' },
    }),
    false,
    'legacy/empty snapshot → not falsely stale',
  )
}

{
  // Empty generation bag (historical sparse) vs full live resolve is always stale.
  assert.equal(
    isGeneratedContractContentStale({
      storedResolvedValues: {},
      currentResolvedValues: {
        partner1_full_name: 'Anna',
        contract_value: '5000',
      },
    }),
    true,
    'empty stored vs populated current → stale (sparse bug shape)',
  )
  assert.equal(
    isGeneratedContractContentStale({
      storedResolvedValues: {
        partner1_full_name: 'Anna',
        contract_value: '5000',
      },
      currentResolvedValues: {
        partner1_full_name: 'Anna',
        contract_value: '5000',
      },
    }),
    false,
    'matching bags after regenerate → fresh',
  )
}

{
  // Julia / production defect: company signature is a signed Storage URL whose
  // JWT token rotates on every resolveContractVariables call. Same object path
  // must remain FRESH after regenerate+save.
  const objectPath =
    'https://xyycwllsovpxlcustpcv.supabase.co/storage/v1/object/sign/document-files/user/company/signature-1.png'
  const sig = diffContractResolvedValuesForFreshness(
    {
      company_signature: `${objectPath}?token=aaa.bbb.ccc`,
      partner1_full_name: 'Julia Kanicka',
    },
    {
      company_signature: `${objectPath}?token=ddd.eee.fff`,
      partner1_full_name: 'Julia Kanicka',
    },
  )
  assert.equal(sig.stale, false, 'signed signature URL token rotate ≠ stale')
  assert.equal(
    diffContractResolvedValuesForFreshness(
      { company_signature: `${objectPath}?token=aaa` },
      {
        company_signature:
          'https://xyycwllsovpxlcustpcv.supabase.co/storage/v1/object/sign/document-files/user/company/signature-2.png?token=bbb',
      },
    ).stale,
    true,
    'new signature object path → stale',
  )
}

{
  // Ledger aliases (camelCase / dotted) must stay excluded like snake_case.
  const aliases = diffContractResolvedValuesForFreshness(
    {
      totalPaid: '1000',
      remainingToPay: '11200',
      'payments.totalPaid': '1000',
      'package.totalPaidFormatted': '1 000 zł',
      'package.remainingToPayFormatted': '11 200 zł',
      partner1_full_name: 'Julia',
    },
    {
      totalPaid: '0',
      remainingToPay: '12200',
      'payments.totalPaid': '0',
      'package.totalPaidFormatted': '0 zł',
      'package.remainingToPayFormatted': '12 200 zł',
      partner1_full_name: 'Julia',
    },
  )
  assert.equal(aliases.stale, false, 'payment ledger aliases excluded')
  assert.equal(shouldExcludeContractFreshnessKey('totalPaid'), true)
  assert.equal(shouldExcludeContractFreshnessKey('remainingToPay'), true)
  assert.equal(shouldExcludeContractFreshnessKey('payments.totalPaid'), true)
}


{
  const sparse = read(
    'src/features/documents/template/WeddingSparseContractGenerationService.ts',
  )
  const save = read('src/features/documents/template/saveGeneratedContract.ts')
  assert.ok(
    sparse.includes('resolveContractVariables'),
    'sparse generation resolves variables for freshness snapshot',
  )
  assert.ok(
    !sparse.includes('resolved: {}'),
    'sparse must not persist an empty resolved bag',
  )
  assert.ok(
    save.includes('Object.keys(resolvedValues).length === 0'),
    'save fills empty resolvedValues before persist',
  )
}

{
  const workspace = read(
    'src/features/weddings/modern-detail/ModernWeddingContractFinanceWorkspace.tsx',
  )
  assert.ok(
    workspace.includes('CONTRACT_FRESHNESS_COPY'),
    'workspace uses freshness copy',
  )
  assert.ok(
    workspace.includes('isGeneratedContractContentStale') ||
      workspace.includes('contractDocumentFreshness'),
    'workspace wires freshness',
  )
  assert.ok(
    workspace.includes(CONTRACT_FRESHNESS_COPY.title) ||
      workspace.includes('CONTRACT_FRESHNESS_COPY.title'),
    'title copy referenced',
  )
}

console.log('contractDocumentFreshnessAcceptance: ok')
