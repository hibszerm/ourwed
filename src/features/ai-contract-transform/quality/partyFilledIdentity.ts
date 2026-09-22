/**
 * CG7.1 — filled (non-placeholder) contracting-party identity discovery + gate.
 *
 * Structural discovery only — not a Polish declension engine and not a global
 * name scrubber. Pure provider-role blocks are excluded; MIXED provider+customer
 * paragraphs remain customer-grounded for the client half.
 */

import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from '../types'
import { normalizeForMatch, textContainsNormalized } from './normalize'
import {
  classifyFactOwner,
  extractCustomerAddressSurface,
  hasCustomerPartyMarkers,
  isSignatureOrClosingLabel,
  splitMixedPartyClause,
} from './partyOwnership'
import type { QualityIssue } from './types'

export type SourcePartyEvidence = {
  blockId: string
  sourceText: string
  /** Exact surface strings from the source party clause (scoped stale identity). */
  identitySurfaces: string[]
  /** When set, only this span is the customer-owned half of a MIXED clause. */
  customerHalfText?: string
  owner?: 'CUSTOMER' | 'MIXED'
}

/** Render canonical names in the grounded grammatical surface when the change is deterministic. */
export function renderCanonicalIdentityLikeSource(sourceSurface: string, canonicalDisplay: string): string | null {
  const sourcePeople = sourceSurface.split(/\s+i\s+|\s+oraz\s+/i).map((s) => s.trim()).filter(Boolean)
  const canonicalPeople = canonicalDisplay.split(/\s+i\s+|\s+oraz\s+/i).map((s) => s.trim()).filter(Boolean)
  if (sourcePeople.length !== canonicalPeople.length) return null
  const rendered = sourcePeople.map((source, index) => {
    const sourceTokens = source.split(/\s+/)
    const targetTokens = canonicalPeople[index]!.split(/\s+/)
    if (sourceTokens.length !== targetTokens.length) return null
    return sourceTokens.map((token, i) => {
      const target = targetTokens[i]!
      if (token === target) return target
      if (token.endsWith('ą') && target.endsWith('a')) return `${target.slice(0, -1)}${i === 0 ? 'ę' : 'ą'}` // feminine accusative
      if (token.endsWith('ę') && target.endsWith('a')) return `${target.slice(0, -1)}ę`
      if (token.endsWith('ego') && target.endsWith('y')) return `${target.slice(0, -1)}ego` // masculine genitive/accusative
      if (token.endsWith('a') && !target.endsWith('a') && /^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(token)) return `${target}a`
      return null
    }).every((value): value is string => value !== null)
      ? sourceTokens.map((token, i) => {
          const target = targetTokens[i]!
          if (token === target) return target
          if (token.endsWith('ą') && target.endsWith('a')) return `${target.slice(0, -1)}${i === 0 ? 'ę' : 'ą'}`
          if (token.endsWith('ę') && target.endsWith('a')) return `${target.slice(0, -1)}ę`
          if (token.endsWith('ego') && target.endsWith('y')) return `${target.slice(0, -1)}ego`
          return `${target}a`
        }).join(' ')
      : null
  })
  return rendered.every((value): value is string => value !== null) ? rendered.join(' i ') : null
}

/**
 * Replace an exact, independently established source identity with the CRM
 * identity. The caller must provide the source identity for the mapped
 * customer slot; this function never derives identity from the CRM value.
 */
export function renderExactCanonicalIdentity(
  sourceSurface: string,
  sourceIdentity: string | undefined,
  canonicalDisplay: string,
): string | null {
  if (!sourceIdentity || sourceIdentity.trim().split(/\s+/).length < 2) return null
  if (normalizeForMatch(sourceSurface) !== normalizeForMatch(sourceIdentity)) return null
  return canonicalDisplay.trim() || null
}

const PROVIDER_BLOCK =
  /\b(NIP|REGON|firm[aą]|Studio|Photography|Productions|zwan\w*\s+dalej\s+[„"]?(Filmowc|Fotograf|Kamerzyst|Wykonawc|Usługodawc))/i

const CLIENT_PARTY_MARKER =
  /zwan[a-ząćęłńóśźż]*\s+dalej\s+[„"]?(Zamawiając|Parą\s+Młod|Klient)|Klientami\s+są|Klientem\s+jest|Klient:\s|Zamawiający:\s|Zamawiając[a-ząćęłńóśźż]*\s+są|Pomiędzy:\s*[A-ZĄĆĘŁŃÓŚŹŻ]|,\s*zam\./i

/** Provider / studio identity clause — must not be treated as contracting client. */
export function isProviderIdentityBlock(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  // MIXED opening clauses contain both sides — not pure provider.
  if (classifyFactOwner(t) === 'MIXED') return false
  if (hasCustomerPartyMarkers(t)) return false
  if (PROVIDER_BLOCK.test(t) && !/Zamawiając|Parą\s+Młod|Klientami\s+są|Klient/i.test(t)) {
    return true
  }
  // Explicit provider-role closing label without client markers
  if (
    /zwan\w*\s+dalej\s+[„"]?(Filmowc|Fotograf|Kamerzyst|Wykonawc)/i.test(t) &&
    !/Zamawiając|Parą\s+Młod|Klient/i.test(t)
  ) {
    return true
  }
  return false
}

/** Structurally likely contracting-client identity clause (includes MIXED). */
export function isClientPartyIdentityBlock(text: string): boolean {
  const t = text.trim()
  if (!t || t.length < 12) return false
  if (isSignatureOrClosingLabel(t)) return false
  if (classifyFactOwner(t) === 'MIXED') return true
  if (isProviderIdentityBlock(t)) return false
  if (CLIENT_PARTY_MARKER.test(t)) return true
  // Table-ish short party rows often lack "zwaną dalej" but sit under customer ownership
  return false
}

export { extractCustomerAddressSurface }

/**
 * Extract name-like surfaces from a party clause (including declined forms).
 * Conservative: Capitalized Word pairs / single declined given+family.
 */
export function extractIdentitySurfaces(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (s: string) => {
    const t = s.trim()
    if (t.length < 5) return
    // Role / party-status labels are NOT contracting-client identity.
    if (
      /^Par[aą]\s+Młod/i.test(t) ||
      /^Zamawiając/i.test(t) ||
      /^Klient(?:ami|em|ka)?$/i.test(t) ||
      /^Wykonawc/i.test(t) ||
      /^Fotograf/i.test(t)
    ) {
      return
    }
    if (
      /Studio|Sp\.|Poznań|Kraków|Warszawa|Gdańsk|Wrocław|Katowice|Lipowa|Kwiatowa|Garbary|Filmowc|Fotograf|Kamerzyst|Wykonawc|Usługodawc|Zamawiając|Par[aą]\s+Młod/i.test(
        t,
      )
    ) {
      return
    }
    if (seen.has(t)) return
    seen.add(t)
    out.push(t)
  }

  // Avoid \\b — JS word boundaries break on Polish diacritics (ą/ę/ł…).
  const pairRe =
    /(?:^|[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż])([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,})(?:\s+)([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,})(?=[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]|$)/g
  let m: RegExpExecArray | null
  while ((m = pairRe.exec(text))) {
    push(`${m[1]} ${m[2]}`)
  }

  const oraz = text.match(
    /([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,})\s+oraz\s+([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,})/,
  )
  if (oraz) {
    push(oraz[1]!)
    push(oraz[2]!)
  }

  return out
}

function tableIdentityPrefix(text: string): string {
  // DOCX runs in one table cell may be concatenated by extraction. Names are
  // the leading identity surface; address, PESEL, email and phone data are not.
  const boundary = text.search(
    /(?:ul\.|al\.|os\.|pl\.|PESEL|NIP|REGON|@|\+48|\b\d{2}-\d{3}\b)/i,
  )
  const prefix = boundary >= 0 ? text.slice(0, boundary) : text
  return prefix.replace(/([a-ząćęłńóśźż])(?=(?:ul\.|al\.|os\.|pl\.))/i, '$1 ')
}

function isTableIdentityCell(block: TransformDocumentBlock): boolean {
  if (block.kind !== 'tableCell' || block.tableContext?.ownershipFamily !== 'customer') {
    return false
  }
  if (block.cellIndex === 0) return false
  const header = block.tableContext.columnHeaderText ?? ''
  if (/kontakt|e-?mail|telefon/i.test(header)) return false
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(block.text)) return false
  return extractIdentitySurfaces(tableIdentityPrefix(block.text)).length > 0
}

export function discoverFilledPartyEvidence(
  blocks: TransformDocumentBlock[],
): SourcePartyEvidence[] {
  const evidence: SourcePartyEvidence[] = []

  for (const b of blocks) {
    const text = b.text ?? ''
    if (isSignatureOrClosingLabel(text)) continue

    if (b.tableContext?.ownershipFamily === 'customer') {
      // Skip pure labels
      if (
        b.kind === 'tableCell' &&
        b.tableContext.rowLabelText &&
        text.trim() === b.tableContext.rowLabelText.trim()
      ) {
        continue
      }
      if (!isTableIdentityCell(b)) continue
      const surfaces = extractIdentitySurfaces(tableIdentityPrefix(text))
      if (surfaces.length === 0) continue
      evidence.push({
        blockId: b.blockId,
        sourceText: text,
        identitySurfaces: surfaces,
        owner: 'CUSTOMER',
      })
      continue
    }

    if (isClientPartyIdentityBlock(text)) {
      const owner = classifyFactOwner(text) === 'MIXED' ? 'MIXED' : 'CUSTOMER'
      const split = owner === 'MIXED' ? splitMixedPartyClause(text) : null
      const surfaceSource = split?.customerHalf ?? text
      evidence.push({
        blockId: b.blockId,
        sourceText: text,
        identitySurfaces: extractIdentitySurfaces(surfaceSource),
        ...(split ? { customerHalfText: split.customerHalf } : {}),
        owner,
      })
    }
  }

  return evidence
}

function canonicalNameTokens(displayNames: string): string[] {
  return displayNames
    .split(/\s+i\s+|\s+oraz\s+|,/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)
}

/**
 * Separate customer table rows represent separate people. Assign canonical
 * identities in structural row order when their count matches the dataset;
 * prose and combined slots retain the complete display identity.
 */
export function canonicalPartyIdentityTargets(input: {
  evidence: SourcePartyEvidence[]
  sourceBlocks: TransformDocumentBlock[]
  dataset: ContractTransformationDataset
}): Map<string, string> {
  const display = input.dataset.clients.displayNames?.trim() ?? ''
  const targets = new Map(input.evidence.map((e) => [e.blockId, display]))
  const tableEvidence = input.evidence
    .map((e) => ({ e, block: input.sourceBlocks.find((b) => b.blockId === e.blockId) }))
    .filter(
      (item): item is { e: SourcePartyEvidence; block: TransformDocumentBlock } =>
        Boolean(item.block?.tableContext && item.block.kind === 'tableCell'),
    )
    .sort(
      (a, b) =>
        (a.block.tableContext!.tableIndex - b.block.tableContext!.tableIndex) ||
        (a.block.tableContext!.rowIndex - b.block.tableContext!.rowIndex) ||
        (a.block.tableContext!.cellIndex - b.block.tableContext!.cellIndex),
    )
  const names = canonicalNameTokens(display)
  if (
    input.dataset.clients.personCount === 2 &&
    tableEvidence.length === 2 &&
    names.length === 2
  ) {
    tableEvidence.forEach(({ e }, index) => targets.set(e.blockId, names[index]!))
  }
  return targets
}

/**
 * Mode A / quality: identified party blocks must carry canonical clients and
 * must not retain scoped stale identity surfaces.
 */
export function verifyFilledPartyIdentity(input: {
  evidence: SourcePartyEvidence[]
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: TransformedBlock[]
  dataset: ContractTransformationDataset
}): QualityIssue[] {
  const issues: QualityIssue[] = []
  if (input.evidence.length === 0) return issues

  const display = input.dataset.clients.displayNames?.trim() ?? ''
  const personCount = input.dataset.clients.personCount ?? 1
  const nameTokens = canonicalNameTokens(display)
  const byId = new Map(input.transformedBlocks.map((b) => [b.blockId, b]))
  const targets = canonicalPartyIdentityTargets({
    evidence: input.evidence,
    sourceBlocks: input.sourceBlocks,
    dataset: input.dataset,
  })

  for (const ev of input.evidence) {
    const src = input.sourceBlocks.find((s) => s.blockId === ev.blockId)
    // Skip pure placeholder slots — CG4 handles those
    if (src && /PLACEHOLDER_STRONY/.test(src.text)) continue

    const block = byId.get(ev.blockId)
    if (!block || !block.text.trim()) {
      issues.push({
        code: 'party_identity_block_empty',
        severity: 'blocking',
        canonicalField: 'customer.names',
        blockId: ev.blockId,
        safeDescription: 'Identified party identity block is empty after transform',
      })
      continue
    }

    // Canonical client presence (any primary name token)
    const target = targets.get(ev.blockId) ?? display
    const isStructuredTableCell = src?.kind === 'tableCell' && Boolean(src.tableContext)
    const hasCanonical = isStructuredTableCell
      ? target.length > 0 && textContainsNormalized(block.text, target)
      : display.length > 0 &&
        (textContainsNormalized(block.text, display) ||
          nameTokens.some((name) => textContainsNormalized(block.text, name)))
    if (target && !hasCanonical) {
      issues.push({
        code: 'party_identity_canonical_missing',
        severity: 'blocking',
        canonicalField: 'customer.names',
        blockId: ev.blockId,
        safeDescription:
          'Identified party block does not contain canonical client identity',
      })
    }

    // Scoped stale surfaces from THIS source party block
    for (const surface of ev.identitySurfaces) {
      if (!surface || surface.length < 4) continue
      // Don't treat canonical tokens as stale
      if (nameTokens.some((t) => normalizeForMatch(surface).includes(normalizeForMatch(t)))) {
        continue
      }
      // Scope stale check to customer half when MIXED
      const scopeText = ev.customerHalfText
        ? (() => {
            const split = block.text.includes(', a ')
              ? block.text.split(/,\s*a\s+/).slice(1).join(', a ')
              : block.text
            return split
          })()
        : block.text
      // Ignore email local-parts / URLs
      const scopeNoEmail = scopeText.replace(
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
        ' ',
      )
      if (scopeNoEmail.includes(surface)) {
        issues.push({
          code: 'stale_party_identity_remaining',
          severity: 'blocking',
          canonicalField: 'customer.names',
          blockId: ev.blockId,
          safeDescription:
            'Stale template contracting-client identity remains in identified party block',
        })
        break
      }
    }

    // One-person: inventing a second partner name in the party block
    if (personCount === 1) {
      if (/\boraz\b/i.test(block.text) && /[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+\s+[A-ZĄĆĘŁŃÓŚŹŻ]/.test(block.text)) {
        // "Anną Testową oraz ..." would be invention for one-person
        const parts = block.text.split(/\boraz\b/i)
        if (parts.length > 1 && /[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+/.test(parts[1] ?? '')) {
          issues.push({
            code: 'invented_second_party',
            severity: 'blocking',
            canonicalField: 'customer.names',
            blockId: ev.blockId,
            safeDescription: 'One-person wedding party block appears to invent a second person',
          })
        }
      }
    }
  }

  return issues
}

/**
 * Reject unnecessary rewrites of provider-role / copyright / legal blocks that
 * do not carry contracting-client identity needing change (sparse scope).
 */
export function verifyProviderRoleSparseScope(input: {
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: TransformedBlock[]
  partyEvidence: SourcePartyEvidence[]
}): QualityIssue[] {
  const issues: QualityIssue[] = []

  for (const src of input.sourceBlocks) {
    const next = input.transformedBlocks.find((b) => b.blockId === src.blockId)
    if (!next || next.text === src.text) continue
    const decision = classifyProviderLegalSurface({ sourceBlock: src, partyEvidence: input.partyEvidence })
    if (decision.classification !== 'provider_legal_only') continue

    issues.push({
      code: 'unnecessary_provider_role_rewrite',
      severity: 'blocking',
      blockId: src.blockId,
      safeDescription:
        'Provider-role / copyright / legal clause was rewritten without contracting-client identity needing change',
    })
  }

  return issues
}

export type ProviderLegalSurfaceDecision = {
  classification:
    | 'provider_legal_only'
    | 'mixed_or_party_owned'
    | 'canonical_fact_surface'
    | 'other'
  reasonCode: string
}

/** Shared ownership decision for pre-model protection and the final quality invariant. */
export function classifyProviderLegalSurface(input: {
  sourceBlock: TransformDocumentBlock
  partyEvidence: Pick<SourcePartyEvidence, 'blockId' | 'identitySurfaces'>[]
  canonicalRoles?: readonly string[]
}): ProviderLegalSurfaceDecision {
  const src = input.sourceBlock
  const partyIds = new Set(input.partyEvidence.map((e) => e.blockId))
  if (partyIds.has(src.blockId)) {
    return { classification: 'mixed_or_party_owned', reasonCode: 'grounded_party_surface' }
  }

  if (/data i czytelny podpis|—\s*data i czytelny/i.test(src.text)) {
    return { classification: 'canonical_fact_surface', reasonCode: 'signature_label' }
  }

  const hasTrustedRole = Boolean(
    input.canonicalRoles?.length || src.modelContext?.semanticRoles?.length ||
    (src.tableContext?.ownershipFamily && src.tableContext.ownershipFamily !== 'unknown' && src.tableContext.ownershipFamily !== 'provider'),
  )
  if (hasTrustedRole) {
    return { classification: 'canonical_fact_surface', reasonCode: 'grounded_canonical_role' }
  }

  // These are the quality gate's existing exceptions for represented CRM facts.
  if (
    /miejsce\s+przygotowa|miejsce\s+ceremoni|miejsce\s+wesel|przygotowań\s|:\s*ul\.\s|zł|słownie:|data\s+ślub|zawarta\s+w\s|zam\.\s|zamieszkał|pakiet\s+[A-ZĄĆĘŁŃÓŚŹŻ]/i.test(
      src.text,
    )
  ) {
    return { classification: 'canonical_fact_surface', reasonCode: 'represented_fact_surface' }
  }

  if (classifyFactOwner(src.text) === 'MIXED') {
    return { classification: 'mixed_or_party_owned', reasonCode: 'mixed_fact_ownership' }
  }

  const partySurfaces = input.partyEvidence.flatMap((e) => e.identitySurfaces)
  if (partySurfaces.some((surface) => src.text.includes(surface))) {
    return { classification: 'mixed_or_party_owned', reasonCode: 'contains_grounded_party_identity' }
  }

  const looksProviderLegal =
    /portfolio|prawa\s+autorsk|przysługuj|nie\s+wyraża\s+zgody\s+na\s+jak[aą]kolwiek\s+ingerenc|odpowiedzialno[sś][cć]|odst[aą]pien|anulowa|rezygnacj|ochron[ay]\s+danych|\bRODO\b|publikacj\w*\s+materia/i.test(
      src.text,
    )
  const hasProviderRoleNoun =
    /\b(?:Fotograf(?:em|owi|a|ie|u|owie)?|Filmowc(?:em|owi|a|ie|u|owie)?|Kamerzyst(?:ą|a|e|y|ce|ą)?|Wykonawc(?:a|ą|y|owi|ę|o)?|Usługodawc(?:a|ą|y|owi|ę|o)?)\b|\bPar[aą]\s+Młod[aą]\b/i.test(
      src.text,
    )

  return looksProviderLegal || hasProviderRoleNoun
    ? { classification: 'provider_legal_only', reasonCode: 'provider_legal_without_customer_fact' }
    : { classification: 'other', reasonCode: 'no_provider_legal_quality_evidence' }
}
