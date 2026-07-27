/**
 * Build deterministic transformation expectation manifest (pre-AI).
 */

import type {
  ContractTransformationDataset,
  ProtectedContractData,
  TransformDocumentBlock,
} from '../types'
import {
  looksLikeStreetAddress,
  preferredLocationInsertionHint,
} from '../locationInsertionPolicy'
import {
  locationFromDatasetEntry,
  renderCustomerAddress,
  renderLocationSummary,
  renderMultiLocationSummary,
  renderPreparationLocationClause,
  renderCeremonyLocationClause,
  renderReceptionLocationClause,
} from './locationRendering'
import { normalizeForMatch, textContainsNormalized } from './normalize'
import type {
  CanonicalTransformField,
  ConsistencyRule,
  DocumentContextKind,
  ProtectedFieldExpectation,
  RequiredFieldExpectation,
  RequiredReplacement,
  SourceSpecificValue,
  TransformationExpectationManifest,
} from './types'

function inferContext(block: TransformDocumentBlock): DocumentContextKind {
  const family = block.tableContext?.ownershipFamily
  if (family === 'customer') return 'party_table'
  if (family === 'wedding_location') return 'location_table'
  if (family === 'wedding_date') return 'location_table'
  const t = block.text.toLowerCase()
  if (/przygotowan/i.test(t)) return 'preparation_clause'
  if (/ceremoni|zaślubin|zaślubin|kościół|urząd stanu/i.test(t))
    return 'ceremony_clause'
  if (/przyjęci|powitanie gości|sala|miejsce przyjęcia/i.test(t))
    return 'reception_clause'
  if (/wynagrodzen|zł|słownie|zadatek|pozostał/i.test(t)) return 'finance_clause'
  if (/płatne|płatność|przelew|termin.*zapłat/i.test(t)) return 'payment_clause'
  if (/zwan|zam\.|zleceniodawc|parą młod/i.test(t)) return 'opening_paragraph'
  return 'generic_body'
}

function findBlocksContaining(
  blocks: TransformDocumentBlock[],
  values: string[],
): string[] {
  const ids: string[] = []
  for (const b of blocks) {
    if (values.some((v) => v && textContainsNormalized(b.text, v))) {
      ids.push(b.blockId)
    }
  }
  return ids
}

function collectSpans(
  blocks: TransformDocumentBlock[],
  value: string,
): Array<{ blockId: string; start: number; end: number }> {
  const spans: Array<{ blockId: string; start: number; end: number }> = []
  for (const b of blocks) {
    const idx = b.text.indexOf(value)
    if (idx >= 0) {
      spans.push({ blockId: b.blockId, start: idx, end: idx + value.length })
      continue
    }
    // normalized soft find — record whole block as span when matched
    if (textContainsNormalized(b.text, value)) {
      spans.push({ blockId: b.blockId, start: 0, end: Math.min(b.text.length, 40) })
    }
  }
  return spans
}

function pushSourceValue(
  out: SourceSpecificValue[],
  input: {
    field: CanonicalTransformField
    value: string
    blocks: TransformDocumentBlock[]
    mustDisappear?: boolean
  },
) {
  const value = input.value.trim()
  if (!value || value.length < 3) return
  const blockIds = findBlocksContaining(input.blocks, [value])
  if (blockIds.length === 0) return
  const block = input.blocks.find((b) => b.blockId === blockIds[0])
  out.push({
    canonicalField: input.field,
    sourceValue: value,
    normalizedValue: normalizeForMatch(value),
    sourceBlockIds: blockIds,
    sourceSpans: collectSpans(input.blocks, value),
    context: block ? inferContext(block) : 'generic_body',
    mustDisappear: input.mustDisappear ?? true,
  })
}

function extractLikelyNameTokens(text: string): string[] {
  // Heuristic: capitalized word pairs near "z " / party patterns — keep conservative
  const out: string[] = []
  const re =
    /\b([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:ą|ę|a|y)?)\s+([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const full = `${m[1]} ${m[2]}`
    if (/Studio|Sp\.|Test|Wykonawc|Zabrze|Kraków|Warszawa/i.test(full)) continue
    out.push(full)
  }
  return out
}

export function buildExpectationManifest(input: {
  sourceBlocks: TransformDocumentBlock[]
  dataset: ContractTransformationDataset
  protectedData: ProtectedContractData
}): TransformationExpectationManifest {
  const { sourceBlocks: blocks, dataset, protectedData } = input
  const sourceSpecificValues: SourceSpecificValue[] = []
  const requiredFields: RequiredFieldExpectation[] = []
  const requiredReplacements: RequiredReplacement[] = []

  // --- inventory old customer/wedding values from party / location rows & body ---
  for (const b of blocks) {
    // Row labels are not customer/wedding values
    if (
      b.kind === 'tableCell' &&
      (b.cellIndex === 0 ||
        (b.tableContext?.rowLabelText &&
          b.text.trim() === b.tableContext.rowLabelText.trim()))
    ) {
      continue
    }
    const family = b.tableContext?.ownershipFamily
    if (family === 'customer') {
      for (const name of extractLikelyNameTokens(b.text)) {
        pushSourceValue(sourceSpecificValues, {
          field: 'customer.names',
          value: name,
          blocks,
        })
      }
      const phone = b.text.match(
        /(?:tel\.?\s*)?((?:\+48[\s-]?)?(?:\d{3}[\s-]?\d{3}[\s-]?\d{3}|\d{9}))/i,
      )
      if (phone?.[1]) {
        pushSourceValue(sourceSpecificValues, {
          field: 'customer.phone',
          value: phone[1],
          blocks,
        })
      }
    }
    if (family === 'wedding_date' || /data wydarzenia|ślubu/i.test(b.tableContext?.rowLabelText ?? '')) {
      const date = b.text.match(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/)
      if (date?.[0] && family !== 'provider') {
        pushSourceValue(sourceSpecificValues, {
          field: 'wedding.date',
          value: date[0],
          blocks,
        })
      }
    }
    if (family === 'wedding_location') {
      const locText = b.text.trim()
      if (locText.length >= 4) {
        pushSourceValue(sourceSpecificValues, {
          field: 'wedding.receptionLocation',
          value: locText,
          blocks,
        })
        // Also store short venue tokens (e.g. Pałac Rydzyna)
        const venue = locText.match(
          /\b((?:Pałac|Hotel|Kościół|Bazylika|Restauracja)\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)?)/,
        )
        if (venue?.[1]) {
          pushSourceValue(sourceSpecificValues, {
            field: 'wedding.receptionLocation',
            value: venue[1],
            blocks,
          })
        }
      }
    }
  }

  // Body location mentions of known venues from location cells
  for (const b of blocks) {
    if (b.kind !== 'paragraph') continue
    const venueRe =
      /\b((?:Pałac(?:u|em|owi)?|Hotel(?:u|em|owi)?|Kościo(?:ł|le|ła)|Bazylik(?:a|i|ę|ą))\s+[A-ZĄĆĘŁŃÓŚŹŻ][^\s,.]{2,}(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][^\s,.]{2,})?)/gi
    let m: RegExpExecArray | null
    while ((m = venueRe.exec(b.text))) {
      const surface = m[1]!
      pushSourceValue(sourceSpecificValues, {
        field: /przygotowan/i.test(b.text)
          ? 'wedding.preparationLocation'
          : /ceremoni|kościół|bazylik|zaślubin/i.test(b.text)
            ? 'wedding.ceremonyLocation'
            : 'wedding.receptionLocation',
        value: surface,
        blocks,
      })
      // Also store nominative-ish head + place for matching
      const place = surface.split(/\s+/).slice(1).join(' ')
      if (place.length >= 4) {
        pushSourceValue(sourceSpecificValues, {
          field: /przygotowan/i.test(b.text)
            ? 'wedding.preparationLocation'
            : /ceremoni|kościół|bazylik|zaślubin/i.test(b.text)
              ? 'wedding.ceremonyLocation'
              : 'wedding.receptionLocation',
          value: place,
          blocks,
        })
      }
    }
  }

  // Old prices in finance paragraphs
  for (const b of blocks) {
    if (!/zł/i.test(b.text)) continue
    if (b.tableContext?.ownershipFamily === 'provider') continue
    const amounts = b.text.match(/\d[\d\s]*\s*zł/gi) ?? []
    for (const a of amounts) {
      // Skip tiny rates like hour rates if labelled as such
      if (/godzin/i.test(b.text) && /stawk/i.test(b.text)) continue
      pushSourceValue(sourceSpecificValues, {
        field: 'contract.totalPrice',
        value: a,
        blocks: [b],
        mustDisappear: false, // may be deposit; completeness checks carefully
      })
    }
  }

  // --- required fields from dataset ---
  const addRequired = (
    field: CanonicalTransformField,
    sourceValues: string[],
    expectedValues: string[],
    requirement: RequiredFieldExpectation['requirement'],
    contexts?: RequiredFieldExpectation['expectedContexts'],
  ) => {
    requiredFields.push({
      canonicalField: field,
      sourceValues: sourceValues.filter(Boolean),
      expectedValues: expectedValues.filter(Boolean),
      requirement,
      expectedContexts: contexts,
    })
  }

  const nameBlocks = findBlocksContaining(
    blocks,
    sourceSpecificValues
      .filter((s) => s.canonicalField === 'customer.names')
      .map((s) => s.sourceValue),
  )
  addRequired(
    'customer.names',
    sourceSpecificValues
      .filter((s) => s.canonicalField === 'customer.names')
      .map((s) => s.sourceValue),
    [dataset.clients.displayNames],
    'must_replace_source',
    [{ kind: 'party_table', blockIds: nameBlocks }],
  )

  if (dataset.clients.address) {
    const addrBlocks = findBlocksContaining(
      blocks,
      sourceSpecificValues
        .filter((s) => s.canonicalField === 'customer.address')
        .map((s) => s.sourceValue),
    )
    addRequired(
      'customer.address',
      [],
      [renderCustomerAddress(dataset.clients.address)],
      'must_appear_in_relevant_context',
      [{ kind: 'party_table', blockIds: addrBlocks.length ? addrBlocks : nameBlocks }],
    )
  }
  if (dataset.clients.phone) {
    addRequired(
      'customer.phone',
      sourceSpecificValues
        .filter((s) => s.canonicalField === 'customer.phone')
        .map((s) => s.sourceValue),
      [dataset.clients.phone],
      'must_replace_source',
    )
  }

  addRequired(
    'wedding.date',
    sourceSpecificValues
      .filter((s) => s.canonicalField === 'wedding.date')
      .map((s) => s.sourceValue),
    [dataset.dates.weddingDate],
    'must_replace_source',
  )

  addRequired(
    'contract.executionDate',
    [],
    [dataset.dates.contractExecutionDate],
    'must_appear',
  )

  const prep = locationFromDatasetEntry(dataset.locations.preparation)
  const ceremony = locationFromDatasetEntry(dataset.locations.ceremony)
  const reception = locationFromDatasetEntry(dataset.locations.reception)

  if (prep) {
    const prepEntries = dataset.locations.preparationLocations ?? []
    const targets = [
      dataset.locations.preparationDisplayText ?? '',
      ...prepEntries.map((e) => e.fullAddress),
      renderLocationSummary(prep),
      preferredLocationInsertionHint(dataset.locations.preparation!) ===
      'pod_adresem'
        ? `pod adresem ${prep.fullAddress ?? prep.displayName}`
        : '',
    ].filter(Boolean)
    addRequired(
      'wedding.preparationLocation',
      sourceSpecificValues
        .filter((s) => s.canonicalField === 'wedding.preparationLocation')
        .map((s) => s.sourceValue),
      targets,
      'must_appear_in_relevant_context',
      [
        {
          kind: 'preparation_clause',
          blockIds: blocks
            .filter((b) => inferContext(b) === 'preparation_clause')
            .map((b) => b.blockId),
        },
      ],
    )
  }
  if (ceremony) {
    addRequired(
      'wedding.ceremonyLocation',
      sourceSpecificValues
        .filter((s) => s.canonicalField === 'wedding.ceremonyLocation')
        .map((s) => s.sourceValue),
      [renderLocationSummary(ceremony)],
      'must_appear_in_relevant_context',
      [
        {
          kind: 'ceremony_clause',
          blockIds: blocks
            .filter((b) => inferContext(b) === 'ceremony_clause')
            .map((b) => b.blockId),
        },
      ],
    )
  }
  if (reception) {
    const stale = sourceSpecificValues
      .filter((s) => s.canonicalField === 'wedding.receptionLocation')
      .map((s) => s.sourceValue)
    addRequired(
      'wedding.receptionLocation',
      stale,
      [
        renderLocationSummary(reception),
        reception.fullAddress ?? '',
        reception.displayName ?? '',
        reception.city ?? '',
      ].filter(Boolean),
      'must_replace_source',
      [
        {
          kind: 'location_table',
          blockIds: blocks
            .filter(
              (b) =>
                b.tableContext?.ownershipFamily === 'wedding_location' ||
                inferContext(b) === 'reception_clause',
            )
            .map((b) => b.blockId),
        },
        {
          kind: 'reception_clause',
          blockIds: blocks
            .filter((b) => inferContext(b) === 'reception_clause')
            .map((b) => b.blockId),
        },
      ],
    )
  }

  addRequired(
    'contract.totalPrice',
    [],
    [dataset.finances.contractValueFormatted],
    'must_appear',
  )
  addRequired(
    'contract.totalPriceWords',
    [],
    [dataset.finances.contractValueWords],
    'must_appear_in_relevant_context',
  )
  if (dataset.finances.depositFormatted) {
    addRequired(
      'contract.depositAmount',
      [],
      [
        dataset.finances.depositFormatted,
        dataset.finances.depositWords ?? '',
      ].filter(Boolean),
      'must_appear',
    )
  }
  if (dataset.finances.remainingFormatted) {
    addRequired(
      'contract.remainingAmount',
      [],
      [
        dataset.finances.remainingFormatted,
        dataset.finances.remainingWords ?? '',
      ].filter(Boolean),
      'must_appear',
    )
  }
  if (dataset.finances.depositFormatted && dataset.finances.remainingFormatted) {
    addRequired(
      'contract.paymentStructure',
      ['płatne jednorazowo', 'jednorazowo'],
      [dataset.finances.depositFormatted, dataset.finances.remainingFormatted],
      'must_appear',
    )
  }

  // required replacements for the model
  for (const field of requiredFields) {
    if (field.sourceValues.length === 0 && field.expectedValues.length === 0)
      continue
    const sourceBlockIds = findBlocksContaining(blocks, field.sourceValues)
    const contextIds =
      field.expectedContexts?.flatMap((c) => c.blockIds) ?? sourceBlockIds
    requiredReplacements.push({
      canonicalField: field.canonicalField,
      sourceValues: field.sourceValues,
      targetRenderedValues: field.expectedValues,
      sourceBlockIds,
      requiredContextBlockIds: [...new Set(contextIds)],
      replacementPolicy:
        field.requirement === 'must_replace_source'
          ? 'replace_all_occurrences'
          : 'replace_in_contexts',
    })
  }

  // multi-location summary target when template has generic location row
  if ((prep || ceremony || reception) && blocks.some((b) => b.tableContext?.ownershipFamily === 'wedding_location')) {
    const summary = renderMultiLocationSummary({
      preparation: prep,
      ceremony,
      reception,
    })
    if (summary) {
      requiredReplacements.push({
        canonicalField: 'wedding.receptionLocation',
        sourceValues: sourceSpecificValues
          .filter((s) => s.canonicalField.startsWith('wedding.'))
          .map((s) => s.sourceValue),
        targetRenderedValues: [summary],
        sourceBlockIds: blocks
          .filter((b) => b.tableContext?.ownershipFamily === 'wedding_location')
          .map((b) => b.blockId),
        requiredContextBlockIds: blocks
          .filter((b) => b.tableContext?.ownershipFamily === 'wedding_location')
          .map((b) => b.blockId),
        replacementPolicy: 'replace_in_contexts',
      })
    }
  }

  const protectedFields: ProtectedFieldExpectation[] = (
    'entries' in protectedData && Array.isArray((protectedData as { entries?: unknown }).entries)
      ? (protectedData as { entries: Array<{ canonicalField: string; sourceSpan: string; ownershipReason: string }> }).entries
      : protectedData.exactProtectedValues.map((v) => ({
          canonicalField: 'provider.unknown',
          sourceSpan: v,
          ownershipReason: 'exact',
        }))
  ).map((e) => ({
    canonicalField: e.canonicalField,
    sourceValues: [e.sourceSpan],
    ownershipReason: e.ownershipReason,
  }))

  const consistencyRules: ConsistencyRule[] = [
    'money_words_match_total',
    'no_mixed_source_target',
    'package_scope_stable_without_explicit_scope',
  ]
  if (dataset.finances.depositFormatted && dataset.finances.remainingFormatted) {
    consistencyRules.push(
      'deposit_plus_remaining_equals_total',
      'payment_structure_matches_dataset',
    )
  }

  // silence unused import warnings for clause renderers (used by repairs / prompts consumers)
  void renderPreparationLocationClause
  void renderCeremonyLocationClause
  void renderReceptionLocationClause
  void looksLikeStreetAddress

  return {
    requiredFields,
    protectedFields,
    consistencyRules,
    sourceSpecificValues,
    requiredReplacements,
  }
}
