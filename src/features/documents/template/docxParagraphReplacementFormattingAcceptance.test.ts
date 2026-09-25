import assert from 'node:assert/strict'
import { extractCanonicalParagraphText } from './canonicalParagraph'
import { replaceCanonicalSpanInParagraphXml } from './docxParagraphEditor'

const replace = (xml: string, start: number, end: number, value: string) => replaceCanonicalSpanInParagraphXml(xml, start, end, value)
const visible = (xml: string) => extractCanonicalParagraphText(xml)

// A. A bold numbering marker stays bold while the replacement body uses the normal body style.
const boldNumber = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>1)</w:t><w:tab/></w:r><w:r><w:t>old body</w:t></w:r></w:p>'
const boldNumberResult = replace(boldNumber, 0, 10, '1)new body')
assert.equal(visible(boldNumberResult), '1)new body')
assert.match(boldNumberResult, /<w:r><w:rPr><w:b\/><\/w:rPr><w:t>1\)<\/w:t><w:tab\/><\/w:r>/)
assert.match(boldNumberResult, /<w:r><w:t>new body<\/w:t><\/w:r>/)

// B. A normal short prefix remains normal when body text is bold.
const normalNumber = '<w:p><w:r><w:t>1)</w:t><w:tab/></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>old body</w:t></w:r></w:p>'
const normalNumberResult = replace(normalNumber, 0, 10, '1)new body')
assert.equal(visible(normalNumberResult), '1)new body')
assert.match(normalNumberResult, /<w:r><w:t>1\)<\/w:t><w:tab\/><\/w:r>/)
assert.match(normalNumberResult, /<w:r><w:rPr><w:b\/><\/w:rPr><w:t>new body<\/w:t><\/w:r>/)

// C. A short bold label remains emphasized and new body text uses the dominant normal style.
const label = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Uwagi:</w:t></w:r><w:r><w:t>old body</w:t></w:r></w:p>'
const labelResult = replace(label, 0, 14, 'Uwagi: new body')
assert.equal(visible(labelResult), 'Uwagi: new body')
assert.match(labelResult, /<w:r><w:rPr><w:b\/><\/w:rPr><w:t>Uwagi:<\/w:t><\/w:r>/)
assert.match(labelResult, /<w:r><w:t> new body<\/w:t><\/w:r>/)

// D. Uniformly styled nodes keep their style and receive the replacement.
const uniform = '<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>ab</w:t><w:t>cd</w:t><w:t>ef</w:t></w:r></w:p>'
const uniformResult = replace(uniform, 1, 5, 'X')
assert.equal(visible(uniformResult), 'aXf')
assert.equal((uniformResult.match(/<w:i\/>/g) ?? []).length, 1)

// E. Unchanged styled prefix/suffix stay exact around a replacement.
const surrounding = '<w:p><w:r><w:rPr><w:u/></w:rPr><w:t>pre:</w:t></w:r><w:r><w:t>old body</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>:suf</w:t></w:r></w:p>'
const surroundingResult = replace(surrounding, 4, 12, 'new')
assert.equal(visible(surroundingResult), 'pre:new:suf')
assert.match(surroundingResult, /<w:r><w:rPr><w:u\/><\/w:rPr><w:t>pre:<\/w:t><\/w:r>/)
assert.match(surroundingResult, /<w:r><w:rPr><w:i\/><\/w:rPr><w:t>:suf<\/w:t><\/w:r>/)

// F. Equal competing styles have no defensible dominant style and fail closed.
const tied = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>ab</w:t></w:r><w:r><w:t>cd</w:t></w:r></w:p>'
assert.throws(() => replace(tied, 0, 4, 'new text'), /no dominant run style/)

console.log('PASS DOCX replacement formatting: structural prefixes, styled labels, uniform runs, surrounding styles, ambiguity')
