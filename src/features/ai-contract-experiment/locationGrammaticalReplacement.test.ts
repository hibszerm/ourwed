/**
 * Location grammatical replacement tests.
 * Run: npm run test:location-grammatical-replacement
 */

import {
  classifyOccurrenceReplacementMode,
} from './locationOccurrenceDetection'
import { formatReplacementValueForOccurrence } from './replacementValueFormatting'
import type { ContractGenerationInput } from './types'

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

const generationInput: ContractGenerationInput = {
  currentDate: '01.01.2027',
  weddingDate: '01.07.2027',
  clients: [{ id: '1', firstName: 'A', lastName: 'B', fullName: 'A B' }],
  locations: { reception: 'Lwowska, 34-144 Izdebnik, Polska' },
  finances: {
    contractValue: 1000,
    contractValueFormatted: '1 000 zł',
    contractValueWords: 'tysiąc',
    depositAmount: 0,
    depositAmountFormatted: '0 zł',
    depositAmountWords: 'zero złotych',
    remainingAmount: 1000,
    remainingAmountFormatted: '1 000 zł',
    remainingAmountWords: 'tysiąc złotych',
    payments: [],
  },
  package: { id: 'p', name: 'Video' },
}

function main() {
  const tableMode = classifyOccurrenceReplacementMode(
    {
      fieldKey: 'reception_location',
      blockId: 'table-0',
      resolvedExactValue: 'Pałac Rydzyna, Rydzyna',
      sourceText: 'Pałac Rydzyna, Rydzyna',
    },
    {
      id: 'table-0',
      kind: 'tableCell',
      paragraphIndex: 1,
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      text: 'Pałac Rydzyna, Rydzyna',
      rowTexts: [],
      headerTexts: [],
      runs: [],
    },
    generationInput,
  )
  assertEq(tableMode, 'direct_value', '4 table direct replacement')

  const proseMode = classifyOccurrenceReplacementMode(
    {
      fieldKey: 'reception_location',
      blockId: 'para-16',
      resolvedExactValue: 'Pałacu Rydzyna',
      sourceText: 'Pałacu Rydzyna',
      grammaticalForm: 'inflected',
    },
    {
      id: 'para-16',
      kind: 'paragraph',
      paragraphIndex: 16,
      text: 'wjazd i powitanie gości w Pałacu Rydzyna;',
      runs: [],
    },
    generationInput,
  )
  assertEq(proseMode, 'manual_review_required', '6 prose needs review without venueName')

  const direct = formatReplacementValueForOccurrence({
    mapping: {
      fieldKey: 'reception_location',
      resolvedExactValue: 'Pałac Rydzyna, Rydzyna',
      sourceText: 'Pałac Rydzyna, Rydzyna',
      occurrenceReplacementMode: 'direct_value',
    },
    generationInput,
  })
  assertEq(direct, 'Lwowska, 34-144 Izdebnik, Polska', '4 direct uses full location')

  const manual = formatReplacementValueForOccurrence({
    mapping: {
      fieldKey: 'reception_location',
      resolvedExactValue: 'Pałacu Rydzyna',
      sourceText: 'Pałacu Rydzyna',
      occurrenceReplacementMode: 'manual_review_required',
    },
    generationInput,
  })
  assertEq(manual, '', '6 manual mode empty until custom value')

  console.log('ok — locationGrammaticalReplacement')
}

void main()
