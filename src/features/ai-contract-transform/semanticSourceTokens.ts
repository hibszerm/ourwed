import type { TransformDocumentBlock } from './types'

export type SourceToken = { id: string; text: string; start: number; end: number }

/** Structural tokens only. Meaning and replacement eligibility are never inferred here. */
export function indexSemanticSourceTokens(block: Pick<TransformDocumentBlock, 'blockId' | 'text' | 'breakOffsets'>): SourceToken[] {
  const text = block.text
  const boundaries = [0, ...new Set(block.breakOffsets ?? []), text.length]
    .filter((offset) => Number.isInteger(offset) && offset >= 0 && offset <= text.length)
    .sort((a, b) => a - b)
  const state = fingerprint(`${block.blockId}\u0000${text}\u0000${boundaries.join(',')}`)
  const tokens: SourceToken[] = []
  for (let segment = 1; segment < boundaries.length; segment++) {
    const start = boundaries[segment - 1]!
    const slice = text.slice(start, boundaries[segment]!)
    for (const match of slice.matchAll(/[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}\s]/gu)) {
      const at = start + match.index!
      tokens.push({ id: `t${tokens.length.toString(36)}_${state}`, text: match[0], start: at, end: at + match[0].length })
    }
  }
  return tokens
}

function fingerprint(value: string): string {
  let hash = 0xcbf29ce484222325n
  for (let index = 0; index < value.length; index++) {
    hash ^= BigInt(value.charCodeAt(index))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0')
}

export function sourceTokenRange(input: {
  block: Pick<TransformDocumentBlock, 'blockId' | 'text' | 'breakOffsets'>
  startTokenId: string
  endTokenId: string
}): { start: number; end: number; anchor: string } | null {
  const tokens = indexSemanticSourceTokens(input.block)
  const first = tokens.findIndex((token) => token.id === input.startTokenId)
  const last = tokens.findIndex((token) => token.id === input.endTokenId)
  if (first < 0 || last < first) return null
  const start = tokens[first]!.start
  const end = tokens[last]!.end
  const anchor = input.block.text.slice(start, end)
  return anchor.trim() ? { start, end, anchor } : null
}
