import { buildExpectationManifest } from './expectationManifest'
import { applyDeterministicRepairs } from './deterministicRepairs'
import type { ContractTransformationDataset, TransformDocumentBlock } from '../types'

const assert = (value: boolean, message: string) => { if (!value) throw new Error(message) }
const dataset: ContractTransformationDataset = {
  clients: { displayNames: 'Natalia Brzegowa i Filip Brzegowy', personCount: 2 },
  dates: { weddingDate: '24.07.2027', contractExecutionDate: '05.11.2026' }, locations: {}, package: {},
  finances: { contractValueFormatted: '21 400 zł', contractValueWords: 'dwadzieścia jeden tysięcy czterysta złotych' },
}
const sourceText = 'Studio Foto sp. z o.o., NIP 000-000-00-03, zwaną dalej Wykonawcą, a Mają Przykładową i Kacpra Modelowego, zwanymi dalej łącznie Zamawiającymi.'
const source: TransformDocumentBlock[] = [{ blockId: 'mixed', paragraphIndex: 0, kind: 'paragraph', text: sourceText }]
const manifest = buildExpectationManifest({ sourceBlocks: source, dataset, protectedData: { exactProtectedValues: [], protectedPatterns: [] } })
const repaired = applyDeterministicRepairs({ blocks: [{ blockId: 'mixed', text: sourceText }], sourceBlocks: source, dataset, manifest }).blocks[0]!.text
assert(repaired.includes('Natalię Brzegową i Filipa Brzegowego'), 'inflected customer span repaired')
assert(repaired.startsWith('Studio Foto sp. z o.o., NIP 000-000-00-03, zwaną dalej Wykonawcą'), 'provider/legal prefix preserved')
assert(repaired.endsWith('zwanymi dalej łącznie Zamawiającymi.'), 'legal suffix preserved')
const ambiguous = source.map((b) => ({ ...b, text: `${b.text} oraz Mają Przykładową i Kacpra Modelowego` }))
const ambManifest = buildExpectationManifest({ sourceBlocks: ambiguous, dataset, protectedData: { exactProtectedValues: [], protectedPatterns: [] } })
const ambOut = applyDeterministicRepairs({ blocks: [{ blockId: 'mixed', text: ambiguous[0]!.text }], sourceBlocks: ambiguous, dataset, manifest: ambManifest }).blocks[0]!.text
assert(ambOut === ambiguous[0]!.text, 'ambiguous duplicate span fails closed')
console.log('PASS mixed protected party span regressions')
