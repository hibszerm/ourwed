/**
 * Limited deterministic post-AI repairs (recorded, never silent).
 */

import { polishContractMoneyWords } from '../polishContractMoneyWords'
import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from '../types'
import { fingerprintText, sanitizeDuplicatedLocationWrappers } from './normalize'
import type {
  DeterministicRepair,
  RequiredReplacement,
  TransformationExpectationManifest,
} from './types'

function parsePlnAmount(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null
  return Number(digits)
}

function wordsForAmount(
  amount: number,
  finances: ContractTransformationDataset['finances'],
): string | null {
  const total = parsePlnAmount(finances.contractValueFormatted)
  const deposit = finances.depositFormatted
    ? parsePlnAmount(finances.depositFormatted)
    : null
  const remaining = finances.remainingFormatted
    ? parsePlnAmount(finances.remainingFormatted)
    : null

  if (deposit != null && amount === deposit) {
    return finances.depositWords ?? polishContractMoneyWords(amount)
  }
  if (remaining != null && amount === remaining) {
    return finances.remainingWords ?? polishContractMoneyWords(amount)
  }
  if (total != null && amount === total) {
    return finances.contractValueWords ?? polishContractMoneyWords(amount)
  }
  // Unknown amount near słownie — still convert deterministically; never use total
  return polishContractMoneyWords(amount)
}

/**
 * Pair each "(słownie: …)" clause with the nearest preceding PLN amount
 * and insert the matching deterministic words — never reuse total for all.
 */
export function repairMoneyWordsInText(
  text: string,
  finances: ContractTransformationDataset['finances'],
): string {
  if (!/słownie/i.test(text)) return text
  return text.replace(
    /(\d[\d\s\u00a0]*\s*zł(?:otych|ote|oty)?)([\s\S]{0,100}?)\(\s*słownie:\s*([^).]+)\)/gi,
    (full, amountWithCurrency: string, between: string, _oldWords: string) => {
      const amount = parsePlnAmount(amountWithCurrency)
      if (amount == null) return full
      const expected = wordsForAmount(amount, finances)
      if (!expected) return full
      return `${amountWithCurrency}${between}(słownie: ${expected})`
    },
  )
}

/**
 * Apply only unambiguous, one-to-one repairs.
 * Does not rewrite legal sentences, package scope, or payment obligations.
 */
export function applyDeterministicRepairs(input: {
  blocks: TransformedBlock[]
  dataset: ContractTransformationDataset
  manifest: TransformationExpectationManifest
  sourceBlocks: TransformDocumentBlock[]
}): { blocks: TransformedBlock[]; repairs: DeterministicRepair[] } {
  const repairs: DeterministicRepair[] = []
  let blocks = input.blocks.map((b) => ({ ...b }))

  // 1. Sanitize duplicated location wrappers everywhere
  blocks = blocks.map((b) => {
    const next = sanitizeDuplicatedLocationWrappers(b.text)
    if (next !== b.text) {
      repairs.push({
        repairCode: 'sanitize_duplicated_location_wrapper',
        blockId: b.blockId,
        beforeFingerprint: fingerprintText(b.text),
        afterFingerprint: fingerprintText(next),
      })
      return { ...b, text: next }
    }
    return b
  })

  // 2. Normalize money words — each amount owns its own words
  blocks = blocks.map((b) => {
    if (!/słownie/i.test(b.text)) return b
    const replaced = repairMoneyWordsInText(b.text, input.dataset.finances)
    if (replaced === b.text) return b
    repairs.push({
      repairCode: 'insert_deterministic_money_words',
      blockId: b.blockId,
      canonicalField: 'contract.totalPriceWords',
      beforeFingerprint: fingerprintText(b.text),
      afterFingerprint: fingerprintText(replaced),
    })
    return { ...b, text: replaced }
  })

  // 3. One-to-one exact stale → target in required contexts (unambiguous only)
  for (const rep of input.manifest.requiredReplacements) {
    if (rep.sourceValues.length !== 1 || rep.targetRenderedValues.length !== 1)
      continue
    if (
      rep.canonicalField === 'contract.paymentStructure' ||
      rep.canonicalField === 'package.serviceScope'
    ) {
      continue
    }
    const sourceVal = rep.sourceValues[0]!
    const targetVal = rep.targetRenderedValues[0]!
    if (!sourceVal || !targetVal || sourceVal === targetVal) continue
    // Ambiguous if source value appears in multiple unrelated fields
    const otherUses = input.manifest.requiredReplacements.filter(
      (r) =>
        r.canonicalField !== rep.canonicalField &&
        r.sourceValues.includes(sourceVal),
    )
    if (otherUses.length > 0) continue

    for (const blockId of rep.requiredContextBlockIds) {
      const idx = blocks.findIndex((b) => b.blockId === blockId)
      if (idx < 0) continue
      const b = blocks[idx]!
      if (!b.text.includes(sourceVal)) continue
      // Exact one occurrence preferred
      const count = b.text.split(sourceVal).length - 1
      if (count !== 1) continue
      const next = b.text.replace(sourceVal, targetVal)
      repairs.push({
        repairCode: 'exact_stale_to_target_in_context',
        blockId,
        canonicalField: rep.canonicalField,
        beforeFingerprint: fingerprintText(b.text),
        afterFingerprint: fingerprintText(next),
      })
      blocks[idx] = { ...b, text: next }
    }
  }

  void input.sourceBlocks
  return { blocks, repairs }
}

export function summarizeRequiredReplacementsForPrompt(
  replacements: RequiredReplacement[],
): RequiredReplacement[] {
  // Cap size for payload — keep full structure, limit list length
  return replacements.slice(0, 40)
}
