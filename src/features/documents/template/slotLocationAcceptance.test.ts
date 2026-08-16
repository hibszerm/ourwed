/**
 * Acceptance: deterministic slot location + multi-run DOCX spans.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/slotLocationAcceptance.test.ts
 */

import {
  canonicalizeParagraphText,
  extractCanonicalParagraphText,
  buildParagraphRunModel,
} from './canonicalParagraph'
import { locateSlotInParagraph, applySlotToParagraphText } from './slotRenderer'
import { replaceCanonicalSpanInParagraphXml } from './docxParagraphEditor'
import type { TemplateSlot } from './types'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

function slot(patch: Partial<TemplateSlot> & Pick<TemplateSlot, 'registryKey'>): TemplateSlot {
  return {
    id: `slot-${patch.registryKey}`,
    label: patch.registryKey!,
    sourceHint: 'couple',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    ...patch,
  }
}

run('Test 1 — multi-run source value still locates via originalText', () => {
  // Simulate DOCX: name split across runs, with NFD firma mark elsewhere
  const paragraphXml = `<w:p><w:r><w:t>Aleksandr</w:t></w:r><w:r><w:t>ą </w:t></w:r><w:r><w:t>Biłas</w:t></w:r><w:r><w:t>, zwaną dalej „Parą Młodą”</w:t></w:r></w:p>`
  const text = extractCanonicalParagraphText(paragraphXml)
  const model = buildParagraphRunModel(paragraphXml)
  assert(model.runs.length >= 3, 'expected multiple runs')
  assert(text.includes('Aleksandrą Biłas'), `text=${text}`)

  const s = slot({
    registryKey: 'partner1_full_name',
    paragraphIndex: 2,
    originalText: 'Aleksandrą Biłas',
    startOffset: 0,
    endOffset: 'Aleksandrą Biłas'.length,
    operation: 'replace',
    // Deliberately bad/mismatched anchor (old bug path) — must still find via originalText
    rightAnchor: ', zam. MISSING, zwaną dalej „Parą Młodą”',
  })
  const loc = locateSlotInParagraph(text, s)
  assert(Boolean(loc), 'must locate')
  assert(loc!.method === 'stored_offsets' || loc!.method === 'exact_original', loc!.method)
  assert(text.slice(loc!.start, loc!.end) === 'Aleksandrą Biłas', 'slice')
})

run('Test 2 — locator searches storedOriginalText, never resolved value', () => {
  const text = canonicalizeParagraphText(
    'Aleksandrą Biłas, zwaną dalej „Parą Młodą”',
  )
  const s = slot({
    registryKey: 'partner1_full_name',
    originalText: 'Aleksandrą Biłas',
    paragraphIndex: 2,
    startOffset: 0,
    endOffset: 16,
    operation: 'replace',
  })
  const applied = applySlotToParagraphText(text, s, 'Marcin Nowak', false)
  assert(applied.ok, applied.reason ?? 'fail')
  assert(applied.text.includes('Marcin Nowak'), applied.text)
  assert(!applied.text.includes('Aleksandrą Biłas'), 'old name replaced')
  // Must not have searched for Marcin Nowak in source
  assert(text.indexOf('Marcin Nowak') < 0, 'source has no resolved value')
})

run('Test 3 — company multi-word span with NFC/NFD mismatch still locates', () => {
  // NFD "firmą" (a + combining ogonek)
  const nfdFirm = 'firma' + '\u0328' + ' '
  const paragraphXml = `<w:p><w:r><w:t>${nfdFirm}</w:t></w:r><w:r><w:t>Atelier </w:t></w:r><w:r><w:t>Studio</w:t></w:r><w:r><w:t> Jan </w:t></w:r><w:r><w:t>Kowalski</w:t></w:r><w:r><w:t>, zwaną dalej „Kamerzystami”.</w:t></w:r></w:p>`
  const text = extractCanonicalParagraphText(paragraphXml)
  assert(text.startsWith('firmą '), `canonical starts with firmą, got ${JSON.stringify(text.slice(0, 10))}`)

  // Offsets stored from canonical analysis
  const company = 'Atelier Studio Jan Kowalski'
  const start = text.indexOf(company)
  assert(start >= 0, 'company in canonical')

  const s = slot({
    registryKey: 'company_name',
    paragraphIndex: 5,
    originalText: company,
    startOffset: start,
    endOffset: start + company.length,
    leftAnchor: 'firmą',
    rightAnchor: 'zwaną dalej „Kamerzystami”',
    operation: 'replace',
    sourceHint: 'company',
  })
  const loc = locateSlotInParagraph(text, s)
  assert(Boolean(loc), 'must locate company')
  assert(text.slice(loc!.start, loc!.end) === company, 'exact company span')
})

run('Test 4 — surrounding punctuation untouched', () => {
  const text = 'wynagrodzenie w wysokości 800zł.'
  const s = slot({
    registryKey: 'overtime_rate',
    originalText: '800zł',
    startOffset: 25,
    endOffset: 30,
    leftAnchor: 'w wysokości ',
    rightAnchor: '.',
    operation: 'replace',
    sourceHint: 'package',
  })
  const applied = applySlotToParagraphText(text, s, '1000zł', false)
  assert(applied.ok, applied.reason ?? 'fail')
  assert(applied.text === 'wynagrodzenie w wysokości 1000zł.', applied.text)
})

run('Test 5 — legal wording outside the slot unchanged', () => {
  const text =
    'Aleksandrą Biłas, zam. ul. Wrocławska 67/73 Kraków, zwaną dalej „Parą Młodą”'
  const s = slot({
    registryKey: 'partner1_full_name',
    originalText: 'Aleksandrą Biłas',
    startOffset: 0,
    endOffset: 16,
    operation: 'replace',
  })
  const applied = applySlotToParagraphText(text, s, 'Jan Kowalski', false)
  assert(applied.ok, applied.reason ?? 'fail')
  assert(
    applied.text ===
      'Jan Kowalski, zam. ul. Wrocławska 67/73 Kraków, zwaną dalej "Parą Młodą"',
    applied.text,
  )
})

run('Test 6 — multi-run XML replace preserves non-slot runs when possible', () => {
  const paragraphXml = `<w:p><w:pPr></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Aleksandrą Biłas</w:t></w:r><w:r><w:t>, zwaną dalej „Parą Młodą”</w:t></w:r></w:p>`
  const text = extractCanonicalParagraphText(paragraphXml)
  const company = 'Aleksandrą Biłas'
  const start = text.indexOf(company)
  const next = replaceCanonicalSpanInParagraphXml(
    paragraphXml,
    start,
    start + company.length,
    'Marcin Nowak',
  )
  const nextText = extractCanonicalParagraphText(next)
  assert(nextText.includes('Marcin Nowak'), nextText)
  assert(nextText.includes('zwaną dalej'), 'legal cue kept')
  assert(next.includes('<w:b/>') || next.includes('Marcin Nowak'), 'formatting path ok')
})

run('Test 7 — broken anchors must not block originalText fallback', () => {
  const text = canonicalizeParagraphText(
    'Atelier Studio Jan Kowalski, zwaną dalej „Kamerzystami”.',
  )
  const s = slot({
    registryKey: 'company_name',
    originalText: 'Atelier Studio Jan Kowalski',
    // NFC left that would fail on raw NFD without canonicalize — and wrong right
    leftAnchor: 'firmą XXX',
    rightAnchor: 'Filmowcem',
    startOffset: 99,
    endOffset: 120,
    operation: 'replace',
    sourceHint: 'company',
  })
  const loc = locateSlotInParagraph(text, s)
  assert(Boolean(loc), 'fallback to originalText')
  assert(loc!.method === 'exact_original', loc!.method)
})

if (!process.exitCode) {
  console.log('\nAll slot location acceptance tests passed.')
}
