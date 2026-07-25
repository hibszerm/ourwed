/**
 * Film-duration + videographer/operator-count context classification.
 * Inventory first, score by deliverable context, unique assignment.
 */

import { canonicalizeParagraphText } from './canonicalParagraph'
import type { IndexedParagraph } from './extractDocxParagraphs'
import { validateMinimalSlotSpan } from './contractSlotSafety'

export type CrewConcept = 'videographers_count' | 'photographers_count'

export type DurationConcept = 'film_duration'

export interface CrewCountCandidate {
  sourceText: string
  normalizedCount: number | null
  unit: string | null
  paragraphIndex: number
  startOffset: number
  endOffset: number
  paragraphText: string
  localContext: string
  positiveAnchors: string[]
  negativeAnchors: string[]
  selectedConcept: CrewConcept | null
  confidence: number
  physicalSpanSafety: 'safe' | 'unsafe'
  reviewState: 'ok' | 'needs_review' | 'excluded'
  rejectionReason: string | null
}

export interface DurationCandidate {
  sourceText: string
  normalizedMinimumMinutes: number | null
  normalizedMaximumMinutes: number | null
  qualifier: 'exact' | 'maximum' | 'approximate' | 'minimum' | 'range' | null
  unit: string | null
  paragraphIndex: number
  startOffset: number
  endOffset: number
  paragraphText: string
  localContext: string
  positiveAnchors: string[]
  negativeAnchors: string[]
  selectedConcept: DurationConcept | null
  confidence: number
  physicalSpanSafety: 'safe' | 'unsafe'
  reviewState: 'ok' | 'needs_review' | 'excluded'
  rejectionReason: string | null
}

const WORD_COUNTS: Array<{ re: RegExp; value: number }> = [
  { re: /\b(?:jeden|jedna|jedno)\b/i, value: 1 },
  { re: /\b(?:dwóch|dwie|dwoje|dwuosobow\w*)\b/i, value: 2 },
  { re: /\b(?:trzech|trzy)\b/i, value: 3 },
  { re: /\b(?:czterech|cztery)\b/i, value: 4 },
]

const CREW_POSITIVE = [
  /operator(?:ów|zy|a)?/i,
  /filmowc(?:ów|y|a)?/i,
  /kamerzyst(?:ów|y|a)?/i,
  /wideograf(?:ów|y|a)?/i,
  /ekipa\s+dwuosobow/i,
  /obsług[ai]\s+przez/i,
  /liczba\s+osób\s+wykonując/i,
  /osób\s+wykonujących\s+zlecenie/i,
  /osoby\s+realizując/i,
  /reportaż\s+realizowany\s+przez/i,
]

const CREW_NEGATIVE = [
  /\bkamer(?:y|ami)?\b/i,
  /\baparat(?:y|ów)?\b/i,
  /\bfilm(?:y|ów)\b/i,
  /\bteledysk/i,
  /\begzemplarz/i,
  /\brat[ay]\b/i,
  /§/,
  /\bpunkt\b/i,
  /\bkopi[ei]/i,
  /\bpoprawk/i,
  /\bgośc/i,
  /\blokacj/i,
]

const DURATION_POSITIVE = [
  /czas(?:ie)?\s+trwania/i,
  /długość\s+film/i,
  /film\s+o\s+długości/i,
  /film\s+trwając/i,
  /materiał\s+filmowy/i,
  /zmontowany\s+film/i,
  /finalny\s+film/i,
  /film\s+główny/i,
  /plik(?:u)?\s+cyfrowego/i,
  /\bFILM\b/,
]

const MAIN_FILM_BOOST = [
  /zmontowany\s+FILM/i,
  /zmontowany\s+film/i,
  /film\s+główny/i,
  /finalny\s+film/i,
  /plik(?:u)?\s+cyfrowego/i,
  /czas(?:ie)?\s+trwania/i,
  /film\s+o\s+długości/i,
  /film\s+trwając/i,
]

const TEASER_CONTEXT = /teaser|zapowiedź|trailer|zwiastun|rolk[ai]/i

function matchList(text: string, patterns: RegExp[]): string[] {
  return patterns.filter((re) => re.test(text)).map((re) => re.source.slice(0, 40))
}

function parseWordCount(text: string): number | null {
  for (const w of WORD_COUNTS) {
    if (w.re.test(text)) return w.value
  }
  return null
}

function extractCrewCandidates(text: string): Array<{
  sourceText: string
  start: number
  end: number
  normalizedCount: number | null
  unit: string | null
  needsReviewNoNumber: boolean
}> {
  const out: Array<{
    sourceText: string
    start: number
    end: number
    normalizedCount: number | null
    unit: string | null
    needsReviewNoNumber: boolean
  }> = []

  // “2 operatorów”, “2 filmowców”, “2 kamerzystów”
  const digitCrew =
    /(\d{1,2})\s+(operator(?:ów|zy|a)?|filmowc(?:ów|y|a)?|kamerzyst(?:ów|y|a)?|wideograf(?:ów|y|a)?|osób(?:\s+realizując\w*)?)/giu
  let m: RegExpExecArray | null
  while ((m = digitCrew.exec(text)) !== null) {
    const num = m[1]!
    const start = m.index
    out.push({
      sourceText: num,
      start,
      end: start + num.length,
      normalizedCount: Number(num),
      unit: m[2] ?? null,
      needsReviewNoNumber: false,
    })
  }

  // “dwóch operatorów” / “dwie osoby realizujące”
  const wordCrew =
    /\b(dwóch|dwie|dwoje|trzech|trzy|czterech|cztery|jeden|jedna)\s+(operator(?:ów|zy|a)?|filmowc(?:ów|y|a)?|kamerzyst(?:ów|y|a)?|wideograf(?:ów|y|a)?|osób(?:\s+realizując\w*)?)/giu
  while ((m = wordCrew.exec(text)) !== null) {
    const word = m[1]!
    const count = parseWordCount(word)
    const start = text.indexOf(word, m.index)
    if (start < 0 || count == null) continue
    out.push({
      sourceText: word,
      start,
      end: start + word.length,
      normalizedCount: count,
      unit: m[2] ?? null,
      needsReviewNoNumber: false,
    })
  }

  // “ekipa dwuosobowa”
  const duo = /ekipa\s+(dwuosobow\w*)/giu.exec(text)
  if (duo && duo.index != null) {
    const span = duo[1]!
    const start = text.indexOf(span, duo.index)
    if (start >= 0) {
      out.push({
        sourceText: span,
        start,
        end: start + span.length,
        normalizedCount: 2,
        unit: 'ekipa',
        needsReviewNoNumber: false,
      })
    }
  }

  // Bare “operatorzy” / “operatorów” without a number → review only
  if (
    /operator(?:zy|ów)\b/i.test(text) &&
    !/\d{1,2}\s+operator/i.test(text) &&
    !/\b(?:dwóch|dwie|dwoje|trzech|trzy|jeden)\s+operator/i.test(text)
  ) {
    const bare = /operator(?:zy|ów)\b/iu.exec(text)
    if (bare && bare.index != null) {
      out.push({
        sourceText: bare[0],
        start: bare.index,
        end: bare.index + bare[0].length,
        normalizedCount: null,
        unit: bare[0],
        needsReviewNoNumber: true,
      })
    }
  }

  return out
}

function extractDurationCandidates(text: string): Array<{
  sourceText: string
  start: number
  end: number
  minMinutes: number | null
  maxMinutes: number | null
  qualifier: DurationCandidate['qualifier']
  unit: string
}> {
  const out: Array<{
    sourceText: string
    start: number
    end: number
    minMinutes: number | null
    maxMinutes: number | null
    qualifier: DurationCandidate['qualifier']
    unit: string
  }> = []

  const patterns: Array<{
    re: RegExp
    qualify: (m: RegExpExecArray) => {
      sourceText: string
      min: number | null
      max: number | null
      qualifier: DurationCandidate['qualifier']
      unit: string
    }
  }> = [
    {
      re: /\bod\s+(\d{1,3})\s+do\s+(\d{1,3})\s+(minut(?:y)?|min\.?|godzin(?:y|a)?)/giu,
      qualify: (m) => ({
        sourceText: m[0]!,
        min: Number(m[1]),
        max: Number(m[2]),
        qualifier: 'range',
        unit: m[3]!,
      }),
    },
    {
      re: /(\d{1,3})\s*[-–—]\s*(\d{1,3})\s+(minut(?:y)?|min\.?)/giu,
      qualify: (m) => ({
        sourceText: m[0]!,
        min: Number(m[1]),
        max: Number(m[2]),
        qualifier: 'range',
        unit: m[3]!,
      }),
    },
    {
      re: /\b(do|około|ok\.|minimum|maksymalnie)\s+(\d{1,3})\s+(minut(?:y)?|min\.?|godzin(?:y|a)?)/giu,
      qualify: (m) => {
        const q = m[1]!.toLowerCase()
        const n = Number(m[2])
        const qualifier: DurationCandidate['qualifier'] =
          q === 'do' || q.startsWith('maks')
            ? 'maximum'
            : q === 'minimum'
              ? 'minimum'
              : q.startsWith('ok') || q === 'około'
                ? 'approximate'
                : 'exact'
        return {
          sourceText: m[0]!,
          min: qualifier === 'minimum' ? n : null,
          max: n,
          qualifier,
          unit: m[3]!,
        }
      },
    },
    {
      re: /\b(\d{1,3})\s+(minut(?:y)?|min\.?)\b/giu,
      qualify: (m) => ({
        sourceText: m[0]!,
        min: Number(m[1]),
        max: Number(m[1]),
        qualifier: 'exact',
        unit: m[2]!,
      }),
    },
    {
      re: /\b(\d{1,2})\s+(godzin(?:y|a)?)\b/giu,
      qualify: (m) => ({
        sourceText: m[0]!,
        min: Number(m[1]) * 60,
        max: Number(m[1]) * 60,
        qualifier: 'exact',
        unit: m[2]!,
      }),
    },
  ]

  const seen = new Set<string>()
  for (const p of patterns) {
    const local = new RegExp(p.re.source, 'giu')
    let m: RegExpExecArray | null
    while ((m = local.exec(text)) !== null) {
      const q = p.qualify(m)
      const key = `${m.index}:${q.sourceText}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        sourceText: q.sourceText,
        start: m.index,
        end: m.index + q.sourceText.length,
        minMinutes: q.min,
        maxMinutes: q.max,
        qualifier: q.qualifier,
        unit: q.unit,
      })
    }
  }

  // Prefer qualified spans: drop bare “N minut” fully contained in a longer candidate
  return out.filter((c) => {
    if (c.qualifier !== 'exact') return true
    return !out.some(
      (o) =>
        o !== c &&
        o.start <= c.start &&
        o.end >= c.end &&
        o.sourceText.length > c.sourceText.length,
    )
  })
}

/**
 * Inventory crew-count candidates.
 */
export function inventoryCrewCountCandidates(
  paragraphs: IndexedParagraph[],
): CrewCountCandidate[] {
  const out: CrewCountCandidate[] = []
  const normalized = paragraphs.map((p) => ({
    index: p.index,
    text: canonicalizeParagraphText(p.text),
  }))

  for (let i = 0; i < normalized.length; i++) {
    const para = normalized[i]!
    if (!para.text.trim()) continue

    const hits = extractCrewCandidates(para.text)
    for (const hit of hits) {
      const ctx = para.text.slice(
        Math.max(0, hit.start - 80),
        Math.min(para.text.length, hit.end + 60),
      )
      const positiveAnchors = matchList(para.text, CREW_POSITIVE)
      const negativeAnchors = matchList(ctx, CREW_NEGATIVE)

      // Paragraph numbering “2. Operatorzy”
      const after = para.text.slice(hit.end)
      const isParagraphNumber =
        /^\d{1,2}$/.test(hit.sourceText) &&
        /^[.)]\s*[A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż]/.test(after) &&
        !/operator|filmowc|kamerzyst|wideograf|osób/i.test(
          para.text.slice(hit.end, hit.end + 24),
        )

      let selected: CrewConcept | null = 'videographers_count'
      let reviewState: CrewCountCandidate['reviewState'] = 'ok'
      let rejectionReason: string | null = null
      let confidence = 0.7 + positiveAnchors.length * 0.05

      if (hit.needsReviewNoNumber || hit.normalizedCount == null) {
        selected = null
        reviewState = 'needs_review'
        rejectionReason = 'count_not_explicit'
        confidence = 0.4
      } else if (isParagraphNumber) {
        selected = null
        reviewState = 'excluded'
        rejectionReason = 'paragraph_numbering'
        confidence = 0.2
      } else if (/\bkamer/i.test(hit.unit ?? '')) {
        selected = null
        reviewState = 'excluded'
        rejectionReason = 'equipment_count'
        confidence = 0.25
      } else if (positiveAnchors.length === 0) {
        reviewState = 'needs_review'
        confidence = 0.62
      } else {
        confidence = Math.min(0.96, confidence)
        if (/liczba\s+osób\s+wykonując|operator/i.test(para.text)) {
          confidence = Math.min(0.96, confidence + 0.1)
        }
      }

      const spanCheck = validateMinimalSlotSpan({
        registryKey: 'videographers_count',
        text: hit.sourceText,
        paragraphText: para.text,
        operation: 'replace',
      })

      if (!spanCheck.ok) {
        selected = null
        reviewState = 'needs_review'
        rejectionReason = spanCheck.blockingReasons[0] ?? 'unsafe span'
      }

      out.push({
        sourceText: hit.sourceText,
        normalizedCount: hit.normalizedCount,
        unit: hit.unit,
        paragraphIndex: para.index,
        startOffset: hit.start,
        endOffset: hit.end,
        paragraphText: para.text,
        localContext: ctx,
        positiveAnchors,
        negativeAnchors,
        selectedConcept: selected,
        confidence,
        physicalSpanSafety: spanCheck.ok ? 'safe' : 'unsafe',
        reviewState,
        rejectionReason,
      })
    }
  }

  // Unique winner for videographers_count
  const ranked = [...out]
    .filter(
      (c) => c.selectedConcept === 'videographers_count' && c.reviewState === 'ok',
    )
    .sort((a, b) => b.confidence - a.confidence)
  if (ranked.length > 1) {
    const winner = ranked[0]!
    const close = ranked.filter((c) => c.confidence >= winner.confidence - 0.05)
    if (
      close.length > 1 &&
      close.some((c) => c.normalizedCount !== winner.normalizedCount)
    ) {
      for (const c of ranked) {
        c.reviewState = 'needs_review'
        c.rejectionReason = 'competing_crew_counts'
        c.selectedConcept = null
        c.confidence = 0.5
      }
    } else {
      for (const c of out) {
        if (
          c !== winner &&
          c.selectedConcept === 'videographers_count' &&
          `${c.paragraphIndex}:${c.startOffset}` !==
            `${winner.paragraphIndex}:${winner.startOffset}`
        ) {
          c.selectedConcept = null
          c.reviewState = 'needs_review'
          c.rejectionReason = 'superseded_by_better_crew_candidate'
          c.confidence = 0.35
        }
      }
    }
  }

  for (const c of out) {
    console.info('[contract-deliverable-classification]', {
      kind: 'crew',
      sourceText: c.sourceText,
      normalizedCount: c.normalizedCount,
      paragraphIndex: c.paragraphIndex,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      localContext: c.localContext.slice(0, 120),
      positiveAnchors: c.positiveAnchors,
      negativeAnchors: c.negativeAnchors,
      selectedConcept: c.selectedConcept,
      confidence: c.confidence,
      physicalSpanSafety: c.physicalSpanSafety,
      reviewState: c.reviewState,
      rejectionReason: c.rejectionReason,
    })
  }

  return out
}

/**
 * Inventory film-duration candidates.
 */
export function inventoryFilmDurationCandidates(
  paragraphs: IndexedParagraph[],
): DurationCandidate[] {
  const out: DurationCandidate[] = []
  const normalized = paragraphs.map((p) => ({
    index: p.index,
    text: canonicalizeParagraphText(p.text),
  }))

  for (const para of normalized) {
    if (!para.text.trim()) continue
    const hits = extractDurationCandidates(para.text)
    for (const hit of hits) {
      const ctx = para.text.slice(
        Math.max(0, hit.start - 100),
        Math.min(para.text.length, hit.end + 60),
      )
      const positiveAnchors = matchList(para.text, DURATION_POSITIVE)

      let selected: DurationConcept | null = 'film_duration'
      let reviewState: DurationCandidate['reviewState'] = 'ok'
      let rejectionReason: string | null = null
      let confidence = 0.65 + positiveAnchors.length * 0.06

      // Hard negatives: delivery / coverage hours
      if (
        /dni\s+roboczych|termin\s+oddania|od\s+dnia\s+ślubu/i.test(ctx) ||
        (/czas\s+pracy|godziny\s+pracy|nie\s+przekracza/i.test(ctx) &&
          /godzin/i.test(hit.unit))
      ) {
        selected = null
        reviewState = 'excluded'
        rejectionReason = 'non_film_duration_context'
        confidence = 0.25
      } else if (
        TEASER_CONTEXT.test(para.text) &&
        !MAIN_FILM_BOOST.some((re) => re.test(para.text))
      ) {
        selected = null
        reviewState = 'needs_review'
        rejectionReason = 'teaser_or_secondary_duration'
        confidence = 0.45
      } else if (/ceremonia\s+trwa/i.test(ctx)) {
        selected = null
        reviewState = 'excluded'
        rejectionReason = 'ceremony_duration'
        confidence = 0.3
      } else if (positiveAnchors.length === 0) {
        reviewState = 'needs_review'
        confidence = 0.62
      } else {
        if (MAIN_FILM_BOOST.some((re) => re.test(para.text))) {
          confidence = Math.min(0.96, confidence + 0.15)
        }
        confidence = Math.min(0.96, confidence)
      }

      // Hours without film context → not film_duration
      if (
        /godzin/i.test(hit.unit) &&
        !/film|materiał|trwania|długość/i.test(para.text)
      ) {
        selected = null
        reviewState = 'excluded'
        rejectionReason = 'coverage_or_non_film_hours'
        confidence = 0.25
      }

      const spanCheck = validateMinimalSlotSpan({
        registryKey: 'film_duration',
        text: hit.sourceText,
        paragraphText: para.text,
        operation: 'replace',
      })
      if (!spanCheck.ok) {
        selected = null
        reviewState = 'needs_review'
        rejectionReason = spanCheck.blockingReasons[0] ?? 'unsafe span'
      }

      out.push({
        sourceText: hit.sourceText,
        normalizedMinimumMinutes: hit.minMinutes,
        normalizedMaximumMinutes: hit.maxMinutes,
        qualifier: hit.qualifier,
        unit: hit.unit,
        paragraphIndex: para.index,
        startOffset: hit.start,
        endOffset: hit.end,
        paragraphText: para.text,
        localContext: ctx,
        positiveAnchors,
        negativeAnchors: matchList(ctx, [
          /dni\s+roboczych/i,
          /termin\s+oddania/i,
          /od\s+dnia\s+ślubu/i,
          /czas\s+pracy/i,
          /godziny\s+pracy/i,
          /ceremonia\s+trwa/i,
          /dojazd/i,
          /przerwa/i,
          /płatność/i,
        ]),
        selectedConcept: selected,
        confidence,
        physicalSpanSafety: spanCheck.ok ? 'safe' : 'unsafe',
        reviewState,
        rejectionReason,
      })
    }
  }

  // Prefer main/final film duration; demote competitors
  const ok = out
    .filter(
      (c) =>
        c.selectedConcept === 'film_duration' && c.reviewState !== 'excluded',
    )
    .sort((a, b) => b.confidence - a.confidence)
  if (ok.length > 1) {
    const winner = ok[0]!
    for (const c of out) {
      if (c === winner) continue
      if (c.selectedConcept !== 'film_duration') continue
      c.selectedConcept = null
      c.reviewState = 'needs_review'
      c.rejectionReason =
        c.confidence >= winner.confidence - 0.05
          ? 'competing_film_durations'
          : 'superseded_by_main_film_duration'
      c.confidence = Math.min(c.confidence, 0.45)
    }
  }

  for (const c of out) {
    console.info('[contract-deliverable-classification]', {
      kind: 'duration',
      sourceText: c.sourceText,
      normalizedMinimumMinutes: c.normalizedMinimumMinutes,
      normalizedMaximumMinutes: c.normalizedMaximumMinutes,
      qualifier: c.qualifier,
      paragraphIndex: c.paragraphIndex,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      localContext: c.localContext.slice(0, 120),
      selectedConcept: c.selectedConcept,
      confidence: c.confidence,
      physicalSpanSafety: c.physicalSpanSafety,
      reviewState: c.reviewState,
      rejectionReason: c.rejectionReason,
    })
  }

  return out
}

export function inventoryAndClassifyDeliverables(
  paragraphs: IndexedParagraph[],
): {
  crew: CrewCountCandidate[]
  durations: DurationCandidate[]
} {
  return {
    crew: inventoryCrewCountCandidates(paragraphs),
    durations: inventoryFilmDurationCandidates(paragraphs),
  }
}
