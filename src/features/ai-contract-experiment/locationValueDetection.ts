/**
 * Location value vs stage-label detection.
 */

import type { ContractFieldKey, IndexedDocxBlock } from './types'

export type TableLabelValuePair = {
  label: string
  value: string
  labelBlockId: string
  valueBlockId: string
  tableIndex: number
  rowIndex: number
}

const PREPARATION_STAGE_ONLY =
  /^(?:przygotowania(?:\s+panny\s+młodej(?:\s+i\s+pana\s+młodego)?)?|reportaż\s+z\s+przygotowań)(?:\s*\([^)]*\))?;?$/i

const CEREMONY_STAGE_ONLY =
  /^(?:ceremoni[ęa](?:\s+zaślubin)?|nagranie\s+ceremonii|film\s+z\s+ceremonii);?$/i

const PREPARATION_VALUE_LABEL =
  /miejsce\s+przygotowań|przygotowania\s+odbęd|przygotowania\s*:/i

const CEREMONY_VALUE_LABEL =
  /miejsce\s+ceremonii|ceremonia\s+odbędzie|ceremonia\s*:/i

const PLACE_VALUE_HINT =
  /(?:pałac|hotel|kościół|kosciol|sala|dwór|restaurac|ul\.|al\.|os\.|,\s*[A-ZĄĆĘŁŃÓŚŹŻ])/i

export function looksLikePlaceValue(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 4) return false
  if (PREPARATION_STAGE_ONLY.test(trimmed)) return false
  if (CEREMONY_STAGE_ONLY.test(trimmed)) return false
  if (/^(?:przygotowania|ceremonia|ceremonię|nagranie|film);?$/i.test(trimmed)) {
    return false
  }
  if (PLACE_VALUE_HINT.test(trimmed)) return true
  const words = trimmed.split(/\s+/).filter(Boolean)
  return words.length >= 2 && /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(trimmed)
}

export function isPreparationStageOnly(text: string): boolean {
  const trimmed = text.trim()
  if (PREPARATION_VALUE_LABEL.test(trimmed)) return false
  if (looksLikePlaceValue(trimmed) && /przygotow/i.test(trimmed)) {
    return !PREPARATION_VALUE_LABEL.test(trimmed)
  }
  return /przygotow/i.test(trimmed) && !looksLikePlaceValue(trimmed)
}

export function isCeremonyStageOnly(text: string): boolean {
  const trimmed = text.trim()
  if (CEREMONY_VALUE_LABEL.test(trimmed)) return false
  return /ceremoni/i.test(trimmed) && !looksLikePlaceValue(trimmed)
}

export function locationLabelForField(fieldKey: ContractFieldKey): RegExp | null {
  switch (fieldKey) {
    case 'preparation_location':
      return /^(?:przygotowania|miejsce\s+przygotowań)$/i
    case 'ceremony_location':
      return /^(?:ceremonia|miejsce\s+ceremonii)$/i
    case 'reception_location':
      return /^(?:lokalizacja|miejsce\s+przyjęcia|przyjęcie)$/i
    default:
      return null
  }
}

export function extractTableLabelValuePairs(
  blocks: IndexedDocxBlock[],
): TableLabelValuePair[] {
  const tableCells = blocks.filter(
    (b): b is Extract<IndexedDocxBlock, { kind: 'tableCell' }> =>
      b.kind === 'tableCell',
  )
  const byRow = new Map<string, Extract<IndexedDocxBlock, { kind: 'tableCell' }>[]>()
  for (const block of tableCells) {
    const key = `${block.tableIndex}-${block.rowIndex}`
    const list = byRow.get(key) ?? []
    list.push(block)
    byRow.set(key, list)
  }

  const pairs: TableLabelValuePair[] = []
  for (const [, rowBlocks] of byRow) {
    const sorted = [...rowBlocks].sort((a, b) => a.cellIndex - b.cellIndex)
    if (sorted.length < 2) continue
    const labelBlock = sorted[0]
    const valueBlock = sorted[1]
    const label = labelBlock.text.trim()
    const value = valueBlock.text.trim()
    if (!label || !value) continue
    pairs.push({
      label,
      value,
      labelBlockId: labelBlock.id,
      valueBlockId: valueBlock.id,
      tableIndex: labelBlock.tableIndex,
      rowIndex: labelBlock.rowIndex,
    })
  }
  return pairs
}

export function labeledValueInBlocks(
  blocks: IndexedDocxBlock[],
  labelPattern: RegExp,
): { blockId: string; sourceText: string; value: string } | null {
  for (const block of blocks) {
    const text = block.text
    const match = text.match(
      new RegExp(`(${labelPattern.source})\\s*[:.]\\s*(.+)`, labelPattern.flags),
    )
    if (match?.[2] && looksLikePlaceValue(match[2])) {
      return {
        blockId: block.id,
        sourceText: text,
        value: match[2].trim(),
      }
    }
  }
  return null
}

export function tableValueForLocationField(
  blocks: IndexedDocxBlock[],
  fieldKey: ContractFieldKey,
): { blockId: string; sourceText: string; value: string } | null {
  const labelRe = locationLabelForField(fieldKey)
  if (!labelRe) return null
  for (const pair of extractTableLabelValuePairs(blocks)) {
    if (!labelRe.test(pair.label.trim())) continue
    if (!looksLikePlaceValue(pair.value)) continue
    return {
      blockId: pair.valueBlockId,
      sourceText: pair.value,
      value: pair.value,
    }
  }
  return null
}

export function sentenceValueForLocationField(
  blocks: IndexedDocxBlock[],
  fieldKey: ContractFieldKey,
): { blockId: string; sourceText: string; value: string } | null {
  const patterns: Record<string, RegExp> = {
    preparation_location: /przygotowania\s+odbęd[ąa]\s+się\s+(?:w|przy)\s+(.+)/i,
    ceremony_location: /ceremonia\s+odbędzie\s+się\s+(?:w|przy)\s+(.+)/i,
    reception_location: /przyjęcie\s+odbędzie\s+się\s+(?:w|przy)\s+(.+)/i,
  }
  const pattern = patterns[fieldKey]
  if (!pattern) return null
  for (const block of blocks) {
    const match = block.text.match(pattern)
    if (match?.[1] && looksLikePlaceValue(match[1])) {
      return {
        blockId: block.id,
        sourceText: block.text,
        value: match[1].trim(),
      }
    }
  }
  return null
}

export function detectStageLabelsOnly(
  blocks: IndexedDocxBlock[],
): Array<{ label: string; fieldKey: ContractFieldKey; blockId: string }> {
  const found: Array<{ label: string; fieldKey: ContractFieldKey; blockId: string }> =
    []
  for (const block of blocks) {
    const text = block.text.trim()
    if (isPreparationStageOnly(text)) {
      found.push({ label: text, fieldKey: 'preparation_location', blockId: block.id })
    }
    if (isCeremonyStageOnly(text)) {
      found.push({ label: text, fieldKey: 'ceremony_location', blockId: block.id })
    }
  }
  return found
}
