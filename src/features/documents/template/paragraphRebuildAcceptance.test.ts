/**
 * Acceptance: paragraph reconstruction always keeps before + replacement + after.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/paragraphRebuildAcceptance.test.ts
 */

import JSZip from 'jszip'
import {
  applyDocxParagraphEdits,
  replaceCanonicalSpanInParagraphXml,
} from './docxParagraphEditor'
import { extractCanonicalParagraphText } from './canonicalParagraph'
import { applySlotToParagraphText } from './slotRenderer'
import type { TemplateSlot } from './types'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`PASS  ${name}`))
    .catch((err) => {
      console.error(`FAIL  ${name}`)
      console.error(err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
}

async function minimalDocx(paragraphXml: string): Promise<ArrayBuffer> {
  const z = new JSZip()
  z.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphXml}</w:body></w:document>`,
  )
  z.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
  )
  return z.generateAsync({ type: 'arraybuffer' })
}

await run('in-memory replace rebuilds before+slot+after', () => {
  const para =
    'Przedmiotem Umowy jest wykonanie dzieła w dniu 19.06.2025r., składającego się z elementów:'
  const slot: TemplateSlot = {
    id: 'wedding_date',
    registryKey: 'wedding_date',
    label: 'Data',
    sourceHint: 'wedding',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    operation: 'replace',
    paragraphIndex: 8,
    originalText: '19.06.2025',
  }
  const result = applySlotToParagraphText(para, slot, '30.10.2026', false)
  assert(result.ok, result.reason ?? 'locate failed')
  assert(
    result.text.includes('Przedmiotem Umowy') &&
      result.text.includes('30.10.2026') &&
      result.text.includes('składającego'),
    `lost surrounding text: ${result.text}`,
  )
  assert(result.text !== '30.10.2026', 'must not return only replacement')
})

await run('docx span replace keeps surrounding text', () => {
  const xml =
    '<w:p><w:r><w:t>Przedmiotem Umowy dniu 19.06.2025r., składającego</w:t></w:r></w:p>'
  const text = extractCanonicalParagraphText(xml)
  const start = text.indexOf('19.06.2025')
  const end = start + 10
  const out = replaceCanonicalSpanInParagraphXml(xml, start, end, '30.10.2026')
  const next = extractCanonicalParagraphText(out)
  assert(
    next ===
      'Przedmiotem Umowy dniu 30.10.2026r., składającego',
    `unexpected rebuild: ${next}`,
  )
})

await run('docx out-of-range span never collapses to only replacement', () => {
  const xml =
    '<w:p><w:r><w:t>before SLOT after</w:t></w:r></w:p>'
  const out = replaceCanonicalSpanInParagraphXml(xml, 0, 9999, 'ONLY')
  const next = extractCanonicalParagraphText(out)
  assert(next === 'ONLY', `clamped full-span replace: ${next}`)
  // start=0 end>len → before="", after="" → ONLY is correct for that span
  // Critical: mid-paragraph bad end must keep before
  const out2 = replaceCanonicalSpanInParagraphXml(xml, 7, 9999, 'X')
  const next2 = extractCanonicalParagraphText(out2)
  assert(next2 === 'before X', `must keep beforeText: ${next2}`)
})

await run('multiple span edits on same paragraph all apply', async () => {
  const xml = '<w:p><w:r><w:t>aaa DEPOSIT bbb BANK ccc</w:t></w:r></w:p>'
  const bytes = await minimalDocx(xml)
  const text = 'aaa DEPOSIT bbb BANK ccc'
  const dStart = text.indexOf('DEPOSIT')
  const bStart = text.indexOf('BANK')
  const out = await applyDocxParagraphEdits(bytes, [
    {
      index: 0,
      text: '',
      span: { start: bStart, end: bStart + 4, replacement: 'ACC' },
    },
    {
      index: 0,
      text: '',
      span: { start: dStart, end: dStart + 7, replacement: 'DEP' },
    },
  ])
  const zip = await JSZip.loadAsync(out)
  const doc = await zip.file('word/document.xml')!.async('string')
  const m = doc.match(/<w:p\b[\s\S]*?<\/w:p>/)!
  const next = extractCanonicalParagraphText(m[0]!)
  assert(
    next === 'aaa DEP bbb ACC ccc',
    `multi-span Map collapse: ${next}`,
  )
})

if (!process.exitCode) {
  console.log('\nAll paragraph rebuild acceptance tests passed.')
}
