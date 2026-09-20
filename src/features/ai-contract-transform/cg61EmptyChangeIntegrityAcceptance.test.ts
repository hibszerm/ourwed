/**
 * CG6.1 empty-change / protocol-integrity regressions (no OpenAI).
 */

import { applySparseBlockChanges } from './applySparseBlockChanges'
import { buildFullAiJsonSchemaForBlockIds } from './blockIdIntegrity'
import {
  buildProtocolIntegrityRetryHint,
  collectProtocolIntegrityViolations,
  findDestructiveEmptyReplacements,
  isEmptyOrWhitespaceReplacement,
  sourceHasMeaningfulText,
} from './sparseProtocolIntegrity'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const source = [
  { blockId: 'para-0', text: 'Umowa' },
  { blockId: 'para-9', text: 'Przygotowań ślubnych, które odbędą się w Pałacu QA Rokitno;' },
  { blockId: 'para-10', text: 'ceremonii ślubu, która odbędzie się w Pałacu QA Rokitno;' },
  { blockId: 'para-empty', text: '' },
  { blockId: 'para-ws', text: '   ' },
]

// A. non-empty source → empty newText → rejected before writer
{
  const r = applySparseBlockChanges(source as never, [
    { blockId: 'para-9', text: '' },
  ])
  assert(!r.ok && r.error.code === 'empty_text_for_nonempty_source', 'A reject empty')
  console.log('PASS  A: non-empty → empty rejected')
}

// B. whitespace-only → rejected
{
  const r = applySparseBlockChanges(source as never, [
    { blockId: 'para-9', text: '   \n\t  ' },
  ])
  assert(!r.ok && r.error.code === 'empty_text_for_nonempty_source', 'B reject ws')
  assert(isEmptyOrWhitespaceReplacement('   '), 'B helper')
  console.log('PASS  B: whitespace-only rejected')
}

// C. empty source → empty replacement is not a false-positive destructive clear
{
  const found = findDestructiveEmptyReplacements({
    changedBlocks: [{ blockId: 'para-empty', text: '' }],
    sourceBlocks: source,
  })
  assert(found.length === 0, 'C empty source ok')
  const r = applySparseBlockChanges(source as never, [
    { blockId: 'para-empty', text: '' },
  ])
  assert(r.ok, 'C apply allows empty→empty')
  console.log('PASS  C: empty source handling without false positive')
}

// D. valid changed block unaffected
{
  const r = applySparseBlockChanges(source as never, [
    { blockId: 'para-9', text: 'Przygotowań ślubnych, które odbędą się w Zamku QA;' },
  ])
  assert(r.ok, 'D valid apply')
  assert(
    r.ok &&
      r.blocks.find((b) => b.blockId === 'para-9')?.text.includes('Zamku QA'),
    'D text applied',
  )
  console.log('PASS  D: valid changed block normal path')
}

// E. invalid blockId + empty replacement → one combined retry hint (max one budget)
{
  const integrity = collectProtocolIntegrityViolations({
    changedBlocks: [
      { blockId: 'para-999', text: 'x' },
      { blockId: 'para-9', text: '' },
      { blockId: 'para-10', text: 'ok ceremony text' },
    ],
    sourceBlocks: source,
  })
  assert(integrity.needsProtocolRetry, 'E needs retry')
  assert(
    integrity.violations.some((v) => v.kind === 'INVALID_BLOCK_ID'),
    'E invalid id',
  )
  assert(
    integrity.violations.some((v) => v.kind === 'DESTRUCTIVE_EMPTY_REPLACEMENT'),
    'E empty',
  )
  const hint = buildProtocolIntegrityRetryHint({
    violations: integrity.violations,
    allowedBlockIds: source.map((s) => s.blockId),
  })
  assert(hint.includes('PROTOCOL ERROR'), 'E hint protocol')
  assert(hint.includes('para-9'), 'E hint empty id')
  assert(hint.includes('para-999') || hint.includes('Rejected'), 'E hint invalid')
  assert(hint.includes('DESTRUCTIVE_EMPTY_REPLACEMENT'), 'E hint empty kind')
  // After filtering invalid, empty still on valid set
  assert(integrity.emptyReplacements.some((e) => e.blockId === 'para-9'), 'E empty listed')
  console.log('PASS  E: invalid blockId + empty → one combined recovery hint')
}

// F. first response empty → corrected retry payload would apply
{
  const first = collectProtocolIntegrityViolations({
    changedBlocks: [{ blockId: 'para-9', text: '' }],
    sourceBlocks: source,
  })
  assert(first.needsProtocolRetry, 'F first invalid')
  const retry = collectProtocolIntegrityViolations({
    changedBlocks: [
      {
        blockId: 'para-9',
        text: 'Przygotowań ślubnych, które odbędą się w Zamku QA;',
      },
    ],
    sourceBlocks: source,
  })
  assert(!retry.needsProtocolRetry, 'F retry valid')
  const applied = applySparseBlockChanges(
    source as never,
    retry.partition.valid,
  )
  assert(applied.ok, 'F apply after corrected retry')
  console.log('PASS  F: empty then corrected → valid apply')
}

// G. retry still empty → fail closed (detectable for invoke layer)
{
  const still = findDestructiveEmptyReplacements({
    changedBlocks: [{ blockId: 'para-9', text: '  ' }],
    sourceBlocks: source,
  })
  assert(still.length === 1 && still[0]!.blockId === 'para-9', 'G still empty')
  const r = applySparseBlockChanges(source as never, [
    { blockId: 'para-9', text: '  ' },
  ])
  assert(!r.ok, 'G writer gate still rejects')
  console.log('PASS  G: retry still empty → fail closed')
}

// H. writer can never receive destructive empty mutation
{
  const r = applySparseBlockChanges(source as never, [
    { blockId: 'para-9', text: '' },
    { blockId: 'para-10', text: 'ceremonii ślubu, która odbędzie się w Zamku QA;' },
  ])
  assert(!r.ok, 'H never mutates when any empty present')
  console.log('PASS  H: writer never receives destructive empty mutation')
}

// I. schema minLength + normal valid generation does not force extra call
{
  const schema = buildFullAiJsonSchemaForBlockIds(['para-0', 'para-9'])
  const textSchema = (
    schema.schema.properties.changedBlocks as {
      items: { properties: { text: { minLength?: number } } }
    }
  ).items.properties.text
  assert(textSchema.minLength === 1, 'I schema minLength')
  assert(sourceHasMeaningfulText(source[1]!.text), 'I meaningful')
  // Valid single-call path: no protocol retry needed
  const ok = collectProtocolIntegrityViolations({
    changedBlocks: [
      { blockId: 'para-0', text: 'Umowa na reportaż' },
      { blockId: 'para-9', text: 'Przygotowań ślubnych w Zamku QA;' },
    ],
    sourceBlocks: source,
  })
  assert(!ok.needsProtocolRetry, 'I no retry for valid')
  console.log('PASS  I: schema minLength; valid generation needs no protocol retry')
}

console.log('\nAll CG6.1 empty-change integrity regressions passed.')
