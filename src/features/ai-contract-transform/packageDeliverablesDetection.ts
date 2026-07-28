/**
 * Detect package introduction + forward-only deliverables list for additional-services placement.
 */

import { normalizeLabel } from './tableRowOwnership'
import type { TransformDocumentBlock } from './types'

export type PackageIntroductionAnchor = {
  blockId: string
  blockIndex: number
  confidence: number
  rationale: string
}

export type PackageDeliverablesAnchor = {
  lastDeliverableBlockId: string
  packageIntroductionBlockId: string
  packageIntroductionBlockIndex: number
  lastDeliverableIndex: number
  scanStartIndex: number
  scanEndIndex: number
  boundaryBlockId?: string
  confidence: number
  rationale: string
  rejectedCandidates?: Array<{ blockId: string; reason: string }>
}

const PACKAGE_INTRO_SCORERS: Array<{ re: RegExp; score: number; label: string }> = [
  {
    re: /para\s+mlod[aoy]?\s+wybiera\s+wykonanie.*pakiet/i,
    score: 0.96,
    label: 'para_młoda_wybiera_pakiet',
  },
  {
    re: /zamawiajacy\s+wybiera\s+pakiet.*obejmuje/i,
    score: 0.94,
    label: 'zamawiający_wybiera_pakiet',
  },
  {
    re: /ktory\s+obejmuje\s+wykonanie/i,
    score: 0.92,
    label: 'który_obejmuje_wykonanie',
  },
  {
    re: /w\s+ramach\s+wybranego\s+pakietu.*wykona/i,
    score: 0.9,
    label: 'w_ramach_pakietu',
  },
  {
    re: /pakiet\s+obejmuje/i,
    score: 0.85,
    label: 'pakiet_obejmuje',
  },
  {
    re: /zakres\s+pakietu/i,
    score: 0.82,
    label: 'zakres_pakietu',
  },
  {
    re: /przedmiotem\s+umowy\s+jest\s+wykonanie/i,
    score: 0.72,
    label: 'przedmiotem_umowy',
  },
]

const DELIVERABLE_KEYWORDS =
  /teledysk|film[uoa]?\s+slub|mini\s+sesj|galeri|album|pendrive|odbitk|trailer|rolk|material\s+elektroniczn|wersji\s+elektroniczn|reportaz|montaz|vhs|instax/i

const OVERTIME_PATTERNS = [
  /dodatkow[aą]\s+godzin/i,
  /kazd[aą]\s+kolejn[aą]\s+godzin/i,
  /doplat[aą]\s+za\s+godzin/i,
  /koszt\s+dodatkowej\s+godziny/i,
  /stawka\s+godzinow/i,
  /przedluzenie\s+reportaz/i,
  /reportaz\s+maksymalnie\s+do\s+godziny/i,
  /czas\s+pracy\s+filmowc/i,
  /czas\s+pracy\s+fotograf/i,
  /maksymalnie\s+\d+\s+godzin/i,
  /kazda\s+dodatkowa\s+godzina/i,
]

const COMMERCIAL_RULE_PATTERNS = [
  /\d[\d\s]*\s*zł/,
  /\bpln\b/i,
  /\bkoszt\b/i,
  /\bcena\b/i,
  /\bplatnosc\b/i,
  /\btermin\b/i,
  /wynagrodzen/i,
  /zobowiazuje\s+sie\s+zaplacic/i,
  /maksymalnie\s+\d+\s+godzin/i,
]

const STOP_BOUNDARY_PATTERNS = [
  /^§\s*\d+/,
  /filmowiec\s+wykonuje\s+przedmiot/i,
  /fotograf\s+wykonuje\s+przedmiot/i,
  /wykonawca\s+wykonuje\s+przedmiot/i,
  /filmowiec\s+przekaze/i,
  /fotograf\s+przekaze/i,
  /wykonawca\s+przekaze/i,
  /z\s+tytulu\s+wykonania/i,
  /wynagrodzen/i,
  /platnosc/i,
  /platne\s+jednorazowo/i,
  /zadatek/i,
  /termin\s+platnosci/i,
  /odpowiedzialnosc/i,
  /odstapienie\s+od\s+umowy/i,
  /dane\s+osobowe/i,
  /prawa\s+autorsk/i,
  /rekojmia/i,
  /podpis/i,
  /strony\s+umowy/i,
]

const SIGNATURE_LABEL_ONLY = [
  /^para\s+mlod[aą]?$/i,
  /^zamawiajacy$/i,
  /^(filmowiec|fotograf|wykonawca)$/i,
]

const PAYMENT_PATTERNS =
  /wynagrodzen|platnosc|platne|przelew|zadatek|pozostal|termin.*zaplat|rachunek\s+bankowy|z\s+tytulu\s+wykonania/i

function norm(text: string): string {
  return normalizeLabel(text)
}

export function isOvertimeProvisionBlock(text: string): boolean {
  const n = norm(text)
  return OVERTIME_PATTERNS.some((re) => re.test(n))
}

export function isDeliveryDeadlineBlock(text: string): boolean {
  const n = norm(text)
  return /termin\s+(dostaw|odbior|realizacji)|przekaze.*w\s+terminie/i.test(n)
}

/** Product names like Album 30×30 are deliverables despite digits. */
function isLikelyProductDeliverableName(text: string): boolean {
  const n = norm(text)
  return /album\s*\d|30x30|teledysk|pendrive|instax|vhs/i.test(n)
}

export function isCommercialRuleBlock(text: string): boolean {
  if (isOvertimeProvisionBlock(text)) return true
  if (isDeliveryDeadlineBlock(text)) return true
  if (isPaymentBlock(text)) return true
  const n = norm(text)
  if (isLikelyProductDeliverableName(text)) return false
  return COMMERCIAL_RULE_PATTERNS.some((re) => re.test(n))
}

export function isStopBoundaryBlock(text: string): boolean {
  const n = norm(text)
  if (!n) return false
  return STOP_BOUNDARY_PATTERNS.some((re) => re.test(n))
}

export function isSignatureBlock(block: TransformDocumentBlock): boolean {
  const t = block.text.trim()
  const n = norm(t)
  if (!t) return false
  if (SIGNATURE_LABEL_ONLY.some((re) => re.test(n))) return true
  if (/^\.{4,}$/.test(t) || /^_{4,}$/.test(t)) return true
  if (/podpis/i.test(n) && t.length < 80) return true
  if (/miejscowosc\s+i\s+data/i.test(n) && t.length < 120) return true
  if (
    block.kind === 'tableCell' &&
    block.tableContext &&
    block.tableContext.cellIndex <= 1
  ) {
    const rowCells = block.tableContext.neighboringCellTexts ?? []
    const combined = [t, ...rowCells].map(norm).join(' ')
    if (
      /para\s+mlod|zamawiajacy/.test(combined) &&
      /filmowiec|fotograf|wykonawca/.test(combined)
    ) {
      return true
    }
    const label = norm(block.tableContext.rowLabelText || '')
    if (/para\s+mlod|zamawiajacy|filmowiec|fotograf|wykonawca/.test(label)) {
      return true
    }
  }
  return false
}

export function isPaymentBlock(text: string): boolean {
  return PAYMENT_PATTERNS.test(norm(text))
}

export function findSignatureStartIndex(
  blocks: TransformDocumentBlock[],
): number {
  for (let i = 0; i < blocks.length; i++) {
    if (isSignatureBlock(blocks[i]!)) return i
  }
  return blocks.length
}

export function findPaymentStartIndex(
  blocks: TransformDocumentBlock[],
): number {
  for (let i = 0; i < blocks.length; i++) {
    if (isPaymentBlock(blocks[i]!.text)) return i
  }
  return blocks.length
}

function scorePackageIntroduction(text: string): {
  score: number
  label: string
} | null {
  const n = norm(text)
  if (!n) return null
  let best: { score: number; label: string } | null = null
  for (const s of PACKAGE_INTRO_SCORERS) {
    if (s.re.test(n) && (!best || s.score > best.score)) {
      best = { score: s.score, label: s.label }
    }
  }
  if (/obejmuje\s+wykonanie.*:\s*$/i.test(text.trim()) && (!best || best.score < 0.88)) {
    return { score: 0.88, label: 'obejmuje_wykonanie_colon' }
  }
  if (/obejmuje\s*:\s*$/i.test(text.trim()) && (!best || best.score < 0.65)) {
    return { score: 0.65, label: 'obejmuje_colon' }
  }
  return best
}

/** Find the highest-confidence package-introduction block before signatures. */
export function detectPackageIntroductionAnchor(
  blocks: TransformDocumentBlock[],
  maxBeforeIndex: number = blocks.length,
): PackageIntroductionAnchor | null {
  let best: PackageIntroductionAnchor | null = null
  for (let i = 0; i < maxBeforeIndex; i++) {
    const hit = scorePackageIntroduction(blocks[i]!.text)
    if (!hit || hit.score < 0.65) continue
    if (!best || hit.score > best.confidence) {
      best = {
        blockId: blocks[i]!.blockId,
        blockIndex: i,
        confidence: hit.score,
        rationale: hit.label,
      }
    }
  }
  return best
}

function isNumberedSectionHeading(text: string): boolean {
  return /^§\s*\d+/i.test(text.trim())
}

function isDeliverableItem(text: string, prevWasDeliverable: boolean): boolean {
  const t = text.trim()
  if (!t) return false
  if (
    isCommercialRuleBlock(t) ||
    isOvertimeProvisionBlock(t) ||
    isStopBoundaryBlock(t) ||
    isPaymentBlock(t)
  ) {
    return false
  }
  if (scorePackageIntroduction(t)) return false
  if (/^[\-–•]/.test(t)) return true
  if (DELIVERABLE_KEYWORDS.test(norm(t))) return true
  if (/;\s*$/.test(t) && (DELIVERABLE_KEYWORDS.test(norm(t)) || prevWasDeliverable)) {
    return true
  }
  if (prevWasDeliverable && t.length < 220) return true
  return false
}

function validateDeliverablesAnchor(input: {
  blocks: TransformDocumentBlock[]
  intro: PackageIntroductionAnchor
  lastDeliverableIndex: number
  boundaryIndex: number
  signatureStart: number
}): { ok: true } | { ok: false; reason: string } {
  const { intro, lastDeliverableIndex, boundaryIndex, signatureStart, blocks } =
    input
  if (lastDeliverableIndex <= intro.blockIndex) {
    return { ok: false, reason: 'BEFORE_PACKAGE_INTRO' }
  }
  if (lastDeliverableIndex >= boundaryIndex) {
    return { ok: false, reason: 'AFTER_BOUNDARY' }
  }
  if (lastDeliverableIndex >= signatureStart) {
    return { ok: false, reason: 'AFTER_BOUNDARY' }
  }
  const last = blocks[lastDeliverableIndex]!
  if (isOvertimeProvisionBlock(last.text)) {
    return { ok: false, reason: 'OVERTIME_PROVISION' }
  }
  if (isCommercialRuleBlock(last.text)) {
    return { ok: false, reason: 'COMMERCIAL_RULE' }
  }
  if (isPaymentBlock(last.text)) {
    return { ok: false, reason: 'PAYMENT_LANGUAGE' }
  }
  return { ok: true }
}

/**
 * Forward-only scan: package introduction → consecutive deliverables → stop.
 */
export function detectPackageDeliverablesAnchor(
  blocks: TransformDocumentBlock[],
  maxBeforeIndex: number = blocks.length,
): PackageDeliverablesAnchor | null {
  const intro = detectPackageIntroductionAnchor(blocks, maxBeforeIndex)
  if (!intro) return null

  const rejected: Array<{ blockId: string; reason: string }> = []
  const scanStart = intro.blockIndex + 1
  let lastDeliverableIndex = -1
  let prevDeliverable = false
  let scanEnd = scanStart

  for (let j = scanStart; j < maxBeforeIndex; j++) {
    const candidate = blocks[j]!
    const text = candidate.text
    scanEnd = j

    if (isStopBoundaryBlock(text) || isNumberedSectionHeading(text)) break
    if (isSignatureBlock(candidate)) break

    if (isOvertimeProvisionBlock(text)) {
      rejected.push({ blockId: candidate.blockId, reason: 'OVERTIME_PROVISION' })
      if (lastDeliverableIndex >= 0) break
      continue
    }
    if (isCommercialRuleBlock(text)) {
      rejected.push({ blockId: candidate.blockId, reason: 'COMMERCIAL_RULE' })
      if (lastDeliverableIndex >= 0) break
      continue
    }

    if (isDeliverableItem(text, prevDeliverable)) {
      lastDeliverableIndex = j
      prevDeliverable = true
      continue
    }

    if (lastDeliverableIndex >= 0) break
  }

  if (lastDeliverableIndex < 0) return null

  const boundaryIndex = findPostDeliverablesBoundaryIndex(
    blocks,
    lastDeliverableIndex,
  )
  const signatureStart = findSignatureStartIndex(blocks)
  const validation = validateDeliverablesAnchor({
    blocks,
    intro,
    lastDeliverableIndex,
    boundaryIndex,
    signatureStart,
  })
  if (!validation.ok) {
    rejected.push({
      blockId: blocks[lastDeliverableIndex]!.blockId,
      reason: validation.reason,
    })
    return null
  }

  const boundary =
    lastDeliverableIndex + 1 < blocks.length
      ? blocks[lastDeliverableIndex + 1]
      : undefined

  return {
    lastDeliverableBlockId: blocks[lastDeliverableIndex]!.blockId,
    packageIntroductionBlockId: intro.blockId,
    packageIntroductionBlockIndex: intro.blockIndex,
    lastDeliverableIndex,
    scanStartIndex: scanStart,
    scanEndIndex: scanEnd,
    boundaryBlockId: boundary?.blockId,
    confidence: Math.min(0.98, intro.confidence + 0.02),
    rationale: `package_deliverables_after_${intro.rationale}`,
    rejectedCandidates: rejected.length > 0 ? rejected : undefined,
  }
}

export function findPostDeliverablesBoundaryIndex(
  blocks: TransformDocumentBlock[],
  afterIndex: number,
): number {
  for (let i = afterIndex + 1; i < blocks.length; i++) {
    const b = blocks[i]!
    if (isStopBoundaryBlock(b.text) || isSignatureBlock(b)) return i
  }
  return blocks.length
}
