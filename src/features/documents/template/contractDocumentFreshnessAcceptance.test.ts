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
