/**
 * Venue + coverage-time context classification.
 * Inventory first, score by local wedding/coverage context, unique assignment.
 */

import { canonicalizeParagraphText } from './canonicalParagraph'
import type { IndexedParagraph } from './extractDocxParagraphs'
import { validateMinimalSlotSpan } from './contractSlotSafety'
import { devInfoArgs } from '@/lib/debug/devConsole'

export type VenueConcept =
  | 'preparation_location'
  | 'ceremony_location'
  | 'reception_location'

export type VenueStage = 'preparation' | 'ceremony' | 'reception'

export interface VenueCandidate {
  sourceText: string
  paragraphIndex: number
  startOffset: number
  endOffset: number
  paragraphText: string
  localContext: string
  stageAnchors: string[]
  negativeAnchors: string[]
  scoreByConcept: Record<VenueConcept, number>
  selectedConcept: VenueConcept | null
  sharedVenueStages: VenueStage[]
  physicalSpanSafety: 'safe' | 'unsafe' | 'needs_review'
  reviewState: 'ok' | 'needs_review' | 'excluded'
  rejectionReason: string | null
  confidence: number
}

export interface TimeRangeCandidate {
  rawRange: string
  startText: string
  endText: string
  normalizedStart: string
  normalizedEnd: string
  paragraphIndex: number
  startOffset: number
  startEndOffset: number
  endOffset: number
  endEndOffset: number
  paragraphText: string
  localContext: string
  positiveAnchors: string[]
  negativeAnchors: string[]
  selectedStartConcept: 'coverage_start_time' | null
  selectedEndConcept: 'coverage_end_time' | null
  consistencyWithCoverageHours: boolean | null
  physicalSpanSafety: 'safe' | 'unsafe'
  reviewState: 'ok' | 'needs_review' | 'excluded'
  confidence: number
  rejectionReason: string | null
}

const HARD_NEGATIVE_VENUE = [
  /z\s+siedzib/i,
  /siedziba\s+firmy/i,
  /przy\s+ul\.?/i,
  /zamieszkał[ay]/i,
  /\badres\b/i,
  /zawarta\s+w\b/i,
  /sąd\s+właściwy/i,
  /\bNIP\b/i,
  /\bREGON\b/i,
  /\bKRS\b/i,
  /pod\s+firm/i,
  /działalność\s+gospodarcz/i,
]

const STAGE_PREP = /przygotowa[nń]/i
const STAGE_CEREMONY = /ceremoni|ślub(?:u|ie)?|kościół|USC|urząd\s+stanu/i
const STAGE_RECEPTION =
  /przyj[eę]ci|wesel|sala\s+weseln|dom\s+weseln|restauracj|hotel|zamek/i

const COMBINED_STAGES =
  /przygotowania[\s,\/]*ceremoni[ai][\s,\/]*(?:i\s+|oraz\s+)?(?:przyj[eę]cie|wesel)/i

const TIME_RANGE_RES = [
  /(?:od\s+)?(\d{1,2}[.:]\d{2})\s*[-–—]\s*(\d{1,2}[.:]\d{2})/gi,
  /(?:od\s+)(\d{1,2}[.:]\d{2})\s+do\s+(\d{1,2}[.:]\d{2})/gi,
  /(?:w\s+godzinach|godz\.?)\s+(\d{1,2}[.:]\d{2})\s*[-–—]\s*(\d{1,2}[.:]\d{2})/gi,
]

const TIME_POSITIVE = [
  /czas\s+pracy/i,
  /czas\s+realizacji\s+reportaż/i,
  /godziny\s+pracy/i,
  /filmowanie/i,
  /fotografowanie/i,
  /\bobsług/i,
  /reportaż/i,
  /rozpoczęcie\s+pracy/i,
  /zakończenie\s+pracy/i,
  /od\s+godziny/i,
  /do\s+godziny/i,
  /nieprzerwanie\s+od/i,
  /planowane\s+godziny/i,
  /nie\s+przekracza\s+\d+\s+godzin/i,
]

const TIME_NEGATIVE = [
  /dni\s+roboczych/i,
  /termin\s+oddania/i,
  /termin\s+realizacji/i,
  /przelew/i,
  /płatność/i,
  /w\s+ciągu/i,
  /najpóźniej/i,
  /od\s+dnia\s+ślubu/i,
  /data\s+zawarcia/i,
  /do\s+\d+\s+dni/i,
]

function normalizeClock(raw: string): string {
  const m = /^(\d{1,2})[.:](\d{2})$/.exec(raw.trim())
  if (!m) return raw.trim()
  return `${m[1]!.padStart(2, '0')}:${m[2]}`
}

function parseClockMinutes(normalized: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(normalized)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** Hours between start and end; overnight allowed when end < start. */
export function coverageHoursBetween(
  startNorm: string,
  endNorm: string,
): number | null {
  const a = parseClockMinutes(startNorm)
  const b = parseClockMinutes(endNorm)
  if (a == null || b == null) return null
  let mins = b - a
  if (mins < 0) mins += 24 * 60
  return mins / 60
}

function matchList(text: string, patterns: RegExp[]): string[] {
  return patterns.filter((re) => re.test(text)).map((re) => re.source.slice(0, 36))
}

function extractCombinedVenue(text: string): {
  venue: string
  start: number
  end: number
  stages: VenueStage[]
} | null {
  // “przygotowania, ceremonia, przyjęcie: ZINNAR CASTLE Kraków”
  const labeled =
    /((?:miejscami[^\n:]{0,40})?przygotowania[\s,\/]*ceremoni[ai][\s,\/]*(?:i\s+|oraz\s+)?(?:przyj[eę]cie|wesel)[^\n:]{0,40}):\s*([^\n.;]{3,80})/iu.exec(
      text,
    )
  if (labeled && labeled.index != null) {
    const venue = labeled[2]!.trim().replace(/^[,:\s]+/, '').replace(/[,;\s]+$/, '')
    const start = text.indexOf(venue, labeled.index)
    if (start >= 0 && venue.length >= 3) {
      return {
        venue,
        start,
        end: start + venue.length,
        stages: ['preparation', 'ceremony', 'reception'],
      }
    }
  }

  // “całość uroczystości / ślub i wesele odbędzie się w PLACE”
  const combinedIn =
    /(?:całość\s+uroczystości|wszystkie\s+wydarzenia|ślub\s+i\s+wesele|ceremonia\s+oraz\s+przyj[eę]cie)[^\n]{0,40}?\s+w\s+([A-ZĄĆĘŁŃÓŚŹŻ0-9][^\n.;]{2,70})/iu.exec(
      text,
    )
  if (combinedIn && combinedIn.index != null) {
    const venue = combinedIn[1]!.trim().replace(/[,;\s]+$/, '')
    const start = text.indexOf(venue, combinedIn.index)
    if (start >= 0) {
      return {
        venue,
        start,
        end: start + venue.length,
        stages: ['preparation', 'ceremony', 'reception'],
      }
    }
  }

  return null
}

function extractReceptionVenue(text: string): {
  venue: string
  start: number
  end: number
} | null {
  const left =
    /przyj[eę]cia\s+weselnego.{0,40}?\s+w\s+/i.exec(text) ??
    /przyj[eę]cie\s+weselne.{0,40}?\s+w\s+/i.exec(text) ??
    /wesele.{0,30}?\s+w\s+/i.exec(text)
  if (!left || left.index == null) return null
  const from = left.index + left[0].length
  const rest = text.slice(from)
  const right = /–\s*z\s+czego|[.;]|$/u.exec(rest)
  const endLocal = right ? right.index! : Math.min(rest.length, 80)
  let span = rest.slice(0, endLocal).trim()
  span = span.replace(/^[,:\s]+/, '').replace(/[,;\s]+$/, '')
  if (span.length < 2 || span.length > 100) return null
  const start = text.indexOf(span, from)
  if (start < 0) return null
  return { venue: span, start, end: start + span.length }
}

/** Stage-specific “odbędą/odbędzie się w PLACE” clauses. */
function extractStageSpecificVenues(text: string): Array<{
  venue: string
  start: number
  end: number
  stages: VenueStage[]
  preferredConcept: VenueConcept
}> {
  const patterns: Array<{
    left: RegExp
    stages: VenueStage[]
    preferredConcept: VenueConcept
    right: RegExp
  }> = [
    {
      left: /przygotowa[nń][^\n]{0,80}?odbęd[aą]\s+się\s+w\s+/iu,
      stages: ['preparation'],
      preferredConcept: 'preparation_location',
      right: /[.;]|$/u,
    },
    {
      left: /ceremoni[^\n]{0,80}?odbędzie\s+się\s+w\s+/iu,
      stages: ['ceremony'],
      preferredConcept: 'ceremony_location',
      right: /[.;]|$/u,
    },
  ]

  const out: Array<{
    venue: string
    start: number
    end: number
    stages: VenueStage[]
    preferredConcept: VenueConcept
  }> = []

  for (const p of patterns) {
    const left = p.left.exec(text)
    if (!left || left.index == null) continue
    // Skip if this is the combined “przygotowania, ceremonia, przyjęcie:” form
    if (COMBINED_STAGES.test(text.slice(Math.max(0, left.index - 5), left.index + 80))) {
      continue
    }
    const from = left.index + left[0].length
    const rest = text.slice(from)
    const right = p.right.exec(rest)
    const endLocal = right ? right.index! : Math.min(rest.length, 80)
    let span = rest.slice(0, endLocal).trim()
    span = span.replace(/^[,:\s]+/, '').replace(/[,;\s]+$/, '')
    if (span.length < 2 || span.length > 100) continue
    if (/^\d{1,2}[./-]\d{1,2}/.test(span)) continue
    const start = text.indexOf(span, from)
    if (start < 0) continue
    out.push({
      venue: span,
      start,
      end: start + span.length,
      stages: p.stages,
      preferredConcept: p.preferredConcept,
    })
  }
  return out
}

function isHardNegativeVenueContext(text: string): boolean {
  return HARD_NEGATIVE_VENUE.some((re) => re.test(text))
}

function scoreVenue(
  paragraphText: string,
  stages: VenueStage[],
): Record<VenueConcept, number> {
  const scores: Record<VenueConcept, number> = {
    preparation_location: 0,
    ceremony_location: 0,
    reception_location: 0,
  }
  if (stages.includes('preparation') || STAGE_PREP.test(paragraphText)) {
    scores.preparation_location += 4
  }
  if (stages.includes('ceremony') || STAGE_CEREMONY.test(paragraphText)) {
    scores.ceremony_location += 4
  }
  if (stages.includes('reception') || STAGE_RECEPTION.test(paragraphText)) {
    scores.reception_location += 4
  }
  if (COMBINED_STAGES.test(paragraphText) || stages.length >= 2) {
    // Prefer reception as primary canonical binding for combined venues
    scores.reception_location += 5
    scores.ceremony_location += 2
    scores.preparation_location += 2
  }
  if (/dokumentował|reportaż|uroczystości\s+są/i.test(paragraphText)) {
    scores.reception_location += 2
  }
  return scores
}

/**
 * Inventory venue candidates across paragraphs.
 */
export function inventoryVenueCandidates(
  paragraphs: IndexedParagraph[],
): VenueCandidate[] {
  const out: VenueCandidate[] = []
  const normalized = paragraphs.map((p) => ({
    index: p.index,
    text: canonicalizeParagraphText(p.text),
  }))

  for (let i = 0; i < normalized.length; i++) {
    const para = normalized[i]!
    if (!para.text.trim()) continue
    const prev = normalized[i - 1]?.text ?? ''
    const next = normalized[i + 1]?.text ?? ''
    const local = para.text

    if (isHardNegativeVenueContext(local) && !COMBINED_STAGES.test(local)) {
      continue
    }

    const combined = extractCombinedVenue(local)
    const stageSpecific = combined ? [] : extractStageSpecificVenues(local)
    const reception =
      combined || stageSpecific.length > 0
        ? null
        : extractReceptionVenue(local)

    const hits: Array<{
      venue: string
      start: number
      end: number
      stages: VenueStage[]
      preferredConcept?: VenueConcept
    }> = []

    if (combined) {
      hits.push({
        venue: combined.venue,
        start: combined.start,
        end: combined.end,
        stages: combined.stages,
        preferredConcept: 'reception_location',
      })
    } else {
      for (const s of stageSpecific) {
        hits.push({
          venue: s.venue,
          start: s.start,
          end: s.end,
          stages: s.stages,
          preferredConcept: s.preferredConcept,
        })
      }
      if (reception) {
        hits.push({
          venue: reception.venue,
          start: reception.start,
          end: reception.end,
          stages: ['reception'],
          preferredConcept: 'reception_location',
        })
      }
    }

    for (const hit of hits) {
    // Provider/client address hard exclude on the span itself
    if (isHardNegativeVenueContext(hit.venue)) continue
    if (
      /z\s+siedzib|zamieszkał|zawarta\s+w/i.test(
        local.slice(Math.max(0, hit.start - 40), hit.start),
      )
    ) {
      continue
    }

    const conceptKey = hit.preferredConcept ?? 'reception_location'
    const spanCheck = validateMinimalSlotSpan({
      registryKey: conceptKey,
      text: hit.venue,
      paragraphText: local,
      operation: 'replace',
    })

    const scores = scoreVenue(local, hit.stages)
    const stageAnchors = [
      ...(STAGE_PREP.test(local) ? ['preparation'] : []),
      ...(STAGE_CEREMONY.test(local) ? ['ceremony'] : []),
      ...(STAGE_RECEPTION.test(local) ? ['reception'] : []),
      ...(COMBINED_STAGES.test(local) ? ['combined'] : []),
    ]
    const negativeAnchors = matchList(local, HARD_NEGATIVE_VENUE)

    let selected: VenueConcept | null =
      hit.preferredConcept ?? 'reception_location'
    if (!hit.preferredConcept) {
      if (hit.stages.length === 1 && hit.stages[0] === 'ceremony') {
        selected = 'ceremony_location'
      } else if (hit.stages.length === 1 && hit.stages[0] === 'preparation') {
        selected = 'preparation_location'
      }
    }

    const item: VenueCandidate = {
      sourceText: hit.venue,
      paragraphIndex: para.index,
      startOffset: hit.start,
      endOffset: hit.end,
      paragraphText: local,
      localContext: local.slice(
        Math.max(0, hit.start - 80),
        Math.min(local.length, hit.end + 40),
      ),
      stageAnchors,
      negativeAnchors,
      scoreByConcept: scores,
      selectedConcept: spanCheck.ok ? selected : null,
      sharedVenueStages: hit.stages,
      physicalSpanSafety: spanCheck.ok ? 'safe' : 'unsafe',
      reviewState: spanCheck.ok ? 'ok' : 'needs_review',
      rejectionReason: spanCheck.ok
        ? null
        : (spanCheck.blockingReasons[0] ?? 'unsafe span'),
      confidence: spanCheck.ok ? 0.94 : 0.4,
    }

    // Soft context: prev/next unused for scoring (avoid bleed) — kept in logs via local
    void prev
    void next
    out.push(item)
    }
  }

  // Unique winner per venue concept (highest score)
  for (const concept of [
    'reception_location',
    'ceremony_location',
    'preparation_location',
  ] as VenueConcept[]) {
    const ranked = [...out]
      .filter((c) => c.selectedConcept === concept && c.reviewState === 'ok')
      .sort(
        (a, b) =>
          b.scoreByConcept[concept] - a.scoreByConcept[concept],
      )
    if (ranked.length > 1) {
      const winner = ranked[0]!
      for (const c of out) {
        if (
          c !== winner &&
          c.selectedConcept === concept &&
          `${c.paragraphIndex}:${c.startOffset}` !==
            `${winner.paragraphIndex}:${winner.startOffset}`
        ) {
          c.selectedConcept = null
          c.reviewState = 'needs_review'
          c.rejectionReason = 'superseded_by_better_venue_candidate'
          c.confidence = 0.35
        }
      }
    }
  }

  for (const c of out) {
    devInfoArgs('[contract-venue-time-classification]', {
      kind: 'venue',
      sourceText: c.sourceText,
      paragraphIndex: c.paragraphIndex,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      localContext: c.localContext.slice(0, 120),
      stageAnchors: c.stageAnchors,
      negativeAnchors: c.negativeAnchors,
      scoreByConcept: c.scoreByConcept,
      selectedConcept: c.selectedConcept,
      sharedVenueStages: c.sharedVenueStages,
      physicalSpanSafety: c.physicalSpanSafety,
      reviewState: c.reviewState,
      rejectionReason: c.rejectionReason,
    })
  }

  return out
}

/**
 * Inventory coverage clock ranges; segment into start/end endpoints.
 */
export function inventoryCoverageTimeRanges(
  paragraphs: IndexedParagraph[],
  coverageHoursDetected?: number | null,
): TimeRangeCandidate[] {
  const out: TimeRangeCandidate[] = []
  const normalized = paragraphs.map((p) => ({
    index: p.index,
    text: canonicalizeParagraphText(p.text),
  }))

  for (const para of normalized) {
    if (!para.text.trim()) continue
    const seen = new Set<string>()
    for (const re of TIME_RANGE_RES) {
      const localRe = new RegExp(re.source, 'gi')
      let m: RegExpExecArray | null
      while ((m = localRe.exec(para.text)) !== null) {
        const startText = m[1]!
        const endText = m[2]!
        const rawRange = m[0]!
        const key = `${m.index}:${startText}:${endText}`
        if (seen.has(key)) continue
        seen.add(key)

        const startOffset = para.text.indexOf(startText, m.index)
        const endOffset = para.text.indexOf(
          endText,
          startOffset + startText.length,
        )
        if (startOffset < 0 || endOffset < 0) continue

        const ctx = para.text.slice(
          Math.max(0, m.index - 100),
          Math.min(para.text.length, m.index + rawRange.length + 60),
        )
        const positiveAnchors = matchList(ctx, TIME_POSITIVE)
        const negativeAnchors = matchList(ctx, TIME_NEGATIVE)

        // Hard reject delivery deadlines etc.
        if (
          /dni\s+roboczych|termin\s+oddania|do\s+\d+\s+dni/i.test(ctx) &&
          positiveAnchors.length === 0
        ) {
          continue
        }

        const normalizedStart = normalizeClock(startText)
        const normalizedEnd = normalizeClock(endText)
        const hours = coverageHoursBetween(normalizedStart, normalizedEnd)
        let consistency: boolean | null = null
        if (
          hours != null &&
          coverageHoursDetected != null &&
          Number.isFinite(coverageHoursDetected)
        ) {
          consistency = Math.abs(hours - coverageHoursDetected) < 0.05
        }

        const posScore = positiveAnchors.length
        const negScore = negativeAnchors.length
        let reviewState: TimeRangeCandidate['reviewState'] = 'ok'
        let selectedStart: TimeRangeCandidate['selectedStartConcept'] =
          'coverage_start_time'
        let selectedEnd: TimeRangeCandidate['selectedEndConcept'] =
          'coverage_end_time'
        let rejectionReason: string | null = null
        let confidence = 0.7 + posScore * 0.06 - negScore * 0.1

        if (negScore > 0 && posScore === 0) {
          selectedStart = null
          selectedEnd = null
          reviewState = 'excluded'
          rejectionReason = 'non_coverage_time_context'
          confidence = 0.3
        } else if (consistency === false) {
          // Keep endpoints selected for review — do not rewrite coverage_hours.
          reviewState = 'needs_review'
          rejectionReason = 'inconsistent_with_coverage_hours'
          confidence = 0.62
        } else if (posScore === 0) {
          // Bare clock range without negative context — bindable, needs review.
          reviewState = 'needs_review'
          confidence = 0.72
        } else {
          confidence = Math.min(0.95, confidence)
          if (consistency === true) confidence = Math.min(0.96, confidence + 0.08)
        }

        const startSafe = validateMinimalSlotSpan({
          registryKey: 'coverage_start_time',
          text: startText,
          paragraphText: para.text,
          operation: 'replace',
        })
        const endSafe = validateMinimalSlotSpan({
          registryKey: 'coverage_end_time',
          text: endText,
          paragraphText: para.text,
          operation: 'replace',
        })
        const physicalSpanSafety =
          startSafe.ok && endSafe.ok ? 'safe' : 'unsafe'
        if (physicalSpanSafety === 'unsafe') {
          selectedStart = null
          selectedEnd = null
          reviewState = 'needs_review'
          rejectionReason = 'unsafe_time_span'
        }

        const item: TimeRangeCandidate = {
          rawRange,
          startText,
          endText,
          normalizedStart,
          normalizedEnd,
          paragraphIndex: para.index,
          startOffset,
          startEndOffset: startOffset + startText.length,
          endOffset,
          endEndOffset: endOffset + endText.length,
          paragraphText: para.text,
          localContext: ctx,
          positiveAnchors,
          negativeAnchors,
          selectedStartConcept: selectedStart,
          selectedEndConcept: selectedEnd,
          consistencyWithCoverageHours: consistency,
          physicalSpanSafety,
          reviewState,
          confidence,
          rejectionReason,
        }
        out.push(item)
      }
    }
  }

  // Prefer strongest coverage-context range; demote competitors
  const okRanges = out
    .filter((r) => r.selectedStartConcept && r.reviewState !== 'excluded')
    .sort((a, b) => b.confidence - a.confidence)
  if (okRanges.length > 1) {
    const winner = okRanges[0]!
    for (const r of out) {
      if (r === winner) continue
      if (!r.selectedStartConcept) continue
      if (r.confidence >= winner.confidence - 0.05) {
        r.reviewState = 'needs_review'
        r.rejectionReason = 'competing_time_ranges'
        r.selectedStartConcept = null
        r.selectedEndConcept = null
      } else {
        r.selectedStartConcept = null
        r.selectedEndConcept = null
        r.reviewState = 'needs_review'
        r.rejectionReason = 'superseded_by_better_time_range'
      }
    }
  }

  for (const c of out) {
    devInfoArgs('[contract-venue-time-classification]', {
      kind: 'time_range',
      rawRange: c.rawRange,
      normalizedStart: c.normalizedStart,
      normalizedEnd: c.normalizedEnd,
      startOffsets: [c.startOffset, c.startEndOffset],
      endOffsets: [c.endOffset, c.endEndOffset],
      paragraphIndex: c.paragraphIndex,
      localContext: c.localContext.slice(0, 120),
      positiveAnchors: c.positiveAnchors,
      negativeAnchors: c.negativeAnchors,
      selectedStartConcept: c.selectedStartConcept,
      selectedEndConcept: c.selectedEndConcept,
      consistencyWithCoverageHours: c.consistencyWithCoverageHours,
      physicalSpanSafety: c.physicalSpanSafety,
      reviewState: c.reviewState,
      rejectionReason: c.rejectionReason,
    })
  }

  return out
}

export function inventoryAndClassifyVenueTime(paragraphs: IndexedParagraph[]): {
  venues: VenueCandidate[]
  timeRanges: TimeRangeCandidate[]
} {
  // Peek coverage hours from text for consistency (does not create/overwrite slot)
  let hours: number | null = null
  for (const p of paragraphs) {
    const text = canonicalizeParagraphText(p.text)
    const m =
      /(?:nie\s+przekracza|maksymalnie|czas\s+pracy[^\d]{0,20})\s*(\d{1,2})\s+godzin/i.exec(
        text,
      ) ??
      /(\d{1,2})\s+godzin/i.exec(text)
    if (m && /czas\s+pracy|kamerzyst|reporta|maksymalnie|nie\s+przekracza/i.test(text)) {
      hours = Number(m[1])
      break
    }
  }

  return {
    venues: inventoryVenueCandidates(paragraphs),
    timeRanges: inventoryCoverageTimeRanges(paragraphs, hours),
  }
}
