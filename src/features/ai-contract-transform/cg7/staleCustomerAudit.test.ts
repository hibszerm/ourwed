import assert from 'node:assert/strict'
import type { TransformDocumentBlock } from '../types'
import { hasStaleMappedCustomerToken } from './staleCustomerAudit'

function block(blockId: string, text: string, ownershipFamily?: 'customer' | 'unknown'): TransformDocumentBlock {
  return {
    blockId, paragraphIndex: 0, text, kind: ownershipFamily ? 'tableCell' : 'paragraph',
    ...(ownershipFamily ? { tableContext: { tableIndex: 0, rowIndex: 0, cellIndex: 0, rowLabelText: 'Klient', neighboringCellTexts: [], ownershipFamily } } : {}),
  }
}

const source = [
  block('customer', 'Alicja Przykładowa', 'customer'),
  block('event', 'Alicja Przykładowa i Tomasz Modelowy wezmą ślub', 'unknown'),
  block('customer-g05', 'Helena Wzorcowa', 'customer'),
  block('event-table', 'Emil Próbny', 'unknown'),
]
const final = [
  { blockId: 'customer', text: 'Alicja Przykładowa' },
  { blockId: 'event', text: 'Alicja Przykładowa i Tomasz Modelowy wezmą ślub' },
  { blockId: 'customer-g05', text: 'Helena Wzorcowa' },
  { blockId: 'event-table', text: 'Emil Próbny' },
]

assert.equal(hasStaleMappedCustomerToken({ staleTokens: ['Alicja Przykładowa'], sourceBlocks: source, finalBlocks: final }), true, 'Alicja remaining on a mapped customer surface is stale')
assert.equal(hasStaleMappedCustomerToken({ staleTokens: ['Tomasz Modelowy'], sourceBlocks: source, finalBlocks: final }), false, 'event participant Tomasz is outside mutable customer surfaces')
assert.equal(hasStaleMappedCustomerToken({ staleTokens: ['Emil Próbny'], sourceBlocks: source, finalBlocks: final }), false, 'event participant Emil is outside mutable customer surfaces')
assert.equal(hasStaleMappedCustomerToken({ staleTokens: ['Helena Wzorcowa'], sourceBlocks: source, finalBlocks: final }), true, 'Helena remaining on the G05 customer surface is stale')
assert.equal(hasStaleMappedCustomerToken({ staleTokens: ['Emil Próbny'], sourceBlocks: source, finalBlocks: final }), false, 'Emil remaining in G05 event context is allowed')
assert.equal(hasStaleMappedCustomerToken({ staleTokens: ['Alicja Przykładowa'], sourceBlocks: source, finalBlocks: [
  { blockId: 'customer', text: 'Zofia Kalendarzowa' },
  { blockId: 'event', text: 'Alicja Przykładowa i Tomasz Modelowy wezmą ślub' },
  { blockId: 'customer-g05', text: 'Barbara Atramentowa' },
  { blockId: 'event-table', text: 'Emil Próbny' },
] }), false, 'Alicja remaining only in event context does not count as stale')
console.log('PASS stale customer audit only checks target-backed mutable customer surfaces')
