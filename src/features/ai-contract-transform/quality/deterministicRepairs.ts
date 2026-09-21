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
import { repairCanonicalPaymentAmounts } from './paymentAmountRepair'
import { repairCanonicalPartyPlaceholders } from './partyPlaceholderRepair'
import { applyCanonicalExecutionDate } from './dateFieldEvidence'
import {
  applyIntraParagraphLocationTargets,
  extractIntraParagraphLocationSlots,
} from './locationFieldEvidence'
import { renderCustomerAddress } from './locationRendering'
import {
  classifyFactOwner,
  extractCustomerAddressSurface,
  splitMixedPartyClause,
} from './partyOwnership'
import { canonicalPartyIdentityTargets } from './partyFilledIdentity'
import {
  PLN_AMOUNT_SURFACE_RE_ONCE,
  parsePlnAmountInteger,
} from './plnAmountSurface'
import {
  repairRepeatedFactSurfaces,
  type SourceRepeatedFactEvidence,
} from './repeatedFactEvidence'
import type {
  DeterministicRepair,
  RequiredReplacement,
  TransformationExpectationManifest,
} from './types'

function extractNeedsMultiSlot(
  text: string,
  evs: Array<{ role: string; sourceText: string }>,
): boolean {
  if (evs.some((e) => e.sourceText.includes(':') && text.includes(e.sourceText.split(':')[0]!.slice(0, 20)))) {
    return extractIntraParagraphLocationSlots(text).length >= 2
  }
  return extractIntraParagraphLocationSlots(text).length >= 2
}

function parsePlnAmount(raw: string): number | null {
  return parsePlnAmountInteger(raw)
}

const MONEY_AMOUNT_FIELDS = new Set([
  'contract.totalPrice',
  'contract.totalPriceWords',
  'contract.depositAmount',
  'contract.remainingAmount',
])

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
 * MIXED party clause: keep SOURCE provider half byte-stable; rewrite only the
 * customer half with canonical name/address when the model mutated provider identity.
 */
export function repairMixedPartyProviderPreservation(input: {
  blocks: TransformedBlock[]
  sourceBlocks: TransformDocumentBlock[]
  dataset: ContractTransformationDataset
}): { blocks: TransformedBlock[]; repairs: DeterministicRepair[] } {
  const repairs: DeterministicRepair[] = []
  const blocks = input.blocks.map((b) => ({ ...b }))
  const display = input.dataset.clients.displayNames?.trim() ?? ''
  const address = input.dataset.clients.address
    ? renderCustomerAddress(input.dataset.clients.address)
    : ''

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    const src = input.sourceBlocks.find((s) => s.blockId === block.blockId)
    if (!src) continue
    if (classifyFactOwner(src.text) !== 'MIXED') continue
    const split = splitMixedPartyClause(src.text)
    if (!split) continue

    const modelSplit = splitMixedPartyClause(block.text)
    const providerPreserved =
      modelSplit != null && modelSplit.providerHalf === split.providerHalf

    if (providerPreserved && modelSplit) {
      // Provider half intact — ensure canonical address in customer half if needed
      let customerHalf = modelSplit.customerHalf
      const staleAddr = extractCustomerAddressSurface(customerHalf)
      if (address && staleAddr && staleAddr !== address) {
        customerHalf = customerHalf.replace(staleAddr, address)
      } else if (
        address &&
        !customerHalf.includes(address) &&
        staleAddr
      ) {
        customerHalf = customerHalf.replace(staleAddr, address)
      }
      const next = `${split.providerHalf}${split.separator}${customerHalf}`.trim()
      if (next !== block.text) {
        repairs.push({
          repairCode: 'preserve_mixed_party_provider_half',
          blockId: block.blockId,
          canonicalField: 'customer.address',
          beforeFingerprint: fingerprintText(block.text),
          afterFingerprint: fingerprintText(next),
        })
        blocks[i] = { ...block, text: next }
      }
      continue
    }

    // Provider half corrupted / role-swapped — rebuild from SOURCE provider + repaired customer
    let customerHalf = split.customerHalf
    const staleAddr = extractCustomerAddressSurface(customerHalf)
    if (staleAddr && address) {
      customerHalf = customerHalf.replace(staleAddr, address)
    }
    const namePairs = customerHalf.match(
      /[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+/g,
    )
    if (display && namePairs?.[0] && !customerHalf.includes(display)) {
      customerHalf = customerHalf.replace(namePairs[0], display)
    }
    // Strip customer e-mail when local-part embeds the OLD given name (stale identity)
    if (namePairs?.[0]) {
      const given = namePairs[0].split(/\s+/)[0] ?? ''
      if (given.length >= 4) {
        const stem = given
          .normalize('NFD')
          .replace(/\p{M}/gu, '')
          .slice(0, 5)
          .toLowerCase()
        customerHalf = customerHalf.replace(
          /,\s*e-mail\s+[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
          (clause) =>
            clause.toLowerCase().includes(stem) ? '' : clause,
        )
      }
    }
    // Ensure single customer role close
    if (!/zwan[a-ząćęłńóśźż]*\s+dalej\s+[„"]?Klient/i.test(customerHalf)) {
      customerHalf = `${customerHalf.replace(/\.\s*$/, '')}, zwaną dalej Klientką.`
    }
    customerHalf = customerHalf.replace(
      /(zwan[a-ząćęłńóśźż]*\s+dalej\s+[„"]?Klient[a-ząćęłńóśźż]*)(?:\s*,\s*zwan[a-ząćęłńóśźż]*\s+dalej\s+[„"]?Klient[a-ząćęłńóśźż]*)+/gi,
      '$1',
    )

    const next = `${split.providerHalf}${split.separator}${customerHalf}`
      .replace(/\s+/g, ' ')
      .trim()
    if (next === block.text) continue
    repairs.push({
      repairCode: 'preserve_mixed_party_provider_half',
      blockId: block.blockId,
      canonicalField: 'customer.names',
      beforeFingerprint: fingerprintText(block.text),
      afterFingerprint: fingerprintText(next),
    })
    blocks[i] = { ...block, text: next }
  }

  // Restore corrupted signature / closing labels (never customer-writable)
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    const src = input.sourceBlocks.find((s) => s.blockId === block.blockId)
    if (!src || src.text === block.text) continue
    if (!/data i czytelny podpis|—\s*data i czytelny/i.test(src.text)) continue
    repairs.push({
      repairCode: 'restore_signature_label',
      blockId: block.blockId,
      beforeFingerprint: fingerprintText(block.text),
      afterFingerprint: fingerprintText(src.text),
    })
    blocks[i] = { ...block, text: src.text }
  }

  // Signature name cells above Klient/Para labels: replace stale printed name
  if (display) {
    for (const src of input.sourceBlocks) {
      if (src.kind !== 'tableCell') continue
      if (/data i czytelny podpis|Fotograf|Wykonawc|Usługodawc|Realizatork/i.test(src.text)) {
        continue
      }
      if (src.text.trim().split(/\s+/).length > 5) continue
      const below = input.sourceBlocks.find(
        (b) =>
          b.tableContext?.tableIndex === src.tableContext?.tableIndex &&
          b.tableContext?.cellIndex === src.tableContext?.cellIndex &&
          b.tableContext?.rowIndex === (src.tableContext?.rowIndex ?? -1) + 1 &&
          /Klient|Zamawiając|Para/i.test(b.text) &&
          !/Fotograf|Wykonawc|Usługodawc|Realizatork/i.test(b.text),
      )
      if (!below) continue
      const idx = blocks.findIndex((b) => b.blockId === src.blockId)
      if (idx < 0) continue
      const cur = blocks[idx]!
      if (cur.text.includes(display)) continue
      if (!/[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+/.test(cur.text)) continue
      repairs.push({
        repairCode: 'exact_stale_to_target_in_context',
        blockId: cur.blockId,
        canonicalField: 'customer.names',
        beforeFingerprint: fingerprintText(cur.text),
        afterFingerprint: fingerprintText(display),
      })
      blocks[idx] = { ...cur, text: display }
    }
  }

  return { blocks, repairs }
}

/**
 * Repair separate, represented customer table identity cells as one atomic
 * surface set. Contact/address cells are intentionally absent from party
 * evidence and are never rewritten as names.
 */
function repairStructuredPartyIdentityCells(input: {
  blocks: TransformedBlock[]
  sourceBlocks: TransformDocumentBlock[]
  manifest: TransformationExpectationManifest
  dataset: ContractTransformationDataset
}): { blocks: TransformedBlock[]; repairs: DeterministicRepair[] } {
  const evidence = input.manifest.sourcePartyEvidence ?? []
  const targets = canonicalPartyIdentityTargets({
    evidence,
    sourceBlocks: input.sourceBlocks,
    dataset: input.dataset,
  })
  const blocks = input.blocks.map((b) => ({ ...b }))
  const repairs: DeterministicRepair[] = []

  for (const ev of evidence) {
    const source = input.sourceBlocks.find((b) => b.blockId === ev.blockId)
    if (!source?.tableContext || source.kind !== 'tableCell') continue
    const target = targets.get(ev.blockId)
    if (!target) continue
    const index = blocks.findIndex((b) => b.blockId === ev.blockId)
    if (index < 0) continue
    const current = blocks[index]!
    if (current.text.includes(target)) continue
    const sourceName = ev.identitySurfaces.find(
      (surface) => current.text.includes(surface),
    )
    if (!sourceName || current.text.split(sourceName).length !== 2) continue
    const next = current.text.replace(sourceName, target)
    repairs.push({
      repairCode: 'repair_structured_party_identity_cell',
      blockId: current.blockId,
      canonicalField: 'customer.names',
      beforeFingerprint: fingerprintText(current.text),
      afterFingerprint: fingerprintText(next),
    })
    blocks[index] = { ...current, text: next }
  }

  return { blocks, repairs }
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
  // Parenthesized form: (słownie: …)
  const pairRe = new RegExp(
    `(${PLN_AMOUNT_SURFACE_RE_ONCE.source})([\\s\\S]{0,100}?)\\(\\s*słownie:\\s*([^).]+)\\)`,
    'gi',
  )
  let out = text.replace(
    pairRe,
    (full, amountWithCurrency: string, between: string) => {
      const amount = parsePlnAmount(amountWithCurrency)
      if (amount == null) return full
      const expected = wordsForAmount(amount, finances)
      if (!expected) return full
      return `${amountWithCurrency}${between}(słownie: ${expected})`
    },
  )
  // Bare form: słownie: … (optionally with trailing 00/100) — common in Polish contracts
  if (/słownie:/i.test(out)) {
    const bareRe = new RegExp(
      `(${PLN_AMOUNT_SURFACE_RE_ONCE.source})([\\s\\S]{0,80}?)słownie:\\s*([^.;\\n]+?)(\\s*00\\/100)?(?=[.;\\n]|$)`,
      'gi',
    )
    out = out.replace(
      bareRe,
      (full, amountWithCurrency: string, between: string, _words: string, cents: string) => {
        // Skip if this amount was already handled as parenthesized nearby
        if (/\(\s*$/.test(between)) return full
        const amount = parsePlnAmount(amountWithCurrency)
        if (amount == null) return full
        const expected = wordsForAmount(amount, finances)
        if (!expected) return full
        return `${amountWithCurrency}${between}słownie: ${expected}${cents ?? ''}`
      },
    )
  }
  return out
}

function repairRepresentedTotalWordsBlock(
  text: string,
  expected: string,
): string {
  if (!/słownie\s*:/i.test(text)) return text
  const suffix = /00\/100/.test(text) ? ' 00/100' : ''
  return text.replace(
    /(słownie\s*:\s*)([^.;\n]*?złotych)(\s*00\/100)?/gi,
    (_full, prefix: string) => `${prefix}${expected}${suffix}`,
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

  // 0. MIXED party clauses — restore provider half before other repairs
  if (input.sourceBlocks && input.sourceBlocks.length > 0) {
    const mixed = repairMixedPartyProviderPreservation({
      blocks,
      sourceBlocks: input.sourceBlocks,
      dataset: input.dataset,
    })
    blocks = mixed.blocks
    repairs.push(...mixed.repairs)
  }

  // 0a. Separate table rows are independently represented identities, but are
  // repaired as one deterministic set rather than broad text replacement.
  if (input.sourceBlocks && input.sourceBlocks.length > 0) {
    const party = repairStructuredPartyIdentityCells({
      blocks,
      sourceBlocks: input.sourceBlocks,
      manifest: input.manifest,
      dataset: input.dataset,
    })
    blocks = party.blocks
    repairs.push(...party.repairs)
  }

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

  // A table may place the numeric total and its words in separate cells, so
  // the amount/words pair cannot be repaired from one block alone. The
  // manifest is the evidence gate: only confidently represented total-words
  // contexts are eligible here.
  const totalWordsReplacement = input.manifest.requiredReplacements.find(
    (r) => r.canonicalField === 'contract.totalPriceWords',
  )
  if (totalWordsReplacement) {
    const expected = wordsForAmount(
      parsePlnAmount(input.dataset.finances.contractValueFormatted) ?? 0,
      input.dataset.finances,
    )
    if (expected) {
      for (const blockId of totalWordsReplacement.requiredContextBlockIds) {
        const index = blocks.findIndex((b) => b.blockId === blockId)
        if (index < 0) continue
        const current = blocks[index]!
        const next = repairRepresentedTotalWordsBlock(current.text, expected)
        if (next !== current.text) {
          repairs.push({
            repairCode: 'insert_deterministic_total_words_from_manifest',
            blockId,
            canonicalField: 'contract.totalPriceWords',
            beforeFingerprint: fingerprintText(current.text),
            afterFingerprint: fingerprintText(next),
          })
          blocks[index] = { ...current, text: next }
        }
      }
    }
  }

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
  // Money amounts are repaired via exact PLN surface replacement — never substring
  // exact_stale (e.g. "00 zł" inside "11 200 zł" → "11 211 200").
  for (const rep of input.manifest.requiredReplacements) {
    if (rep.sourceValues.length !== 1 || rep.targetRenderedValues.length !== 1)
      continue
    if (
      rep.canonicalField === 'contract.paymentStructure' ||
      rep.canonicalField === 'package.serviceScope' ||
      MONEY_AMOUNT_FIELDS.has(rep.canonicalField)
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
      // Idempotence: never replace a fragment of an already-canonical target
      if (targetVal.includes(sourceVal) && b.text.includes(targetVal)) continue

      // Headline/summary dates: dedicated style-preserving repair owns these surfaces
      if (
        rep.canonicalField === 'wedding.date' &&
        input.manifest.sourceRepeatedFactEvidence?.some((e) => e.blockId === blockId)
      ) {
        continue
      }

      // Package names: dedicated exact-surface package repair owns these
      if (rep.canonicalField === 'package.name') {
        continue
      }

      // Headline party names: dedicated repeated-fact repair owns these surfaces
      if (
        rep.canonicalField === 'customer.names' &&
        input.manifest.sourceRepeatedFactEvidence?.some((e) => e.blockId === blockId)
      ) {
        continue
      }

      // CG7.1: filled party *clauses* need a complete model rewrite (Polish grammar).
      // Do not token-swap nominative displayNames into declined instrumental/dative prose.
      // Short table cells where the whole block IS the name remain eligible.
      if (rep.canonicalField === 'customer.names') {
        const evidence = input.manifest.sourcePartyEvidence?.find(
          (e) => e.blockId === blockId,
        )
        if (
          evidence &&
          evidence.sourceText.trim() !== sourceVal.trim() &&
          evidence.sourceText.trim().length > sourceVal.trim().length + 8
        ) {
          continue
        }
      }

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

  // 4. Canonical deposit + remaining amounts (CG3) — system knows financial truth
  const payment = repairCanonicalPaymentAmounts({
    blocks,
    sourceBlocks: input.sourceBlocks,
    dataset: input.dataset,
  })
  blocks = payment.blocks
  repairs.push(...payment.repairs)

  // 4a2. Headline / summary repeated party+date surfaces
  const repeatedEvidence = (input.manifest.sourceRepeatedFactEvidence ??
    []) as SourceRepeatedFactEvidence[]
  if (repeatedEvidence.length > 0) {
    const repeated = repairRepeatedFactSurfaces({
      blocks,
      evidence: repeatedEvidence,
      dataset: input.dataset,
    })
    blocks = repeated.blocks
    repairs.push(...repeated.repairs)
  }

  // 4b. Re-normalize money words AFTER amount swaps (CG7.3 multi-block payment)
  blocks = blocks.map((b) => {
    if (!/słownie/i.test(b.text)) return b
    const replaced = repairMoneyWordsInText(b.text, input.dataset.finances)
    if (replaced === b.text) return b
    repairs.push({
      repairCode: 'insert_deterministic_money_words_after_amount_repair',
      blockId: b.blockId,
      canonicalField: 'contract.totalPriceWords',
      beforeFingerprint: fingerprintText(b.text),
      afterFingerprint: fingerprintText(replaced),
    })
    return { ...b, text: replaced }
  })

  // 5. Canonical party placeholders (CG4) — system knows party display names
  const party = repairCanonicalPartyPlaceholders({
    blocks,
    dataset: input.dataset,
  })
  blocks = party.blocks
  repairs.push(...party.repairs)

  // 6. CG7.2/CG7.4/CG7.5 — location value cells + form lines / multi-slot prose.
  // Group dual-prep evidence that shares a blockId for in-place slot repair.
  const locationEvidence = input.manifest.sourceLocationEvidence ?? []
  const locationByBlock = new Map<string, typeof locationEvidence>()
  for (const ev of locationEvidence) {
    const list = locationByBlock.get(ev.blockId) ?? []
    list.push(ev)
    locationByBlock.set(ev.blockId, list)
  }

  for (const [blockId, evs] of locationByBlock) {
    const idx = blocks.findIndex((b) => b.blockId === blockId)
    if (idx < 0) continue
    const b = blocks[idx]!
    const locs = input.dataset.locations

    const resolveTarget = (ev: (typeof evs)[number]): string => {
      let target = '—'
      if (
        (ev.role === 'preparation' ||
          ev.role === 'preparation_partner1' ||
          ev.role === 'preparation_partner2') &&
        (locs.preparationDisplayText ||
          locs.preparation ||
          locs.preparationLocations?.length)
      ) {
        if (ev.role === 'preparation_partner1') {
          target =
            locs.preparationLocations?.find((e) => e.person === 'bride')
              ?.fullAddress ?? '—'
        } else if (ev.role === 'preparation_partner2') {
          target =
            locs.preparationLocations?.find((e) => e.person === 'groom')
              ?.fullAddress ?? '—'
        } else {
          // Generic prep field + two CRM addresses → combined display when available
          const bride = locs.preparationLocations?.find(
            (e) => e.person === 'bride',
          )?.fullAddress
          const groom = locs.preparationLocations?.find(
            (e) => e.person === 'groom',
          )?.fullAddress
          if (bride && groom && locs.preparationDisplayText) {
            target = locs.preparationDisplayText
          } else {
            target =
              locs.preparationDisplayText ??
              locs.preparation?.fullAddress ??
              locs.preparation?.displayName ??
              bride ??
              groom ??
              '—'
          }
        }
      } else if (ev.role === 'ceremony' && locs.ceremony) {
        target = locs.ceremony.fullAddress ?? locs.ceremony.displayName ?? '—'
      } else if (ev.role === 'reception' && locs.reception) {
        target = locs.reception.fullAddress ?? locs.reception.displayName ?? '—'
      }
      return target
    }

    // Multi-slot dual-prep prose: replace each label:value in place.
    if (evs.length >= 2 || extractNeedsMultiSlot(b.text, evs)) {
      const slots = extractIntraParagraphLocationSlots(b.text)
      if (slots.length >= 2) {
        const replacements: Array<{ label: string; target: string }> = []
        for (const ev of evs) {
          const target = resolveTarget(ev)
          if (target === '—' && ev.role !== 'unknown') {
            // Absent CRM for this partner: leave sentinel / neutralize later
            if (
              ev.role === 'preparation_partner1' ||
              ev.role === 'preparation_partner2'
            ) {
              const hasPartner =
                ev.role === 'preparation_partner1'
                  ? locs.preparationLocations?.some(
                      (e) => e.person === 'bride' && e.fullAddress,
                    )
                  : locs.preparationLocations?.some(
                      (e) => e.person === 'groom' && e.fullAddress,
                    )
              if (!hasPartner) continue
            }
          }
          const slot =
            slots.find((s) => s.role === ev.role) ??
            slots.find((s) =>
              s.sourceText
                .toLowerCase()
                .includes(
                  (ev.sourceText.split(':')[0] ?? '')
                    .toLowerCase()
                    .slice(0, 24),
                ),
            )
          if (!slot) continue
          if (target === '—') continue
          replacements.push({ label: slot.label, target })
        }
        if (replacements.length > 0) {
          const next = applyIntraParagraphLocationTargets(b.text, replacements)
          if (next !== b.text) {
            repairs.push({
              repairCode: 'exact_location_multi_slot_to_canonical',
              blockId,
              canonicalField: 'wedding.preparationLocation',
              beforeFingerprint: fingerprintText(b.text),
              afterFingerprint: fingerprintText(next),
            })
            blocks[idx] = { ...b, text: next }
          }
          continue
        }
      }
    }

    // Single evidence path (table cell / single form line)
    for (const ev of evs) {
      if (ev.role === 'unknown') continue
      let target = resolveTarget(ev)

      // Form lines need compact address — but never overwrite partner-specific targets.
      if (
        ev.representation !== 'table_cell' &&
        ev.role === 'preparation'
      ) {
        target =
          locs.preparationDisplayText ??
          locs.preparation?.fullAddress ??
          locs.preparation?.displayName ??
          locs.preparationLocations?.[0]?.fullAddress ??
          target
      }

      let next: string
      if (ev.representation === 'table_cell') {
        if (b.text.trim() !== ev.sourceText.trim()) continue
        next = target
      } else {
        const form = b.text.match(/^([^:\n]{2,80}):\s*(.*)$/)
        if (form) {
          next = `${form[1]}: ${target}`
        } else if (
          b.text.trim() === ev.sourceText.trim() &&
          b.text.trim().length <= 120
        ) {
          next = target
        } else {
          continue
        }
      }

      if (next === b.text || target === '—') continue
      repairs.push({
        repairCode:
          ev.representation === 'table_cell'
            ? 'exact_location_table_cell_to_canonical'
            : 'exact_location_form_line_to_canonical',
        blockId: ev.blockId,
        canonicalField: ev.canonicalField,
        beforeFingerprint: fingerprintText(b.text),
        afterFingerprint: fingerprintText(next),
      })
      blocks[idx] = { ...b, text: next }
    }
  }

  // 7. CG7.4 — contract execution / signing date form lines
  for (const rep of input.manifest.requiredReplacements) {
    if (rep.canonicalField !== 'contract.executionDate') continue
    const target = rep.targetRenderedValues[0]
    if (!target) continue
    for (const blockId of rep.requiredContextBlockIds) {
      const idx = blocks.findIndex((b) => b.blockId === blockId)
      if (idx < 0) continue
      const b = blocks[idx]!
      const next = applyCanonicalExecutionDate(b.text, target)
      if (next === b.text) continue
      repairs.push({
        repairCode: 'exact_execution_date_to_canonical',
        blockId,
        canonicalField: 'contract.executionDate',
        beforeFingerprint: fingerprintText(b.text),
        afterFingerprint: fingerprintText(next),
      })
      blocks[idx] = { ...b, text: next }
    }
  }

  return { blocks, repairs }
}

export function summarizeRequiredReplacementsForPrompt(
  replacements: RequiredReplacement[],
): RequiredReplacement[] {
  // Cap size for payload — keep full structure, limit list length
  return replacements.slice(0, 40)
}
