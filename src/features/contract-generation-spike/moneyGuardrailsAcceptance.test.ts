import assert from 'node:assert/strict'
import { formatPlnInteger, normalizeAuthoritativeFinancialBlocks, normalizeAuthoritativePlnText } from './generator'

assert.equal(formatPlnInteger(1000), '1 000 zł')
assert.equal(formatPlnInteger(14200), '14 200 zł')
assert.equal(formatPlnInteger(13200), '13 200 zł')
assert.equal(formatPlnInteger(900), '900 zł')

const bankAccount = '70 2490 0005 0000 4500 4122 4894'
const normalized = normalizeAuthoritativePlnText(`1000 zł; 14200 zł; 13200 zł; 900 zł; rachunek ${bankAccount}; NIP 6482810484; call 1000`, [1000, 14200, 13200])
assert.match(normalized, /1 000 zł; 14 200 zł; 13 200 zł; 900 zł/)
assert.ok(normalized.includes(bankAccount), 'bank account remains unchanged')
assert.ok(normalized.includes('NIP 6482810484'), 'NIP remains unchanged')
assert.ok(normalized.includes('call 1000'), 'unrelated non-money occurrence remains unchanged')

const sourceBlocks = [
  { blockId: 'deposit', text: 'Zadatek wynosi 1000 zł.' },
  { blockId: 'canonical-deposit', text: 'Zadatek wynosi 1 000 zł.' },
  { blockId: 'unrelated', text: 'Paragraf 1000 określa termin.' },
  { blockId: 'total', text: 'Wynagrodzenie 14200 zł.' },
  { blockId: 'remaining', text: 'Pozostało 13200 zł.' },
]
const financialUpdates = normalizeAuthoritativeFinancialBlocks(sourceBlocks, [1000, 14200, 13200])
assert.deepEqual(financialUpdates.map(({ block }) => block.blockId), ['deposit', 'total', 'remaining'], 'only blocks with non-canonical authoritative PLN values require mechanical updates')
assert.equal(financialUpdates[0]?.text, 'Zadatek wynosi 1 000 zł.', 'numeric equality does not suppress a formatting-only deposit update')
assert.equal(financialUpdates.find(({ block }) => block.blockId === 'total')?.text, 'Wynagrodzenie 14 200 zł.')
assert.equal(financialUpdates.find(({ block }) => block.blockId === 'remaining')?.text, 'Pozostało 13 200 zł.')
assert.ok(!financialUpdates.some(({ block }) => block.blockId === 'canonical-deposit'), 'already-canonical value does not create an unnecessary update')
assert.ok(!financialUpdates.some(({ block }) => block.blockId === 'unrelated'), 'unrelated number is not modified')

console.log('PASS contract-generation-spike canonical money formatting')
