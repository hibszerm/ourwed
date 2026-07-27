/**
 * Deterministic sequence diff for contract block texts.
 * Phrase-level minimal differing span + multi-field segmentation.
 */

import type { ContractBlockDiff, ContractTextChange, TransformDocumentBlock } from './types'

export type RawTextEdit = {
  sourceStart: number
  sourceEnd: number
  sourceText: string
  replacementText: string
}

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[\p{L}\p{N}]/u.test(ch)
}

/**
 * Expand a char-minimal span so shared trailing letters of different words
 * (e.g. Retyrada→Polska both ending in "a") are not truncated in the UI.
 * Only expands the end — start stays at the first true difference.
 */
export function expandEditToWordBoundaries(
  source: string,
  target: string,
  start: number,
  endSrc: number,
  endTgt: number,
): { start: number; endSrc: number; endTgt: number } {
  let eS = endSrc
  let eT = endTgt

  while (
    eS < source.length &&
    isWordChar(source[eS - 1]) &&
    isWordChar(source[eS])
  ) {
    eS += 1
  }
  while (
    eT < target.length &&
    isWordChar(target[eT - 1]) &&
    isWordChar(target[eT])
  ) {
    eT += 1
  }

  return { start, endSrc: eS, endTgt: eT }
}

/** Minimal span covering first..last difference (one phrase edit). */
export function computeMinimalPhraseEdit(
  source: string,
  target: string,
): RawTextEdit | null {
  if (source === target) return null

  let start = 0
  const minLen = Math.min(source.length, target.length)
  while (start < minLen && source[start] === target[start]) start += 1

  let endSrc = source.length
  let endTgt = target.length
  while (
    endSrc > start &&
    endTgt > start &&
    source[endSrc - 1] === target[endTgt - 1]
  ) {
    endSrc -= 1
    endTgt -= 1
  }

  const expanded = expandEditToWordBoundaries(
    source,
    target,
    start,
    endSrc,
    endTgt,
  )

  return {
    sourceStart: expanded.start,
    sourceEnd: expanded.endSrc,
    sourceText: source.slice(expanded.start, expanded.endSrc),
    replacementText: target.slice(expanded.start, expanded.endTgt),
  }
}

function splitKeepingDelimiters(text: string): string[] {
  return text
    .split(/(,\s*|;\s*|\s+zam\.?\s*|\s+tel\.?\s*)/i)
    .filter((p) => p.length > 0)
}

/**
 * Split a phrase edit into token-aligned sub-edits when separators are shared,
 * so multi-field paragraphs (name + address + phone) classify separately.
 */
export function computeTextEdits(source: string, target: string): RawTextEdit[] {
  const phrase = computeMinimalPhraseEdit(source, target)
  if (!phrase) return []

  const srcParts = splitKeepingDelimiters(phrase.sourceText)
  const tgtParts = splitKeepingDelimiters(phrase.replacementText)
  if (srcParts.length === tgtParts.length && srcParts.length > 1) {
    const sub: RawTextEdit[] = []
    let offset = phrase.sourceStart
    let tgtOffset = 0
    for (let i = 0; i < srcParts.length; i++) {
      const s = srcParts[i]!
      const t = tgtParts[i]!
      if (s !== t) {
        // Re-minimal each segment so agreement tokens split cleanly
        const inner = computeMinimalPhraseEdit(s, t)
        if (inner) {
          sub.push({
            sourceStart: offset + inner.sourceStart,
            sourceEnd: offset + inner.sourceEnd,
            sourceText: inner.sourceText,
            replacementText: inner.replacementText,
          })
        } else {
          sub.push({
            sourceStart: offset,
            sourceEnd: offset + s.length,
            sourceText: s,
            replacementText: t,
          })
        }
      }
      offset += s.length
      tgtOffset += t.length
    }
    void tgtOffset
    if (sub.length > 0) return sub
  }

  return [phrase]
}

export function diffSingleBlock(input: {
  blockId: string
  paragraphIndex: number
  sourceText: string
  transformedText: string
}): ContractBlockDiff {
  const raw = computeTextEdits(input.sourceText, input.transformedText)
  const changes: ContractTextChange[] = raw.map((e) => ({
    ...e,
    classification: 'unexpected_text_change' as const,
    severity: 'warning' as const,
  }))
  return {
    blockId: input.blockId,
    paragraphIndex: input.paragraphIndex,
    sourceText: input.sourceText,
    transformedText: input.transformedText,
    changes,
  }
}

export function diffDocumentBlocks(input: {
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: Array<{ blockId: string; text: string }>
}): ContractBlockDiff[] {
  const byId = new Map(input.transformedBlocks.map((b) => [b.blockId, b.text]))
  const diffs: ContractBlockDiff[] = []
  for (const src of input.sourceBlocks) {
    const transformed = byId.get(src.blockId)
    if (transformed === undefined) {
      diffs.push({
        blockId: src.blockId,
        paragraphIndex: src.paragraphIndex,
        sourceText: src.text,
        transformedText: '',
        changes: [
          {
            sourceStart: 0,
            sourceEnd: src.text.length,
            sourceText: src.text,
            replacementText: '',
            classification: 'block_structure_change',
            severity: 'blocking',
          },
        ],
      })
      continue
    }
    if (transformed === src.text) continue
    diffs.push(
      diffSingleBlock({
        blockId: src.blockId,
        paragraphIndex: src.paragraphIndex,
        sourceText: src.text,
        transformedText: transformed,
      }),
    )
  }
  return diffs
}

export function textSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length && !b.length) return 1
  if (!a.length || !b.length) return 0
  const edits = computeTextEdits(a, b)
  const changed = edits.reduce(
    (sum, e) => sum + Math.max(e.sourceText.length, e.replacementText.length),
    0,
  )
  const denom = Math.max(a.length, b.length)
  return Math.max(0, 1 - changed / denom)
}
