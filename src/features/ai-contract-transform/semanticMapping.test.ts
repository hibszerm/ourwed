import { resolveSemanticMappings, type SemanticMapping } from './semanticMapping'

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message)
}
function run(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}
const block = (blockId: string, text: string) => ({
  blockId,
  paragraphXml: `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`,
})
const mapping = (sourceBlockId: string, concept: string, anchor: string, occurrence?: number, customerIndex?: number) => ({
  sourceBlockId, concept, anchor, ...(occurrence === undefined ? {} : { occurrence }),
  ...(concept === 'customer_address' || concept === 'customer_phone' ? { customerIndex: customerIndex ?? 0 } : {}),
  ...(concept === 'customer_1_name' || concept === 'customer_2_name' ? { nameForm: 'BASE' } : {}),
})
const resolve = (mappings: unknown, sourceBlocks: ReturnType<typeof block>[]) =>
  resolveSemanticMappings({ mappings, sourceBlocks })

run('unique literal anchor resolves to a grounded span', () => {
  const result = resolve([mapping('p1', 'customer_1_name', 'Jan Kowalski')], [block('p1', 'Jan Kowalski, client')])
  assert(result.ok && result.mappings[0]?.span.start === 0, 'unique span resolved')
  assert(result.ok && result.mappings[0]?.occurrence === 0, 'resolved occurrence is explicit')
})

run('unknown source and missing anchor fail closed', () => {
  assert(!resolve([mapping('missing', 'total', '1200 zł')], [block('p1', '1200 zł')]).ok, 'unknown source rejected')
  const missing = resolve([mapping('p1', 'total', '4800 zł')], [block('p1', '1200 zł')])
  assert(!missing.ok && missing.code === 'anchor_missing', 'missing anchor rejected')
})

run('duplicate anchor requires a valid zero-based occurrence', () => {
  const source = [block('p1', 'Jan Kowalski / Jan Kowalski')]
  const ambiguous = resolve([mapping('p1', 'customer_1_name', 'Jan Kowalski')], source)
  assert(!ambiguous.ok && ambiguous.code === 'anchor_ambiguous', 'ambiguous anchor rejected')
  const second = resolve([mapping('p1', 'customer_1_name', 'Jan Kowalski', 1)], source)
  assert(second.ok && second.mappings[0]?.span.start === 15, 'second exact occurrence selected')
  const invalid = resolve([mapping('p1', 'customer_1_name', 'Jan Kowalski', 2)], source)
  assert(!invalid.ok && invalid.code === 'invalid_occurrence', 'out-of-range occurrence rejected')
})

run('same concept may map across blocks and distinct occurrences', () => {
  const result = resolve([
    mapping('p1', 'wedding_date', '2027-06-12'),
    mapping('p2', 'wedding_date', '2027-06-12'),
  ], [block('p1', 'Date 2027-06-12'), block('p2', 'Wedding 2027-06-12')])
  assert(result.ok && result.mappings.length === 2, 'same concept across blocks allowed')
  const repeated = resolve([
    mapping('p1', 'total', '1200 zł', 0),
    mapping('p1', 'total', '1200 zł', 1),
  ], [block('p1', 'Total 1200 zł and 1200 zł')])
  assert(repeated.ok && repeated.mappings.length === 2, 'distinct same-concept spans allowed')
})

run('one span cannot have multiple semantic owners', () => {
  const financeConflict = resolve([
    mapping('p1', 'deposit', '1200 zł'),
    mapping('p1', 'remaining', '1200 zł'),
  ], [block('p1', '1200 zł')])
  assert(!financeConflict.ok && financeConflict.code === 'span_conflict', 'deposit/remaining conflict rejected')
  const totalConflict = resolve([
    mapping('p1', 'total', '1200 zł'),
    mapping('p1', 'deposit', '1200 zł'),
  ], [block('p1', '1200 zł')])
  assert(!totalConflict.ok && totalConflict.code === 'span_conflict', 'total/deposit conflict rejected')
  const dateConflict = resolve([
    mapping('p1', 'wedding_date', '2027-06-12'),
    mapping('p1', 'execution_date', '2027-06-12'),
  ], [block('p1', '2027-06-12')])
  assert(!dateConflict.ok && dateConflict.code === 'span_conflict', 'opposite date role rejected')
  const partyConflict = resolve([
    mapping('p1', 'customer_1_name', 'Jan Kowalski'),
    mapping('p1', 'customer_2_name', 'Jan Kowalski'),
  ], [block('p1', 'Jan Kowalski')])
  assert(!partyConflict.ok && partyConflict.code === 'span_conflict', 'party identity conflict rejected')
  const nameFormConflict = resolve([
    { ...mapping('p1', 'customer_1_name', 'Anna Nowak'), nameForm: 'BASE' },
    { ...mapping('p1', 'customer_1_name', 'Anna Nowak'), nameForm: 'GENITIVE' },
  ], [block('p1', 'Anna Nowak')])
  assert(!nameFormConflict.ok && nameFormConflict.code === 'span_conflict', 'conflicting name forms on one span rejected')
})

run('customer names require a closed nameForm and non-name concepts forbid it', () => {
  const source = [block('p1', 'Anna Nowak')]
  assert(!resolve([{ sourceBlockId: 'p1', concept: 'customer_1_name', anchor: 'Anna Nowak' }], source).ok, 'customer name requires nameForm')
  assert(!resolve([{ ...mapping('p1', 'customer_1_name', 'Anna Nowak'), nameForm: 'LOCATIVE' }], source).ok, 'unsupported form rejected')
  assert(!resolve([{ ...mapping('p1', 'total', 'Anna Nowak'), nameForm: 'BASE' }], source).ok, 'non-name form rejected')
  assert(!resolve([{ ...mapping('p1', 'customer_phone', 'Anna Nowak'), nameForm: 'BASE' }], source).ok, 'contact concept rejects nameForm')
})

run('generic contact concepts require zero-based customer ownership and reject invalid ownership', () => {
  const source = [block('contact', 'ul. Leśna 1 +48 555 000 111')]
  for (const concept of ['customer_address', 'customer_phone']) {
    const anchor = concept === 'customer_address' ? 'ul. Leśna 1' : '+48 555 000 111'
    assert(!resolve([{ sourceBlockId: 'contact', concept, anchor }], source).ok, `${concept} requires customerIndex`)
    assert(!resolve([mapping('contact', concept, anchor, undefined, -1)], source).ok, `${concept} rejects negative customerIndex`)
  }
  const ownerConflict = resolve([
    mapping('contact', 'customer_address', 'ul. Leśna 1', undefined, 0),
    mapping('contact', 'customer_address', 'ul. Leśna 1', undefined, 1),
  ], source)
  assert(!ownerConflict.ok && ownerConflict.code === 'span_conflict', 'same span assigned to different customers conflicts')
  for (const concept of ['customer_1_name', 'wedding_date', 'total', 'reception_location']) {
    assert(!resolve([{ ...mapping('contact', concept, 'ul. Leśna 1'), customerIndex: 0 }], source).ok, `${concept} rejects customer ownership`)
  }
})

run('different non-overlapping concepts in one source block are allowed', () => {
  const result = resolve([
    mapping('p1', 'customer_1_name', 'Jan Kowalski'),
    mapping('p1', 'customer_2_name', 'Anna Nowak'),
  ], [block('p1', 'Jan Kowalski and Anna Nowak')])
  assert(result.ok && result.mappings.length === 2, 'distinct spans allowed')
})

run('overlapping spans fail closed', () => {
  const result = resolve([
    mapping('p1', 'customer_1_name', 'Jan'),
    mapping('p1', 'customer_2_name', 'Jan Kowalski'),
  ], [block('p1', 'Jan Kowalski')])
  assert(!result.ok && result.code === 'overlapping_spans', 'partial overlap rejected')
})

run('multi-run, mixed-formatting, and table-cell XML ground through existing locator', () => {
  const sources = [
    { blockId: 'multi', paragraphXml: '<w:p><w:r><w:t>Jan </w:t></w:r><w:r><w:t>Kowalski</w:t></w:r></w:p>' },
    { blockId: 'mixed', paragraphXml: '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Anna</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t> Nowak</w:t></w:r></w:p>' },
    { blockId: 'table-cell', paragraphXml: '<w:p><w:r><w:t>1200 zł</w:t></w:r></w:p>' },
  ]
  const result = resolve([
    mapping('multi', 'customer_1_name', 'Jan Kowalski'),
    mapping('mixed', 'customer_2_name', 'Anna Nowak'),
    mapping('table-cell', 'total', '1200 zł'),
  ], sources)
  assert(result.ok && result.mappings.length === 3, 'all OOXML source structures grounded')
})

run('identical duplicate mappings normalize to one mutation', () => {
  const duplicate: SemanticMapping[] = [
    { sourceBlockId: 'p1', concept: 'total', anchor: '1200 zł' },
    { sourceBlockId: 'p1', concept: 'total', anchor: '1200 zł' },
  ]
  const result = resolve(duplicate, [block('p1', 'Total 1200 zł')])
  assert(result.ok && result.mappings.length === 1, 'identical claims coalesced')
})

run('extras, replacement text, offsets, confidence, and explanations are not accepted', () => {
  const source = [block('p1', 'Jan Kowalski')]
  assert(!resolve([mapping('p1', 'extra_name', 'Jan Kowalski')], source).ok, 'extras concept rejected')
  assert(!resolve([{ ...mapping('p1', 'customer_1_name', 'Jan Kowalski'), replacement: 'Other Name' }], source).ok, 'replacement field rejected')
  assert(!resolve([{ ...mapping('p1', 'customer_1_name', 'Jan Kowalski'), start: 0, end: 12 }], source).ok, 'model offsets rejected')
  assert(!resolve([{ ...mapping('p1', 'customer_1_name', 'Jan Kowalski'), confidence: 1 }], source).ok, 'confidence rejected')
  assert(!resolve([{ ...mapping('p1', 'customer_1_name', 'Jan Kowalski'), explanation: 'identity' }], source).ok, 'explanation rejected')
})

run('invalid shape and duplicate indexed source IDs fail closed', () => {
  assert(!resolve([{ sourceBlockId: '', concept: 'total', anchor: 'x' }], []).ok, 'empty ID rejected')
  assert(!resolve([{ sourceBlockId: 'p1', concept: 'total', anchor: ' ' }], [block('p1', 'x')]).ok, 'empty anchor rejected')
  assert(!resolve([mapping('p1', 'total', 'x')], [block('p1', 'x'), block('p1', 'x')]).ok, 'duplicate source IDs rejected')
})
