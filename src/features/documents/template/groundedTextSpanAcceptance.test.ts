import {
  extractCanonicalParagraphText,
} from './canonicalParagraph'
import {
  locateGroundedTextSpan,
  replaceGroundedTextSpan,
} from './docxParagraphEditor'

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
})

run('G03-style mixed party paragraph leaves provider/legal content unchanged', () => {
  const p = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Customer One</w:t></w:r><w:r><w:t> and Customer Two are clients; Provider legal role remains unchanged.</w:t></w:r></w:p>'
  const found = locateGroundedTextSpan(p, 'Customer Two')
  assert(found.ok, 'party anchor found')
  const next = replaceGroundedTextSpan(p, found.span, 'Replacement Client')
  assert(extractCanonicalParagraphText(next) === 'Customer One and Replacement Client are clients; Provider legal role remains unchanged.', 'party replacement only')
  assert(next.includes('Provider legal role remains unchanged.'), 'provider text retained')
})
