import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { extractCanonicalParagraphText } from './canonicalParagraph'
import { applyDocxParagraphEdits, locateGroundedTextSpan, replaceCanonicalSpanInParagraphXml } from './docxParagraphEditor'
import { extractDocxParagraphsFromXml } from './extractDocxParagraphs'

const replace = (xml: string, start: number, end: number, value: string) => replaceCanonicalSpanInParagraphXml(xml, start, end, value)
const visible = (xml: string) => extractCanonicalParagraphText(xml)

// A. One w:t node.
const oneNode = '<w:p><w:r><w:t>prefix old suffix</w:t></w:r></w:p>'
assert.equal(visible(replace(oneNode, 7, 10, 'new')), 'prefix new suffix')

// B. Replacement crosses two w:r runs.
const twoRuns = '<w:p><w:r><w:t>ab</w:t></w:r><w:r><w:t>cd</w:t></w:r></w:p>'
assert.equal(visible(replace(twoRuns, 1, 3, 'X')), 'aXd')

// C. Replacement crosses three w:t nodes while preserving node/run structure.
const threeTextNodes = '<w:p><w:r><w:t>a</w:t><w:t>b</w:t></w:r><w:r><w:t>c</w:t><w:t>d</w:t></w:r><w:r><w:t>ef</w:t></w:r></w:p>'
const threeTextResult = replace(threeTextNodes, 1, 5, 'X')
assert.equal(visible(threeTextResult), 'aXf')
assert.equal((threeTextResult.match(/<w:t/g) ?? []).length, 5, 'keeps the original text-node structure')

// D. Differently formatted surrounding runs retain their formatting and text.
const styledRuns = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>prefix </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>old</w:t></w:r><w:r><w:rPr><w:u/></w:rPr><w:t> suffix</w:t></w:r></w:p>'
const styledResult = replace(styledRuns, 7, 10, 'new')
assert.equal(visible(styledResult), 'prefix new suffix')
assert.match(styledResult, /<w:b\/>/)
assert.match(styledResult, /<w:i\/>/)
assert.match(styledResult, /<w:u\/>/)

// E. NBSP uses the shared canonical space normalization for grounding and application.
const nbsp = '<w:p><w:r><w:t>red\u00a0blue</w:t></w:r></w:p>'
assert.equal(visible(replace(nbsp, 0, 8, 'green')), 'green')

// F. A nearby line break remains intact when the grounded span is before it.
const nearbyBreak = '<w:p><w:r><w:t>before</w:t><w:br/><w:t>after</w:t></w:r></w:p>'
const breakResult = replace(nearbyBreak, 0, 6, 'prior')
assert.equal(visible(breakResult), 'priorafter')
assert.match(breakResult, /<w:br\/>/)

// G. Prefix and suffix text in the first/last affected nodes survive a cross-run replacement.
const prefixSuffix = '<w:p><w:r><w:t>pre:ab</w:t></w:r><w:r><w:t>cd:suf</w:t></w:r></w:p>'
assert.equal(visible(replace(prefixSuffix, 4, 8, 'Z')), 'pre:Z:suf')

// Tabs inside a replaced span are removed with that replaced text; outside tabs remain.
const selectedTab = '<w:p><w:r><w:t>1)</w:t><w:tab/></w:r><w:r><w:t>word</w:t></w:r></w:p>'
const selectedTabResult = replace(selectedTab, 0, 6, '1)new')
assert.equal(visible(selectedTabResult), '1)new')
assert.doesNotMatch(selectedTabResult, /<w:tab\/>/)
const outsideTab = '<w:p><w:r><w:t>before</w:t><w:tab/><w:t>after</w:t></w:r></w:p>'
const outsideTabResult = replace(outsideTab, 0, 6, 'prior')
assert.match(outsideTabResult, /<w:tab\/>/)
assert.equal(visible(outsideTabResult), 'priorafter')

// Replay the actual source paragraph that caused the real acceptance failure.
const realFixturePath = fileURLToPath(new URL('../../contract-generation-spike/fixtures/source-video-standard.docx', import.meta.url))
const realFixtureBytes = await readFile(realFixturePath)
const realFixtureBuffer = realFixtureBytes.buffer.slice(realFixtureBytes.byteOffset, realFixtureBytes.byteOffset + realFixtureBytes.byteLength)
const realZip = await JSZip.loadAsync(realFixtureBuffer)
const realXml = await realZip.file('word/document.xml')!.async('string')
const realParagraphXml = [...realXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)][8]![0]
assert.equal(visible(realParagraphXml), '1)Przygotowań ślubnych, które odbędą się w Willi Berlińskiej;')
const realEdited = await applyDocxParagraphEdits(realFixtureBuffer, [{ index: 8, text: '', span: { start: 0, end: 61, replacement: '1)Przygotowań ślubnych, które odbędą się w miejscu przygotowań Pana Młodego: Wolności 110, 30-661 Kraków oraz Panny Młodej: Marii Konopnickiej 6, 04-218 Kraków;' } }])
const realEditedZip = await JSZip.loadAsync(realEdited)
const realEditedXml = await realEditedZip.file('word/document.xml')!.async('string')
assert.equal(extractDocxParagraphsFromXml(realEditedXml).paragraphs[8]?.text, '1)Przygotowań ślubnych, które odbędą się w miejscu przygotowań Pana Młodego: Wolności 110, 30-661 Kraków oraz Panny Młodej: Marii Konopnickiej 6, 04-218 Kraków;')

// H. Repeated literal text is ambiguous without a grounded occurrence; fail closed.
const ambiguous = locateGroundedTextSpan('<w:p><w:r><w:t>repeat then repeat</w:t></w:r></w:p>', 'repeat')
assert.deepEqual(ambiguous, { ok: false, reason: 'ambiguous' })

// Escaped XML text is decoded consistently for grounding and replacement.
const escaped = '<w:p><w:r><w:t>A &amp; B</w:t></w:r></w:p>'
assert.equal(visible(replace(escaped, 2, 5, 'and')), 'A and')

console.log('PASS grounded DOCX run mapping: single/multi-node edits, styles, NBSP, tabs, line breaks, entities, ambiguity')
