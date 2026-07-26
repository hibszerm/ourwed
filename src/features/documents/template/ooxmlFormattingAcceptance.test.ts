/**
 * OOXML formatting preservation — run properties survive span replacement.
 */

import {
  replaceCanonicalSpanInParagraphXml,
  applyDocxParagraphEdits,
} from '@/features/documents/template/docxParagraphEditor'
import { buildParagraphRunModel } from '@/features/documents/template/canonicalParagraph'
import { buildMinimalDocxFromParagraphs } from '@/features/documents/template/buildMinimalDocx'
import JSZip from 'jszip'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => console.log(`PASS  ${name}`))
    .catch((err) => {
      console.error(`FAIL  ${name}`)
      console.error(err)
      process.exitCode = 1
    })
}

async function main() {
  await run('replaceCanonicalSpan preserves surrounding run rPr', () => {
    const xml = `<w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>Przed </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>15.07.2026</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t> r.</w:t></w:r></w:p>`
    const before = buildParagraphRunModel(xml)
    assert(before.canonicalText.includes('15.07.2026'), 'before text')
    const start = before.canonicalText.indexOf('15.07.2026')
    const end = start + '15.07.2026'.length
    const next = replaceCanonicalSpanInParagraphXml(
      xml,
      start,
      end,
      '29.07.2026',
    )
    assert(next.includes('<w:i'), 'italic rPr kept on replaced run family')
    assert(next.includes('29.07.2026'), 'new date')
    assert(next.includes('Przed '), 'prefix run kept')
    assert(next.includes(' r.'), 'suffix kept')
    // Must not flatten entire paragraph into a single run without rPr variety
    const runCount = (next.match(/<w:r\b/g) ?? []).length
    assert(runCount >= 2, `keeps multiple runs (got ${runCount})`)
  })

  await run('applyDocxParagraphEdits keeps paragraph properties', async () => {
    // Build a minimal docx then edit a span
    const bytes = await buildMinimalDocxFromParagraphs([
      'Data ślubu 15.07.2026 r.',
    ])
    const edited = await applyDocxParagraphEdits(bytes, [
      {
        index: 0,
        text: '',
        span: { start: 11, end: 21, replacement: '29.07.2026' },
      },
    ])
    const zip = await JSZip.loadAsync(edited)
    const xml = await zip.file('word/document.xml')!.async('string')
    assert(xml.includes('29.07.2026'), 'date replaced')
    assert(xml.includes('<w:p'), 'paragraph intact')
    assert(!xml.includes('15.07.2026'), 'old date gone')
  })

  console.log('\nOOXML formatting tests done.')
}

void main()
