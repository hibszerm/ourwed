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
      const surfaces = extractIdentitySurfaces(text)
      if (surfaces.length === 0 && text.trim().length < 3) continue
      evidence.push({
        blockId: b.blockId,
        sourceText: text,
        identitySurfaces:
          surfaces.length > 0 ? surfaces : [text.trim()].filter((s) => s.length >= 3),
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
    const hasCanonical =
      display.length > 0 &&
      (textContainsNormalized(block.text, display) ||
        nameTokens.some((t) => textContainsNormalized(block.text, t)))
    if (display && !hasCanonical) {
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
  const partyIds = new Set(input.partyEvidence.map((e) => e.blockId))
  const partySurfaces = new Set(
    input.partyEvidence.flatMap((e) => e.identitySurfaces),
  )

  for (const src of input.sourceBlocks) {
    if (partyIds.has(src.blockId)) continue
    const next = input.transformedBlocks.find((b) => b.blockId === src.blockId)
    if (!next || next.text === src.text) continue

    // Signature labels are restored deterministically — never flag as role rewrite
    if (/data i czytelny podpis|—\s*data i czytelny/i.test(src.text)) continue

    // Authorized wedding-fact blocks (locations / money / dates / party address / package)
    if (
      /miejsce\s+przygotowa|miejsce\s+ceremoni|miejsce\s+wesel|przygotowań\s|:\s*ul\.\s|zł|słownie:|data\s+ślub|zawarta\s+w\s|zam\.\s|zamieszkał|pakiet\s+[A-ZĄĆĘŁŃÓŚŹŻ]/i.test(
        src.text,
      )
    ) {
      continue
    }

    // MIXED / customer party clauses may legitimately change
    if (classifyFactOwner(src.text) === 'MIXED') continue

    // If source already contained a real party identity surface, change may be required
    const touchesParty = [...partySurfaces].some((s) => src.text.includes(s))
    if (touchesParty) continue

    const looksProviderLegal =
      /portfolio|prawa\s+autorsk|przysługuj|nie\s+wyraża\s+zgody\s+na\s+jak[aą]kolwiek\s+ingerenc|odpowiedzialno[sś][cć]|odst[aą]pien|anulowa|rezygnacj|ochron[ay]\s+danych|\bRODO\b|publikacj\w*\s+materia/i.test(
        src.text,
      )

    const hasProviderRoleNoun =
      /Fotograf|Filmowc|Kamerzyst|Wykonawc|Usługodawc|Par[aą]\s+Młod/i.test(
        src.text,
      )

    // Role-noun / legal prose with no canonical wedding fact → must stay sparse
    if (!looksProviderLegal && !hasProviderRoleNoun) continue

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
