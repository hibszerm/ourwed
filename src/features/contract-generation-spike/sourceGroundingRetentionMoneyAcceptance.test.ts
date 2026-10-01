import assert from 'node:assert/strict'
import { formatPolishPlnAmount, isPolishPlnAmountEquivalent } from './polishPlnAmount'

assert.equal(formatPolishPlnAmount(9800), 'dziewięć tysięcy osiemset złotych 00/100')
assert.equal(formatPolishPlnAmount(10600), 'dziesięć tysięcy sześćset złotych 00/100')
assert.equal(formatPolishPlnAmount('1 234,56 zł'), 'tysiąc dwieście trzydzieści cztery złote 56/100')
assert.equal(isPolishPlnAmountEquivalent(10600, 'dziesięć tysięcy sześćset złotych 00/100'), true)
assert.equal(isPolishPlnAmountEquivalent(10600, 'dziesięć tysięcy sześćset złotych 01/100'), false)
console.log('PASS Polish PLN written-out amount formatting acceptance')
