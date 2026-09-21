/**
 * Golden Fix 2 — repeated represented facts (headline / summary surfaces).
 *
 * Formal party clauses and event sections are not the only grounded surfaces.
 * Short summary/headline lines that repeat customer names + wedding date must
 * update without global name/date scrubbing.
 */

import { formatDateLikeSource } from '@/features/ai-contract-lab/resolveTypedSourceSpan'
import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from '../types'
import { fingerprintText, textContainsNormalized } from './normalize'
import {
  extractIdentitySurfaces,
  type SourcePartyEvidence,
} from './partyFilledIdentity'
import type { DeterministicRepair } from './types'

export type SourceRepeatedFactEvidence = {
  blockId: string
  sourceText: string
  /** Party name surfaces grounded in this headline/summary. */
  partySurfaces: string[]
  /** Wedding-date surface when present (written or numeric). */
  weddingDateSurface: string | null
  kind: 'headline_summary'
}

const POLISH_LONG_DATE =
  /\b\d{1,2}\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+\d{4}(?:\s*r\.)?/i

const NUMERIC_DATE = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?:\s*r\.)?/i

const HEADLINE_CUE =
  /uroczystość|umowa\b|ślub\b|wesele\b|reportaż\b|·|—|–/i

function extractWeddingDateSurface(text: string): string | null {
  const long = text.match(POLISH_LONG_DATE)
  if (long?.[0]) return long[0].trim()
  const num = text.match(NUMERIC_DATE)
  if (num?.[0]) return num[0].trim()
  return null
}

function isExecutionOrSigningDateContext(text: string): boolean {
  return /data\s+(podpisania|zawarcia|sporządzenia)|zawarta\s+w\s+dniu|sporządzono|podpisano/i.test(
    text,
  )
}

function isProviderHeadline(text: string): boolean {
  return (
    /\b(NIP|REGON)\b/i.test(text) ||
    /zwan\w*\s+dalej\s+[„"]?(Filmowc|Fotograf|Kamerzyst|Wykonawc|Usługodawc)/i.test(
      text,
    )
  )
}

/**
 * Discover short summary/headline blocks that represent customer +/or wedding date
 * outside the formal party clause inventory.
 */
export function discoverRepeatedFactEvidence(input: {
  blocks: TransformDocumentBlock[]
  partyEvidence: SourcePartyEvidence[]
}): SourceRepeatedFactEvidence[] {
  const partyIds = new Set(input.partyEvidence.map((e) => e.blockId))
  const knownSurfaces = new Set(
    input.partyEvidence.flatMap((e) => e.identitySurfaces),
  )
  const out: SourceRepeatedFactEvidence[] = []

  for (const b of input.blocks) {
    if (partyIds.has(b.blockId)) continue
    const text = (b.text ?? '').trim()
    if (!text || text.length > 160) continue
    if (b.kind === 'tableCell' && /data i czytelny podpis/i.test(text)) continue
    if (isExecutionOrSigningDateContext(text)) continue
    if (isProviderHeadline(text)) continue
    if (!HEADLINE_CUE.test(text) && !POLISH_LONG_DATE.test(text)) continue

    const localSurfaces = extractIdentitySurfaces(text)
    const weddingDateSurface = extractWeddingDateSurface(text)
    // Must carry party-like surfaces OR share a known party surface token
    const sharesParty =
      localSurfaces.length > 0 ||
      [...knownSurfaces].some((s) => s.length >= 5 && text.includes(s))

    if (!sharesParty && !weddingDateSurface) continue
    // Require headline cue OR date+names combo to avoid random short paras
    if (!HEADLINE_CUE.test(text) && !(sharesParty && weddingDateSurface)) {
      continue
    }

    out.push({
      blockId: b.blockId,
      sourceText: text,
      partySurfaces:
        localSurfaces.length > 0
          ? localSurfaces
          : [...knownSurfaces].filter((s) => text.includes(s)),
      weddingDateSurface,
      kind: 'headline_summary',
    })
  }

  return out
}

function canonicalWeddingDateForSurface(
  dataset: ContractTransformationDataset,
  sourceDateSurface: string | null,
): string {
  const canon = dataset.dates.weddingDate.trim()
  if (!sourceDateSurface) return canon
  // Prefer source style (long Polish vs dotted)
  try {
    // dataset weddingDate is often "18.09.2027 r." — formatDateLikeSource wants ISO-ish
    const m = canon.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
    if (m) {
      let y = m[3]!
      if (y.length === 2) y = `20${y}`
      const iso = `${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
      return formatDateLikeSource({
        canonicalDate: iso,
        sourceText: sourceDateSurface,
      })
    }
  } catch {
    /* fall through */
  }
  return canon
}

/**
 * Deterministic completeness for grounded headline/summary repeated facts.
 */
export function repairRepeatedFactSurfaces(input: {
  blocks: TransformedBlock[]
  evidence: SourceRepeatedFactEvidence[]
  dataset: ContractTransformationDataset
}): { blocks: TransformedBlock[]; repairs: DeterministicRepair[] } {
  const repairs: DeterministicRepair[] = []
  const blocks = input.blocks.map((b) => ({ ...b }))
  const display = input.dataset.clients.displayNames?.trim() ?? ''
  if (!display && input.evidence.length === 0) return { blocks, repairs }

  for (const ev of input.evidence) {
    const idx = blocks.findIndex((b) => b.blockId === ev.blockId)
    if (idx < 0) continue
    let text = blocks[idx]!.text
    const before = text

    // Party: replace longest grounded surfaces first
    if (display) {
      const already = textContainsNormalized(text, display)
      if (!already) {
        const surfaces = [...ev.partySurfaces].sort(
          (a, b) => b.length - a.length,
        )
        // Prefer replacing a multi-name span "A i B" as one unit when present
        const pairSpan = text.match(
          /([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)?)(?:\s+i\s+|\s+oraz\s+)([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)?)/,
        )
        if (pairSpan?.[0] && surfaces.some((s) => pairSpan[0]!.includes(s) || s.includes(pairSpan[1]!))) {
          text = text.replace(pairSpan[0], display)
        } else {
          for (const s of surfaces) {
            if (s.length >= 5 && text.includes(s)) {
              text = text.split(s).join(display)
              break
            }
          }
        }
      }
    }

    // Wedding date
    if (ev.weddingDateSurface) {
      const target = canonicalWeddingDateForSurface(
        input.dataset,
        ev.weddingDateSurface,
      )
      if (
        text.includes(ev.weddingDateSurface) &&
        !textContainsNormalized(text, target) &&
        !textContainsNormalized(text, input.dataset.dates.weddingDate)
      ) {
        text = text.replace(ev.weddingDateSurface, target)
      }
    }

    if (text === before) continue
    repairs.push({
      repairCode: 'repair_repeated_fact_headline_surface',
      blockId: ev.blockId,
      canonicalField: 'customer.names',
      beforeFingerprint: fingerprintText(before),
      afterFingerprint: fingerprintText(text),
    })
    blocks[idx] = { ...blocks[idx]!, text }
  }

  return { blocks, repairs }
}
