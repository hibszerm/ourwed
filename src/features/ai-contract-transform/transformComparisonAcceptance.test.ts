/**
 * Transform comparison acceptance — Mode A warnings, Mode B blocking.
 * Run: npm run test:ai-contract-transform
 */

import { buildProtectedContractData } from './protectedContractData'
import { verifyGuardedTransformation } from './guardedVerifier'
import { buildModeADiagnostics } from './modeADiagnostics'
import { computeTextEdits } from './blockDiffEngine'
import { sanitizeTransformationDataset } from './transformationDataset'
import {
  SAMPLE_DATASET,
  fixtureK_allowedOnly,
  fixtureL_providerChanged,
  fixtureM_businessRewrite,
  fixtureN_reordered,
  fixtureO_added,
  fixtureP_removed,
  fixtureQ_localGrammar,
  fixtureR_sentenceRewrite,
  fixtureS_punctuation,
  fixtureSourceBlocks,
  fixtureT_unrelatedNumber,
} from './fixtures/transformFixtures'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

function main() {
  const source = fixtureSourceBlocks()
  const protectedData = buildProtectedContractData({
    blocks: source,
    blockTexts: source.map((b) => b.text),
    knownProviderValues: ['Studio Foto Test Sp. z o.o.'],
  })
  assert(protectedData.exactProtectedValues.length > 0, 'protected values found')

  const dataset = sanitizeTransformationDataset(SAMPLE_DATASET)
  assert(
    !('depositDueDate' in dataset.dates) ||
      Boolean(dataset.dates.depositDueDate),
    'no fake empty dates',
  )

  // Diff engine basics
  const edits = computeTextEdits('z Aleksandrą Biłas', 'z Anną Kowalską')
  assert(edits.length >= 1, 'diff produces edits')

  // Mode B — K safe
  const k = verifyGuardedTransformation({
    sourceBlocks: source,
    transformedBlocks: fixtureK_allowedOnly(source),
    dataset,
    protectedData,
  })
  assertEq(k.status, 'safe_to_generate', 'K safe_to_generate')

  // L blocked
  const l = verifyGuardedTransformation({
    sourceBlocks: source,
    transformedBlocks: fixtureL_providerChanged(source),
    dataset,
    protectedData,
  })
  assertEq(l.status, 'blocked', 'L blocked')

  // M blocked
  const m = verifyGuardedTransformation({
    sourceBlocks: source,
    transformedBlocks: fixtureM_businessRewrite(source),
    dataset,
    protectedData,
  })
  assertEq(m.status, 'blocked', 'M blocked')

  // N blocked
  const n = verifyGuardedTransformation({
    sourceBlocks: source,
    transformedBlocks: fixtureN_reordered(source),
    dataset,
    protectedData,
  })
  assertEq(n.status, 'blocked', 'N blocked')

  // O blocked
  const o = verifyGuardedTransformation({
    sourceBlocks: source,
    transformedBlocks: fixtureO_added(source),
    dataset,
    protectedData,
  })
  assertEq(o.status, 'blocked', 'O blocked')

  // P blocked
  const p = verifyGuardedTransformation({
    sourceBlocks: source,
    transformedBlocks: fixtureP_removed(source),
    dataset,
    protectedData,
  })
  assertEq(p.status, 'blocked', 'P blocked')

  // Q safe or review
  const q = verifyGuardedTransformation({
    sourceBlocks: source,
    transformedBlocks: fixtureQ_localGrammar(source),
    dataset,
    protectedData,
  })
  assert(
    q.status === 'safe_to_generate' || q.status === 'review_required',
    `Q status was ${q.status}`,
  )

  // R review or blocked
  const r = verifyGuardedTransformation({
    sourceBlocks: source,
    transformedBlocks: fixtureR_sentenceRewrite(source),
    dataset,
    protectedData,
  })
  assert(
    r.status === 'review_required' || r.status === 'blocked',
    `R status was ${r.status}`,
  )

  // S safe
  const s = verifyGuardedTransformation({
    sourceBlocks: source,
    transformedBlocks: fixtureS_punctuation(source),
    dataset,
    protectedData,
  })
  assertEq(s.status, 'safe_to_generate', 'S safe_to_generate')

  // T blocked
  const t = verifyGuardedTransformation({
    sourceBlocks: source,
    transformedBlocks: fixtureT_unrelatedNumber(source),
    dataset,
    protectedData,
  })
  assertEq(t.status, 'blocked', 'T blocked')

  // Mode A — warnings never block; diagnostics present for L–T
  for (const [label, transformed] of [
    ['L', fixtureL_providerChanged(source)],
    ['T', fixtureT_unrelatedNumber(source)],
    ['N', fixtureN_reordered(source)],
  ] as const) {
    const { diagnostics } = buildModeADiagnostics({
      sourceBlocks: source,
      transformedBlocks: transformed,
      dataset,
      protectedData,
    })
    assert(diagnostics.warnings.length > 0, `Mode A warnings for ${label}`)
    // Never claim safe/verified in warning strings
    assert(
      !diagnostics.warnings.some((w) => /bezpieczn|zweryfikowan/i.test(w)),
      'Mode A must not claim safe/verified',
    )
  }

  console.log('ok — ai-contract-transform acceptance')
}

main()
