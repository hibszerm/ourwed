import { collectDuplicateChangedBlockDiagnostics } from '../blockIdIntegrity'
import { collectProtocolIntegrityViolations } from '../sparseProtocolIntegrity'

const assert = (value: boolean, message: string) => { if (!value) throw new Error(message) }
const source = [{ blockId: 'para-91', text: 'protected source' }]
const duplicate = (texts: string[]) => collectDuplicateChangedBlockDiagnostics({ changedBlocks: texts.map((text) => ({ blockId: 'para-91', text })), sourceBlockIds: ['para-91'], protectedBlockIds: new Set(['para-91']) })[0]!

const same = duplicate(['same', 'same', 'same'])
assert(same.occurrenceCount === 3 && same.duplicateClassification === 'IDENTICAL' && same.allFingerprintsEqual, 'identical duplicate')
assert(same.occurrences.every((item) => item.protected === true && item.sourceExists === true), 'protected metadata')
const conflict = duplicate(['same', 'different'])
assert(conflict.duplicateClassification === 'CONFLICTING' && !conflict.allFingerprintsEqual, 'conflicting duplicate')
const mixed = collectProtocolIntegrityViolations({ changedBlocks: [{ blockId: 'para-91', text: 'same' }, { blockId: 'para-91', text: 'same' }, { blockId: 'unknown', text: 'x' }], sourceBlocks: source })
assert(mixed.violations.some((item) => item.kind === 'DUPLICATE_BLOCK_ID'), 'duplicate diagnostic kind')
assert(mixed.violations.some((item) => item.kind === 'INVALID_BLOCK_ID'), 'unknown remains invalid')
assert(!JSON.stringify(same).includes('protected source'), 'no source/replacement prose')
console.log('PASS duplicate changed-block diagnostics')
