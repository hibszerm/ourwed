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
import {
  discoverFilledPartyEvidence,
  extractCustomerAddressSurface,
  type SourcePartyEvidence as PartyEvidenceRuntime,
} from './partyFilledIdentity'
import {
  discoverFilledLocationEvidence,
  isNonSemanticLocationSurface,
  weddingDatesSemanticallyEqual,
  type SourceLocationEvidence as LocationEvidenceRuntime,
} from './locationFieldEvidence'
import {
  discoverExecutionDateEvidence,
} from './dateFieldEvidence'
import { detectRepresentedConcepts } from './representationPolicy'
import { discoverFilledTotalEvidence } from './totalFieldEvidence'
import type {
  CanonicalTransformField,
  ConsistencyRule,
  DocumentContextKind,
  ProtectedFieldExpectation,
  RequiredFieldExpectation,
  RequiredReplacement,
  SourceLocationEvidence,
  SourcePartyEvidence,
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

  // CG7.1 — discover filled (non-placeholder) contracting-party blocks structurally
  const filledPartyEvidence: SourcePartyEvidence[] = discoverFilledPartyEvidence(
    blocks,
  ).map((e: PartyEvidenceRuntime) => ({
    blockId: e.blockId,
    sourceText: e.sourceText,
    identitySurfaces: e.identitySurfaces,
  }))
  for (const ev of filledPartyEvidence) {
    for (const surface of ev.identitySurfaces) {
      pushSourceValue(sourceSpecificValues, {
        field: 'customer.names',
        value: surface,
        blocks,
      })
    }
    // Also inventory phone/address surfaces that live in the same party clause
    const phoneSource = ev.customerHalfText ?? ev.sourceText
    const phone = phoneSource.match(
      /(?:tel\.?\s*)?((?:\+48[\s-]?)?(?:\d{3}[\s-]?\d{3}[\s-]?\d{3}|\d{9}))/i,
    )
    if (phone?.[1]) {
      pushSourceValue(sourceSpecificValues, {
        field: 'customer.phone',
        value: phone[1],
        blocks,
      })
    }
    const addrSurface = extractCustomerAddressSurface(phoneSource)
    if (addrSurface) {
      pushSourceValue(sourceSpecificValues, {
        field: 'customer.address',
        value: addrSurface,
        blocks: blocks.filter((b) => b.blockId === ev.blockId),
        mustDisappear: true,
      })
    }
  }

  // CG7.2 — discover grounded event-location fields (table/prose)
  const filledLocationEvidence: SourceLocationEvidence[] =
    discoverFilledLocationEvidence(blocks).map((e: LocationEvidenceRuntime) => ({
      blockId: e.blockId,
      role: e.role,
      sourceText: e.sourceText,
      nonSemanticSurface: e.nonSemanticSurface,
      representation: e.representation,
      rowLabelText: e.rowLabelText,
      canonicalField: e.canonicalField,
    }))

  const executionDateEvidence = discoverExecutionDateEvidence(blocks)

  const represented = detectRepresentedConcepts(blocks, {
    hasPartyEvidence: filledPartyEvidence.length > 0,
    hasPrepEvidence: filledLocationEvidence.some((e) =>
      e.role === 'preparation' ||
      e.role === 'preparation_partner1' ||
      e.role === 'preparation_partner2',
    ),
    hasCeremonyEvidence: filledLocationEvidence.some((e) => e.role === 'ceremony'),
    hasReceptionEvidence: filledLocationEvidence.some((e) => e.role === 'reception'),
  })
  // Grounded execution-date evidence overrides heuristic representation.
  if (executionDateEvidence.length > 0) {
    represented.contractExecutionDate = true
  }

  for (const ev of filledLocationEvidence) {
    // Sentinels are structural fields, not stale venue inventory
    if (ev.nonSemanticSurface || isNonSemanticLocationSurface(ev.sourceText)) {
      continue
    }
    if (ev.sourceText.trim().length < 4) continue
    // Table value cells: inventory the cell text as the old surface.
    // Prose clauses: inventory only distinctive venue tokens (not the whole sentence),
    // otherwise completeness treats legal sentence stems as mustDisappear.
    if (ev.representation === 'table_cell') {
      pushSourceValue(sourceSpecificValues, {
        field: ev.canonicalField,
        value: ev.sourceText,
        blocks: [blocks.find((b) => b.blockId === ev.blockId)!].filter(Boolean),
        mustDisappear: true,
      })
      continue
    }
    const venueTok = ev.sourceText.match(
      /\b((?:Pałac(?:u|em)?|Hotel(?:u|em)?|Kościo(?:ł|le|ła)|Bazylik(?:a|i|ę)|Zam(?:ek|ku)|Dworek|Dworku|Restauracj(?:a|i)|Sala|Sali)\s+[A-ZĄĆĘŁŃÓŚŹŻ][^\s,.]{2,}(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][^\s,.]{2,}){0,3})/i,
    )
    if (venueTok?.[1]) {
      pushSourceValue(sourceSpecificValues, {
        field: ev.canonicalField,
        value: venueTok[1],
        blocks: [blocks.find((b) => b.blockId === ev.blockId)!].filter(Boolean),
        mustDisappear: true,
      })
    }
  }

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
        // Date inventory is independent of location. If the calendar day already
        // matches canonical weddingDate, do not force a cosmetic "must disappear".
        const sameDay = weddingDatesSemanticallyEqual(
          date[0],
          dataset.dates.weddingDate,
        )
        pushSourceValue(sourceSpecificValues, {
          field: 'wedding.date',
          value: date[0],
          blocks,
          mustDisappear: !sameDay,
        })
      }
    }
    // wedding_location value inventory is handled via filledLocationEvidence above
    // (role-correct + sentinel-aware). Do not dump every cell into receptionLocation.
  }

  // Body venue inventory is representation-gated: ONLY grounded location evidence
  // may contribute mustDisappear surfaces. Arbitrary "Sala …" matches in legal
  // prose must not invent receptionLocation stale failures (CG7.3/CG7.4).
  // (Intentionally no ungated paragraph venue regex here.)

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

  const nameSourceValues = [
    ...sourceSpecificValues
      .filter((s) => s.canonicalField === 'customer.names')
      .map((s) => s.sourceValue),
    ...(blocks.some((b) => b.text.includes('PLACEHOLDER_STRONY'))
      ? ['PLACEHOLDER_STRONY']
      : []),
  ]
  const nameBlocks = [
    ...new Set([
      ...findBlocksContaining(blocks, nameSourceValues),
      ...filledPartyEvidence.map((e) => e.blockId),
    ]),
  ]
  // CG7.3 — party identity is required only when the template represents parties.
  if (represented.party) {
    addRequired(
      'customer.names',
      nameSourceValues,
      [dataset.clients.displayNames],
      'must_replace_source',
      [
        {
          kind:
            filledPartyEvidence.length > 0 &&
            !blocks.some((b) => b.tableContext?.ownershipFamily === 'customer')
              ? 'opening_paragraph'
              : 'party_table',
          blockIds: nameBlocks,
        },
      ],
    )
  }

  // Explicit requiredReplacement for filled party blocks so the model sees
  // sourceBlockIds even when sourceValues alone would miss declined forms.
  if (filledPartyEvidence.length > 0 && dataset.clients.displayNames) {
    const partySourceValues = [
      ...new Set(filledPartyEvidence.flatMap((e) => e.identitySurfaces)),
    ]
    const partyBlockIds = filledPartyEvidence.map((e) => e.blockId)
    requiredReplacements.push({
      canonicalField: 'customer.names',
      sourceValues: partySourceValues,
      targetRenderedValues: [dataset.clients.displayNames],
      sourceBlockIds: partyBlockIds,
      requiredContextBlockIds: partyBlockIds,
      replacementPolicy: 'replace_in_contexts',
    })
  }

  if (dataset.clients.address && represented.customerAddress) {
    const addrSources = sourceSpecificValues
      .filter((s) => s.canonicalField === 'customer.address')
      .map((s) => s.sourceValue)
    const addrBlocks = [
      ...new Set([
        ...findBlocksContaining(blocks, addrSources),
        ...filledPartyEvidence
          .filter((e) => extractCustomerAddressSurface(e.customerHalfText ?? e.sourceText))
          .map((e) => e.blockId),
      ]),
    ]
    const targetAddr = renderCustomerAddress(dataset.clients.address)
    addRequired(
      'customer.address',
      addrSources,
      [targetAddr],
      addrSources.length > 0 ? 'must_replace_source' : 'must_appear_in_relevant_context',
      [{ kind: 'opening_paragraph', blockIds: addrBlocks.length ? addrBlocks : nameBlocks }],
    )
    if (addrBlocks.length > 0) {
      requiredReplacements.push({
        canonicalField: 'customer.address',
        sourceValues: addrSources,
        targetRenderedValues: [targetAddr],
        sourceBlockIds: addrBlocks,
        requiredContextBlockIds: addrBlocks,
        replacementPolicy: 'replace_in_contexts',
      })
    }
  }
  if (dataset.clients.phone && represented.customerPhone) {
    addRequired(
      'customer.phone',
      sourceSpecificValues
        .filter((s) => s.canonicalField === 'customer.phone')
        .map((s) => s.sourceValue),
      [dataset.clients.phone],
      'must_replace_source',
    )
  }

  const dateAlreadyMatches = sourceSpecificValues.some(
    (s) =>
      s.canonicalField === 'wedding.date' &&
      !s.mustDisappear &&
      weddingDatesSemanticallyEqual(s.sourceValue, dataset.dates.weddingDate),
  )
  if (represented.weddingDate) {
    addRequired(
      'wedding.date',
      sourceSpecificValues
        .filter((s) => s.canonicalField === 'wedding.date' && s.mustDisappear)
        .map((s) => s.sourceValue),
      [dataset.dates.weddingDate],
      dateAlreadyMatches ? 'must_appear' : 'must_replace_source',
    )
  }

  if (represented.contractExecutionDate) {
    const execSources = executionDateEvidence
      .map((e) => e.sourceDate)
      .filter((v): v is string => Boolean(v))
    const execBlocks = executionDateEvidence.map((e) => e.blockId)
    addRequired(
      'contract.executionDate',
      execSources,
      [dataset.dates.contractExecutionDate],
      execSources.length > 0 ? 'must_replace_source' : 'must_appear',
      execBlocks.length
        ? [{ kind: 'opening_paragraph', blockIds: execBlocks }]
        : undefined,
    )
    for (const ev of executionDateEvidence) {
      requiredReplacements.push({
        canonicalField: 'contract.executionDate',
        sourceValues: ev.sourceDate ? [ev.sourceDate] : [],
        targetRenderedValues: [dataset.dates.contractExecutionDate],
        sourceBlockIds: [ev.blockId],
        requiredContextBlockIds: [ev.blockId],
        replacementPolicy: 'replace_in_contexts',
      })
    }
  }

  const prep = locationFromDatasetEntry(dataset.locations.preparation)
  const ceremony = locationFromDatasetEntry(dataset.locations.ceremony)
  const reception = locationFromDatasetEntry(dataset.locations.reception)

  const locationEvidenceByRole = (roles: SourceLocationEvidence['role'][]) =>
    filledLocationEvidence.filter((e) => roles.includes(e.role))

  if (prep && represented.preparationLocation) {
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
    const prepEvidence = locationEvidenceByRole([
      'preparation',
      'preparation_partner1',
      'preparation_partner2',
    ])
    const prepBlockIds = prepEvidence.map((e) => e.blockId)
    addRequired(
      'wedding.preparationLocation',
      sourceSpecificValues
        .filter((s) => s.canonicalField === 'wedding.preparationLocation')
        .map((s) => s.sourceValue),
      targets,
      'must_appear_in_relevant_context',
      [{ kind: 'preparation_clause', blockIds: prepBlockIds }],
    )
    if (prepEvidence.length > 0) {
      requiredReplacements.push({
        canonicalField: 'wedding.preparationLocation',
        sourceValues: prepEvidence
          .filter((e) => !e.nonSemanticSurface)
          .map((e) => e.sourceText),
        targetRenderedValues: targets,
        sourceBlockIds: prepEvidence.map((e) => e.blockId),
        requiredContextBlockIds: prepEvidence.map((e) => e.blockId),
        replacementPolicy: 'replace_in_contexts',
      })
    }
  }
  if (ceremony && represented.ceremonyLocation) {
    const ceremonyEvidence = locationEvidenceByRole(['ceremony'])
    const ceremonyBlockIds = ceremonyEvidence.map((e) => e.blockId)
    addRequired(
      'wedding.ceremonyLocation',
      sourceSpecificValues
        .filter((s) => s.canonicalField === 'wedding.ceremonyLocation')
        .map((s) => s.sourceValue),
      [renderLocationSummary(ceremony)],
      'must_appear_in_relevant_context',
      [{ kind: 'ceremony_clause', blockIds: ceremonyBlockIds }],
    )
    if (ceremonyEvidence.length > 0) {
      requiredReplacements.push({
        canonicalField: 'wedding.ceremonyLocation',
        sourceValues: ceremonyEvidence
          .filter((e) => !e.nonSemanticSurface)
          .map((e) => e.sourceText),
        targetRenderedValues: [renderLocationSummary(ceremony)],
        sourceBlockIds: ceremonyEvidence.map((e) => e.blockId),
        requiredContextBlockIds: ceremonyEvidence.map((e) => e.blockId),
        replacementPolicy: 'replace_in_contexts',
      })
    }
  }
  if (reception && represented.receptionLocation) {
    const stale = sourceSpecificValues
      .filter((s) => s.canonicalField === 'wedding.receptionLocation')
      .map((s) => s.sourceValue)
    const receptionEvidence = locationEvidenceByRole(['reception'])
    const receptionBlockIds = receptionEvidence.map((e) => e.blockId)
    addRequired(
      'wedding.receptionLocation',
      stale,
      [
        renderLocationSummary(reception),
        reception.fullAddress ?? '',
        reception.displayName ?? '',
        reception.city ?? '',
      ].filter(Boolean),
      'must_appear_in_relevant_context',
      [
        { kind: 'location_table', blockIds: receptionBlockIds },
        { kind: 'reception_clause', blockIds: receptionBlockIds },
      ],
    )
    if (receptionEvidence.length > 0) {
      requiredReplacements.push({
        canonicalField: 'wedding.receptionLocation',
        sourceValues: receptionEvidence
          .filter((e) => !e.nonSemanticSurface)
          .map((e) => e.sourceText),
        targetRenderedValues: [
          renderLocationSummary(reception),
          reception.fullAddress ?? '',
          reception.displayName ?? '',
        ].filter(Boolean),
        sourceBlockIds: receptionEvidence.map((e) => e.blockId),
        requiredContextBlockIds: receptionEvidence.map((e) => e.blockId),
        replacementPolicy: 'replace_in_contexts',
      })
    }
  }

  // Absent CRM roles with grounded fields: neutralize without inventing.
  for (const ev of filledLocationEvidence) {
    const hasTarget =
      (ev.role === 'ceremony' && Boolean(ceremony)) ||
      (ev.role === 'reception' && Boolean(reception)) ||
      ((ev.role === 'preparation' ||
        ev.role === 'preparation_partner1' ||
        ev.role === 'preparation_partner2') &&
        Boolean(prep))
    if (hasTarget) continue
    if (!ev.sourceText.trim()) continue
    requiredReplacements.push({
      canonicalField: ev.canonicalField,
      sourceValues: [ev.sourceText],
      targetRenderedValues: ['—'],
      sourceBlockIds: [ev.blockId],
      requiredContextBlockIds: [ev.blockId],
      replacementPolicy: 'replace_in_contexts',
    })
  }

  if (represented.totalPrice) {
    const totalEvidence = discoverFilledTotalEvidence(blocks)
    const totalBlockIds = totalEvidence.map((e) => e.blockId)
    // must_appear (not must_replace_source): old total digits may legitimately
    // equal an unrelated fee elsewhere (TP12) — never global digit scrub.
    addRequired(
      'contract.totalPrice',
      [],
      [dataset.finances.contractValueFormatted],
      'must_appear',
      totalBlockIds.length > 0
        ? [{ kind: 'payment_clause', blockIds: totalBlockIds }]
        : undefined,
    )
    addRequired(
      'contract.totalPriceWords',
      [],
      [dataset.finances.contractValueWords],
      'must_appear_in_relevant_context',
      totalBlockIds.length > 0
        ? [{ kind: 'payment_clause', blockIds: totalBlockIds }]
        : undefined,
    )
    if (totalEvidence.length > 0) {
      requiredReplacements.push({
        canonicalField: 'contract.totalPrice',
        sourceValues: totalEvidence.map((e) => e.sourceAmount),
        targetRenderedValues: [dataset.finances.contractValueFormatted],
        sourceBlockIds: totalBlockIds,
        requiredContextBlockIds: totalBlockIds,
        replacementPolicy: 'replace_in_contexts',
      })
      if (totalEvidence.some((e) => e.hasWords)) {
        requiredReplacements.push({
          canonicalField: 'contract.totalPriceWords',
          sourceValues: [],
          targetRenderedValues: [dataset.finances.contractValueWords],
          sourceBlockIds: totalBlockIds,
          requiredContextBlockIds: totalBlockIds,
          replacementPolicy: 'replace_in_contexts',
        })
      }
    }
  }
  if (dataset.finances.depositFormatted && represented.deposit) {
    const depositSources = [
      'PLACEHOLDER_ZADATEK',
      'PLACEHOLDER_ZADATEK zł',
    ].filter((v) => blocks.some((b) => b.text.includes(v.replace(' zł', '')) || b.text.includes(v)))
    addRequired(
      'contract.depositAmount',
      depositSources,
      [
        dataset.finances.depositFormatted,
        dataset.finances.depositWords ?? '',
      ].filter(Boolean),
      'must_appear',
    )
  }
  if (dataset.finances.remainingFormatted && represented.remaining) {
    const remainingSources = [
      'PLACEHOLDER_RESTA',
      'PLACEHOLDER_RESTA zł',
    ].filter((v) =>
      blocks.some(
        (b) => b.text.includes('PLACEHOLDER_RESTA') || b.text.includes(v),
      ),
    )
    addRequired(
      'contract.remainingAmount',
      remainingSources,
      [
        dataset.finances.remainingFormatted,
        dataset.finances.remainingWords ?? '',
      ].filter(Boolean),
      'must_appear',
    )
  }
  if (
    dataset.finances.depositFormatted &&
    dataset.finances.remainingFormatted &&
    represented.deposit &&
    represented.remaining
  ) {
    // Exact one-time-payment phrases only — do not stem-match bare "płatne".
    addRequired(
      'contract.paymentStructure',
      ['płatne jednorazowo'],
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

  // multi-location summary only for generic (role-unknown) location rows —
  // never overwrite role-specific prep/ceremony/reception evidence blocks.
  if (
    (prep || ceremony || reception) &&
    filledLocationEvidence.some((e) => e.role === 'unknown')
  ) {
    const summary = renderMultiLocationSummary({
      preparation: prep,
      ceremony,
      reception,
    })
    const unknownIds = filledLocationEvidence
      .filter((e) => e.role === 'unknown')
      .map((e) => e.blockId)
    if (summary && unknownIds.length > 0) {
      requiredReplacements.push({
        canonicalField: 'wedding.receptionLocation',
        sourceValues: filledLocationEvidence
          .filter((e) => e.role === 'unknown' && !e.nonSemanticSurface)
          .map((e) => e.sourceText),
        targetRenderedValues: [summary],
        sourceBlockIds: unknownIds,
        requiredContextBlockIds: unknownIds,
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
  if (
    dataset.finances.depositFormatted &&
    dataset.finances.remainingFormatted &&
    represented.deposit &&
    represented.remaining
  ) {
    consistencyRules.push(
      'deposit_plus_remaining_equals_total',
      'payment_structure_matches_dataset',
    )
  }

  const additionalServices: import('./types').AdditionalServicesExpectation | undefined =
    dataset.additionalServicesExpectation ??
    (dataset.additionalServices && dataset.additionalServices.length > 0
      ? {
          expectedNames: dataset.additionalServices.map((s) => s.name),
          shouldAppear: true,
          pricesMustNotAppear: true,
          quantitiesMustNotAppear: true,
        }
      : undefined)

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
    ...(additionalServices ? { additionalServices } : {}),
    ...(filledPartyEvidence.length > 0
      ? { sourcePartyEvidence: filledPartyEvidence }
      : {}),
    ...(filledLocationEvidence.length > 0
      ? { sourceLocationEvidence: filledLocationEvidence }
      : {}),
    representedConcepts: represented,
  }
}
