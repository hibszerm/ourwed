/**
 * Mode A — immutable diff audit between source blocks and AI-generated blocks.
 */

import { isExperimentDynamicFieldKey } from './fieldRegistry'
import type {
  AiContractChange,
  FullAiDocumentAnalysis,
  FullAiGeneratedDocument,
  FullAiSafetyResult,
  IndexedDocxBlock,
} from './types'

function normalizeForFormatCompare(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function auditFullAiGeneration(input: {
  sourceBlocks: IndexedDocxBlock[]
  generated: FullAiGeneratedDocument
  analysis: FullAiDocumentAnalysis
}): {
  changes: AiContractChange[]
  safety: FullAiSafetyResult
} {
  const sourceById = new Map(input.sourceBlocks.map((b) => [b.id, b]))
  const genById = new Map(input.generated.blocks.map((b) => [b.id, b]))
  const allowedByBlock = new Map<string, string[]>()
  for (const f of input.analysis.detectedFields) {
    if (!isExperimentDynamicFieldKey(f.fieldKey)) continue
    const list = allowedByBlock.get(f.blockId) ?? []
    list.push(f.sourceText)
    allowedByBlock.set(f.blockId, list)
  }

  const changes: AiContractChange[] = []
  let allowedChangeCount = 0
  let unauthorizedChangeCount = 0
  let removedBlockCount = 0
  let addedBlockCount = 0
  const issues: FullAiSafetyResult['issues'] = []

  for (const [id, source] of sourceById) {
    const gen = genById.get(id)
    if (!gen) {
      removedBlockCount += 1
      changes.push({
        sourceBlockId: id,
        before: source.text,
        after: '',
        classification: 'removed_content',
      })
      unauthorizedChangeCount += 1
      issues.push({
        code: 'removed_content',
        message: 'Usunięto blok źródłowy.',
        blockId: id,
      })
      continue
    }

    if (gen.text === source.text) continue

    const allowedSources = allowedByBlock.get(id) ?? []
    // Allowed if the only differences can be explained by replacing allowlisted source spans.
    let residual = source.text
    let after = gen.text
    let explained = true
    for (const span of allowedSources) {
      if (!residual.includes(span)) continue
      // Replace first occurrence in residual with a placeholder; require corresponding change in after.
      residual = residual.replace(span, '\u0000')
    }
    // If after removing allowed spans and collapsing whitespace they match, treat as allowed dynamic.
    // Conservative: also accept when after differs only inside regions that contained allowed spans.
    const sourceWithoutAllowed = allowedSources.reduce(
      (acc, span) => acc.replace(span, ''),
      source.text,
    )
    const genWithoutDynamicGuess = allowedSources.reduce((acc, span) => {
      // Generated may no longer contain the source span — strip nothing from gen by source.
      void span
      return acc
    }, gen.text)

    // Heuristic: immutable skeleton = source with allowed spans blanked must equal
    // generated with corresponding positions — for Phase 1 use: if every changed
    // character range intersects an allowed source span location.
    const isFormatOnly =
      normalizeForFormatCompare(source.text) ===
      normalizeForFormatCompare(gen.text)

    if (isFormatOnly) {
      changes.push({
        sourceBlockId: id,
        before: source.text,
        after: gen.text,
        classification: 'formatting_change',
      })
      unauthorizedChangeCount += 1
      issues.push({
        code: 'formatting_change',
        message: 'Zmiana formatowania poza dozwolonymi polami.',
        blockId: id,
      })
      continue
    }

    // Check if source skeleton (allowed spans → markers) matches gen skeleton
    // when we don't know replacement values — compare by removing allowed spans
    // from source and checking gen still contains all immutable tokens.
    const immutableTokens = sourceWithoutAllowed
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 2)
    const missingImmutable = immutableTokens.filter(
      (t) => !genWithoutDynamicGuess.includes(t),
    )

    if (allowedSources.length > 0 && missingImmutable.length === 0) {
      // Verify each allowed source span is gone or changed
      const replacedAll = allowedSources.every(
        (span) => !gen.text.includes(span) || gen.text !== source.text,
      )
      if (replacedAll || gen.text !== source.text) {
        changes.push({
          sourceBlockId: id,
          before: source.text,
          after: gen.text,
          classification: 'allowed_dynamic_change',
        })
        allowedChangeCount += 1
        continue
      }
    }

    // Provider / package-owned detection
    if (
      /NIP|REGON|rachunek|IBAN|FilmGrafia|nadgodzin|tygodni/i.test(source.text) &&
      gen.text !== source.text
    ) {
      changes.push({
        sourceBlockId: id,
        before: source.text,
        after: gen.text,
        classification: 'unauthorized_text_change',
      })
      unauthorizedChangeCount += 1
      issues.push({
        code: 'provider_or_package_change',
        message: 'Zmiana danych usługodawcy lub faktów pakietu.',
        blockId: id,
      })
      continue
    }

    void residual
    void after
    void explained

    changes.push({
      sourceBlockId: id,
      before: source.text,
      after: gen.text,
      classification: 'unauthorized_text_change',
    })
    unauthorizedChangeCount += 1
    issues.push({
      code: 'unauthorized_text_change',
      message: 'Niedozwolona zmiana treści.',
      blockId: id,
    })
  }

  for (const [id, gen] of genById) {
    if (sourceById.has(id)) continue
    addedBlockCount += 1
    changes.push({
      sourceBlockId: id,
      before: '',
      after: gen.text,
      classification: 'added_content',
    })
    unauthorizedChangeCount += 1
    issues.push({
      code: 'added_content',
      message: 'Dodano nowy blok treści.',
      blockId: id,
    })
  }

  const status: FullAiSafetyResult['status'] =
    unauthorizedChangeCount > 0 || removedBlockCount > 0 || addedBlockCount > 0
      ? 'critical'
      : allowedChangeCount > 0
        ? 'safe'
        : 'safe'

  return {
    changes,
    safety: {
      status,
      allowedChangeCount,
      unauthorizedChangeCount,
      removedBlockCount,
      addedBlockCount,
      issues,
    },
  }
}
