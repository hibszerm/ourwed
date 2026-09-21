import { wordsNearAmountOnStructuredSurface } from './runGoldenValidation'

const assert = (value: boolean, message: string) => {
  if (!value) throw new Error(message)
}

const source = [
  {
    blockId: 'words',
    kind: 'tableCell',
    text: 'słownie: dwadzieścia jeden tysięcy czterysta złotych 00/100',
    tableContext: { tableIndex: 1, rowIndex: 1, neighboringCellTexts: ['Łączna cena realizacji', 'słownie: dwadzieścia jeden tysięcy czterysta złotych 00/100', '21 400 zł'] },
  },
  { blockId: 'deposit', kind: 'tableCell', text: '4 800 zł', tableContext: { tableIndex: 1, rowIndex: 2, neighboringCellTexts: ['Przedpłata', '4 800 zł'] } },
]

assert(wordsNearAmountOnStructuredSurface({ sourceBlocks: source, transformedBlocks: [{ blockId: 'words', text: `${source[0]!.text} 21 400 zł Przedpłata` }], amount: 21400, expectedWords: 'dwadzieścia jeden tysięcy czterysta złotych' }) === true, 'bounded table words with suffix pass')
assert(wordsNearAmountOnStructuredSurface({ sourceBlocks: source, transformedBlocks: [{ blockId: 'words', text: 'słownie: dwadzieścia tysięcy złotych' }], amount: 21400, expectedWords: 'dwadzieścia jeden tysięcy czterysta złotych' }) === false, 'wrong authoritative words fail')
assert(wordsNearAmountOnStructuredSurface({ sourceBlocks: source, transformedBlocks: [{ blockId: 'words', text: 'słownie: dwadzieścia tysięcy złotych' }, { blockId: 'elsewhere', text: 'słownie: dwadzieścia jeden tysięcy czterysta złotych' }], amount: 21400, expectedWords: 'dwadzieścia jeden tysięcy czterysta złotych' }) === false, 'correct words elsewhere do not mask wrong surface')
assert(wordsNearAmountOnStructuredSurface({ sourceBlocks: [{ blockId: 'p', text: 'Wynagrodzenie (słownie: dwadzieścia jeden tysięcy czterysta złotych).' }], transformedBlocks: [{ blockId: 'p', text: 'Wynagrodzenie (słownie: dwadzieścia jeden tysięcy czterysta złotych).' }], amount: 21400, expectedWords: 'dwadzieścia jeden tysięcy czterysta złotych' }) === true, 'isolated prose passes')

console.log('PASS golden words validator bounded-surface regressions')
