import {
  extractCanonicalParagraphText,
} from './canonicalParagraph'
import {
  locateGroundedTextSpan,
  replaceGroundedTextSpan,
} from './docxParagraphEditor'
import {
  extractSemanticParagraphTextSlots,
  reconstructSemanticSpanAuditText,
} from '@/features/ai-contract-transform/cg7/semanticSpanReplayAudit'

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message)
}
function run(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}
function assertXmlWellFormed(xml: string) {
  const stack: string[] = []
  for (const match of xml.matchAll(/<([^!?][^>]*?)>/g)) {
    const token = match[1]!.trim()
    if (token.startsWith('/')) {
      assert(stack.pop() === token.slice(1).split(/\s/)[0], 'balanced XML close tag')
    } else if (!token.endsWith('/')) {
      stack.push(token.split(/\s/)[0]!)
    }
  }
  assert(stack.length === 0, 'all XML tags closed')
}

run('single-run customer anchor preserves paragraph and sibling run XML', () => {
  const p = '<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Customer Name</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>, provider/legal terms</w:t></w:r></w:p>'
  const found = locateGroundedTextSpan(p, 'Customer Name')
  assert(found.ok, 'anchor found')
  const next = replaceGroundedTextSpan(p, found.span, 'New Name')
  assertXmlWellFormed(next)
  assert(extractCanonicalParagraphText(next) === 'New Name, provider/legal terms', 'text preserved')
  assert(next.includes('<w:pPr><w:jc w:val="both"/></w:pPr>'), 'pPr retained')
  assert(next.includes('<w:rPr><w:i/></w:rPr><w:t>, provider/legal terms</w:t>'), 'sibling run retained exactly')
})

run('mixed-run anchor crosses formatting boundary and keeps suffix formatting', () => {
  const p = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Aleks</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>andra</w:t></w:r><w:r><w:rPr><w:u/></w:rPr><w:t>, legal suffix</w:t></w:r></w:p>'
  const found = locateGroundedTextSpan(p, 'Aleksandra')
  assert(found.ok, 'cross-run anchor found')
  const next = replaceGroundedTextSpan(p, found.span, 'Marta')
  assert(extractCanonicalParagraphText(next) === 'Marta, legal suffix', 'replacement and suffix')
  assert(next.includes('<w:rPr><w:b/></w:rPr><w:t>Marta</w:t>'), 'replacement inherits first character run')
  assert(next.includes('<w:rPr><w:i/></w:rPr><w:t></w:t>'), 'covered run stays in place')
  assert(next.includes('<w:rPr><w:u/></w:rPr><w:t>, legal suffix</w:t>'), 'suffix formatting retained')
})

run('date, finance and table-cell spans use same generic primitive', () => {
  for (const [p, anchor, replacement] of [
    ['<w:p><w:r><w:t>Execution date: 2027-04-05</w:t></w:r></w:p>', '2027-04-05', '2027-06-07'],
    ['<w:p><w:r><w:t>Total: 1200 zł</w:t></w:r></w:p>', '1200 zł', '1500 zł'],
    ['<w:p><w:r><w:t>Client in table cell</w:t></w:r></w:p>', 'Client', 'Party'],
  ]) {
    const found = locateGroundedTextSpan(p, anchor)
    assert(found.ok, 'anchor found')
    const next = replaceGroundedTextSpan(p, found.span, replacement)
    assert(extractCanonicalParagraphText(next).includes(replacement), 'value replaced')
  }
  const cell = '<w:tc><w:tcPr><w:shd w:fill="FFFF00"/></w:tcPr><w:p><w:r><w:t>Client in table cell</w:t></w:r></w:p></w:tc>'
  const found = locateGroundedTextSpan(cell.match(/<w:p[\s\S]*?<\/w:p>/)![0]!, 'Client')
  assert(found.ok, 'table paragraph anchor')
  const paragraph = cell.match(/<w:p[\s\S]*?<\/w:p>/)![0]!
  const next = replaceGroundedTextSpan(paragraph, found.span, 'Party')
  assert(cell.replace(paragraph, next).includes('<w:tcPr><w:shd w:fill="FFFF00"/></w:tcPr>'), 'table properties retained')
})

run('duplicate anchors require exact occurrence and preserve other occurrence', () => {
  const p = '<w:p><w:r><w:t>Name / Name</w:t></w:r></w:p>'
  assert(!locateGroundedTextSpan(p, 'Name').ok, 'ambiguous without occurrence')
  const second = locateGroundedTextSpan(p, 'Name', 1)
  assert(second.ok, 'second occurrence selected')
  const next = replaceGroundedTextSpan(p, second.span, 'Client')
  assert(extractCanonicalParagraphText(next) === 'Name / Client', 'only selected occurrence replaced')
  assert(!locateGroundedTextSpan(p, 'Name', 2).ok, 'invalid occurrence rejected')
})

run('missing, invalid, and unsupported canonical mapping fail closed', () => {
  const p = '<w:p><w:r><w:t>Source text</w:t></w:r></w:p>'
  assert(!locateGroundedTextSpan(p, 'missing').ok, 'missing anchor rejected')
  assert(!locateGroundedTextSpan(p, 'Source', -1).ok, 'negative occurrence rejected')
  const canonicalizationBoundary = '<w:p><w:r><w:t>e</w:t></w:r><w:r><w:t>\u0301</w:t></w:r></w:p>'
  const result = locateGroundedTextSpan(canonicalizationBoundary, 'é')
  assert(!result.ok && result.reason === 'unmappable', 'non-1:1 canonical mapping rejected')
  let threw = false
  try { replaceGroundedTextSpan(p, { start: -1, end: 2 }, 'bad') } catch { threw = true }
  assert(threw, 'invalid span replacement throws')
  const unsupported = '<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r></w:p>'
  const unsupportedResult = locateGroundedTextSpan(unsupported, 'AB')
  assert(!unsupportedResult.ok && unsupportedResult.reason === 'unmappable', 'w:tab remains unsupported')
})

run('logical-value breaks outside grounded spans survive multiline replacements', () => {
  const cell = '<w:p><w:r><w:t>Alice</w:t><w:br/><w:t>Street 1</w:t><w:br/><w:t>PESEL 123</w:t></w:r></w:p>'
  const alice = locateGroundedTextSpan(cell, 'Alice')
  assert(alice.ok, 'name anchor found')
  const afterName = replaceGroundedTextSpan(cell, alice.span, 'Helena')
  assert(extractCanonicalParagraphText(afterName) === 'HelenaStreet 1PESEL 123', 'text values replaced/preserved')
  assert((afterName.match(/<w:br\/>/g) ?? []).length === 2, 'name/address and address/PESEL breaks preserved')
  assert(afterName.includes('<w:t>Helena</w:t><w:br/><w:t>Street 1</w:t><w:br/><w:t>PESEL 123</w:t>'), 'separator locality preserved')
  const address = locateGroundedTextSpan(afterName, 'Street 1')
  assert(address.ok, 'address anchor found')
  const afterAddress = replaceGroundedTextSpan(afterName, address.span, 'New Street 2')
  assert(afterAddress.includes('Helena</w:t><w:br/><w:t>New Street 2</w:t><w:br/><w:t>PESEL 123'), 'address replacement keeps both surrounding separators')
  assert((afterAddress.match(/<w:br\/>/g) ?? []).length === 2, 'both breaks remain after name and address replacement')

  const emailPhone = '<w:p><w:r><w:t>old@example.test</w:t><w:br/><w:t>+48 500 000 001</w:t></w:r></w:p>'
  const email = locateGroundedTextSpan(emailPhone, 'old@example.test')
  assert(email.ok, 'email anchor found')
  const next = replaceGroundedTextSpan(emailPhone, email.span, 'new@example.test')
  assert(next.includes('new@example.test</w:t><w:br/><w:t>+48 500 000 001'), 'email/phone separation remains')

  const tabbed = '<w:p><w:r><w:t>old@example.test</w:t><w:br/><w:t>+48 500 000 001</w:t><w:tab/><w:t>tail</w:t></w:r></w:p>'
  const tabAnchor = locateGroundedTextSpan(tabbed, 'old@example.test')
  assert(tabAnchor.ok, 'tabbed paragraph email anchor found')
  const tabbedNext = replaceGroundedTextSpan(tabbed, tabAnchor.span, 'new@example.test')
  assert(tabbedNext.includes('<w:br/>') && tabbedNext.includes('<w:tab/>'), 'unmapped break and tab retained')
})

run('a grounded span crossing structural breaks retains ordered segment coordinates', () => {
  const full = '<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>A</w:t><w:br/><w:t>B</w:t></w:r></w:p>'
  const found = locateGroundedTextSpan(full, 'AB')
  assert(found.ok, 'exact anchor spanning a line break grounds')
  assert(JSON.stringify(found.span.segments) === JSON.stringify([{ start: 0, end: 1 }, { start: 1, end: 2 }]), 'grounded span records ordered editable segments')
  let rejectedFlat = false
  try { replaceGroundedTextSpan(full, found.span, 'XY') } catch { rejectedFlat = true }
  assert(rejectedFlat, 'flat replacement cannot guess target segmentation')
  const replaced = replaceGroundedTextSpan(full, found.span, ['X', 'Y'])
  assert(replaced.includes('<w:t>X</w:t><w:br/><w:t>Y</w:t>'), 'target components occupy corresponding slots')
  assert((replaced.match(/<w:br\b/g) ?? []).length === 1, 'same source break survives')
  assertXmlWellFormed(replaced)
  assertXmlWellFormed(full)

  const multiple = '<w:p><w:r><w:t>A</w:t><w:br/><w:t>B</w:t><w:br/><w:t>C</w:t></w:r></w:p>'
  const multipleSpan = locateGroundedTextSpan(multiple, 'ABC')
  assert(multipleSpan.ok && multipleSpan.span.segments?.length === 3, 'multiple line breaks produce three ordered slots')
  const multiResult = replaceGroundedTextSpan(multiple, multipleSpan.span, ['X', 'Y', 'Z'])
  assert(multiResult.includes('<w:t>X</w:t><w:br/><w:t>Y</w:t><w:br/><w:t>Z</w:t>'), 'multiple existing breaks remain ordered')

  for (const [xml, anchor, expectedBreaks] of [
    ['<w:p><w:r><w:br/><w:t>TARGET</w:t></w:r></w:p>', 'TARGET', 1],
    ['<w:p><w:r><w:t>TARGET</w:t><w:br/></w:r></w:p>', 'TARGET', 1],
    ['<w:p><w:r><w:t>PREFIX</w:t><w:br/><w:t>TARGET</w:t><w:br/><w:t>SUFFIX</w:t></w:r></w:p>', 'TARGET', 2],
  ] as const) {
    const span = locateGroundedTextSpan(xml, anchor)
    assert(span.ok, 'target away from break found')
    const result = replaceGroundedTextSpan(xml, span.span, 'REPLACED')
    assert((result.match(/<w:br\/>/g) ?? []).length === expectedBreaks, 'outside break preserved')
  }

  const surrounded = '<w:p><w:r><w:t>prefix A</w:t><w:br/><w:t>B suffix</w:t></w:r></w:p>'
  const surroundedSpan = locateGroundedTextSpan(surrounded, 'AB')
  assert(surroundedSpan.ok, 'interior anchor crossing supported break grounds')
  const surroundedResult = replaceGroundedTextSpan(surrounded, surroundedSpan.span, ['X', 'Y'])
  assert(extractCanonicalParagraphText(surroundedResult) === 'prefix XY suffix', 'surrounding text remains outside mapped segments')
  assert(surroundedResult.includes('<w:br/>'), 'interior source break remains')

  const tableParagraph = '<w:p><w:r><w:t>A</w:t><w:br/><w:t>B</w:t></w:r></w:p>'
  const cell = `<w:tc><w:tcPr><w:shd w:fill="FFFF00"/></w:tcPr>${tableParagraph}</w:tc>`
  const cellSpan = locateGroundedTextSpan(tableParagraph, 'AB')
  assert(cellSpan.ok, 'same-paragraph anchor in a table cell grounds')
  const cellNext = replaceGroundedTextSpan(tableParagraph, cellSpan.span, ['X', 'Y'])
  assert(cell.replace(tableParagraph, cellNext).includes('<w:tcPr><w:shd w:fill="FFFF00"/></w:tcPr>') && cellNext.includes('<w:br/>'), 'table-cell context and separator remain')
})

run('structured cross-break targets preserve exact components and the source break', () => {
  const source = '<w:p><w:r><w:t xml:space="preserve">prefix Old Venue</w:t><w:br/><w:t xml:space="preserve">Old Street 1, Old City suffix</w:t></w:r></w:p>'
  const found = locateGroundedTextSpan(source, 'Old VenueOld Street 1, Old City')
  assert(found.ok, 'complete two-slot source location grounds')
  assert(JSON.stringify(found.span.segments) === JSON.stringify([{ start: 7, end: 16 }, { start: 16, end: 38 }]), 'grounded span identifies the two ordered source slots')

  const targetSegments = ['Hotel Motława, apartament 512', 'ul. Chmielna 7, Gdańsk']
  const next = replaceGroundedTextSpan(source, found.span, targetSegments)
  assert(next.includes('<w:t xml:space="preserve">prefix Hotel Motława, apartament 512</w:t><w:br/><w:t xml:space="preserve">ul. Chmielna 7, Gdańsk suffix</w:t>'), 'each structured target component occupies its corresponding source slot')
  assert((next.match(/<w:br\b/g) ?? []).length === 1, 'the existing structural break remains exactly once')
  const expectedFlat = reconstructSemanticSpanAuditText(extractCanonicalParagraphText(source), [{
    span: found.span,
    replacement: targetSegments.join(', '),
    replacementSegments: targetSegments,
  }])
  assert(extractCanonicalParagraphText(next) === expectedFlat, 'segment-aware audit does not expect a flattened delimiter at the structural break')
  assert(JSON.stringify(extractSemanticParagraphTextSlots(next)) === JSON.stringify(['prefix Hotel Motława, apartament 512', 'ul. Chmielna 7, Gdańsk suffix']), 'each exact component remains in its ordered structural slot')
  assert(next.includes('Hotel Motława, apartament 512'), 'punctuation inside the first target component is exact')
  assert(next.includes('ul. Chmielna 7, Gdańsk'), 'punctuation inside the second target component is exact')
  assertXmlWellFormed(next)
})

run('G03-style mixed party paragraph leaves provider/legal content unchanged', () => {
  const p = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Customer One</w:t></w:r><w:r><w:t> and Customer Two are clients; Provider legal role remains unchanged.</w:t></w:r></w:p>'
  const found = locateGroundedTextSpan(p, 'Customer Two')
  assert(found.ok, 'party anchor found')
  const next = replaceGroundedTextSpan(p, found.span, 'Replacement Client')
  assert(extractCanonicalParagraphText(next) === 'Customer One and Replacement Client are clients; Provider legal role remains unchanged.', 'party replacement only')
  assert(next.includes('Provider legal role remains unchanged.'), 'provider text retained')
})
