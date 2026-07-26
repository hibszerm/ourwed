/**
 * Physical binding locate / apply-order / paragraph-index regression.
 * Covers package DOCX failures for reception_location + final_payment_due_date.
 *
 * Run: npm run test:package-binding-locate
 */

import JSZip from 'jszip'
import { applyBoundSlotsToParagraphs } from './applyBoundSlots'
import { verifyContractTransformation } from './contractQualityCheck'
import { extractDocxParagraphsIncludingEmpty } from './extractDocxParagraphs'
import {
  normalizePhysicalBindings,
  slotsForSinglePassApply,
} from './logicalContractFields'
import { findSharedPhysicalSpanConflicts } from './packageContractGenerationModel'
import { locateSlotInParagraph } from './slotRenderer'
import type { TemplateSlot } from './types'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

function binding(
  registryKey: string,
  para: number,
  start: number,
  end: number,
  originalText: string,
  extra?: Partial<TemplateSlot>,
): TemplateSlot {
  return {
    id: `slot-${registryKey}-${para}-${start}-${end}`,
    registryKey,
    label: registryKey,
    sourceHint: 'wedding',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    operation: 'replace',
    paragraphIndex: para,
    originalText,
    startOffset: start,
    endOffset: end,
    allowedRange: { start, end },
    detectionStatus: 'bound',
    ...extra,
  }
}

async function buildDocx(paragraphTexts: string[]): Promise<ArrayBuffer> {
  const body = paragraphTexts
    .map(
      (t) =>
        `<w:p><w:r><w:t xml:space="preserve">${t
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</w:t></w:r></w:p>`,
    )
    .join('')
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${body}</w:document>`
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  )
  zip.folder('word')!.file('document.xml', xml)
  zip.folder('_rels')!.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  )
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function buildDocxWithRuns(
  paragraphs: Array<Array<string>>,
): Promise<ArrayBuffer> {
  const body = paragraphs
    .map((runs) => {
      const runXml = runs
        .map(
          (t) =>
            `<w:r><w:t xml:space="preserve">${t
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')}</w:t></w:r>`,
        )
        .join('')
      return `<w:p>${runXml}</w:p>`
    })
    .join('')
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${body}</w:document>`
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  )
  zip.folder('word')!.file('document.xml', xml)
  zip.folder('_rels')!.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  )
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function main() {
  let failed = 0
  async function run(name: string, fn: () => void | Promise<void>) {
    try {
      await fn()
      console.log(`PASS  ${name}`)
    } catch (err) {
      failed += 1
      console.error(`FAIL  ${name}`)
      console.error(err instanceof Error ? err.message : err)
    }
  }

  await run('A — analysis and renderer enumerate identical paragraph indexes', async () => {
    const bytes = await buildDocx(['alpha', '', 'beta', 'gamma'])
    const analysis = await extractDocxParagraphsIncludingEmpty(bytes)
    const renderer = await extractDocxParagraphsIncludingEmpty(bytes)
    assertEq(analysis.length, renderer.length, 'count')
    for (let i = 0; i < analysis.length; i++) {
      assertEq(analysis[i]!.index, renderer[i]!.index, `index ${i}`)
      assertEq(analysis[i]!.text, renderer[i]!.text, `text ${i}`)
    }
  })

  await run('B — empty paragraphs do not shift persisted indexes', async () => {
    const bytes = await buildDocx(['first', '', '', 'target'])
    const paras = await extractDocxParagraphsIncludingEmpty(bytes)
    assertEq(paras.length, 4, 'includes empties')
    assertEq(paras[1]!.text, '', 'empty 1')
    assertEq(paras[2]!.text, '', 'empty 2')
    assertEq(paras[3]!.index, 3, 'target stays at 3')
    assertEq(paras[3]!.text, 'target', 'target text')
  })

  await run('C — table paragraphs are enumerated consistently', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>before</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>cell-a</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>cell-b</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:r><w:t>after</w:t></w:r></w:p>
  </w:body>
</w:document>`
    const zip = new JSZip()
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    )
    zip.folder('word')!.file('document.xml', xml)
    zip.folder('_rels')!.file(
      '.rels',
      `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    )
    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const a = await extractDocxParagraphsIncludingEmpty(bytes)
    const b = await extractDocxParagraphsIncludingEmpty(bytes)
    assertEq(
      a.map((p) => p.text).join('|'),
      'before|cell-a|cell-b|after',
      'table order',
    )
    assertEq(
      a.map((p) => p.text).join('|'),
      b.map((p) => p.text).join('|'),
      'stable across extractors',
    )
  })

  await run('D — location text split across DOCX runs still locates', async () => {
    const bytes = await buildDocxWithRuns([
      ['Miejsce: ', 'Rezydencji Lubomirskich', ' - ', 'Retyrada', '.'],
    ])
    const paras = await extractDocxParagraphsIncludingEmpty(bytes)
    const text = paras[0]!.text
    const start = text.indexOf('Rezydencji Lubomirskich - Retyrada')
    const end = start + 'Rezydencji Lubomirskich - Retyrada'.length
    const slot = binding(
      'reception_location',
      0,
      start,
      end,
      'Rezydencji Lubomirskich - Retyrada',
    )
    const loc = locateSlotInParagraph(text, slot)
    assert(Boolean(loc), 'located across runs')
    assertEq(loc!.start, start, 'start')
    assertEq(loc!.end, end, 'end')
  })

  await run('E — date split across multiple runs still locates', async () => {
    const bytes = await buildDocxWithRuns([
      ['najpóźniej w dniu ', '19', '.', '06', '.', '2025', 'r.'],
    ])
    const paras = await extractDocxParagraphsIncludingEmpty(bytes)
    const text = paras[0]!.text
    const start = text.indexOf('19.06.2025')
    const end = start + 10
    const slot = binding('final_payment_due_date', 0, start, end, '19.06.2025')
    const loc = locateSlotInParagraph(text, slot)
    assert(Boolean(loc), 'date located across runs')
    assertEq(text.slice(loc!.start, loc!.end), '19.06.2025', 'exact date token')
  })

  await run('F+G — locate all spans before replace; apply right-to-left', () => {
    const para = 'AAA Hotel One BBB Hotel Two CCC'
    const slots = [
      binding('ceremony_location', 0, 4, 13, 'Hotel One'),
      binding('reception_location', 0, 18, 27, 'Hotel Two'),
    ]
    const applied = applyBoundSlotsToParagraphs({
      original: [{ index: 0, text: para }],
      slots,
      resolved: {
        ceremony_location: 'VERY_LONG_CEREMONY_VENUE_NAME',
        reception_location: 'VERY_LONG_RECEPTION_VENUE_NAME',
      },
    })
    assertEq(applied.failures.length, 0, 'no failures')
    assertEq(applied.applied.length, 2, 'both applied')
    assertEq(
      applied.applied[0]!.registryKey,
      'reception_location',
      'RTL first',
    )
    assertEq(
      applied.applied[1]!.registryKey,
      'ceremony_location',
      'RTL second',
    )
    assert(
      applied.paragraphs[0]!.text.includes('VERY_LONG_CEREMONY_VENUE_NAME'),
      'ceremony replaced',
    )
    assert(
      applied.paragraphs[0]!.text.includes('VERY_LONG_RECEPTION_VENUE_NAME'),
      'reception replaced',
    )
    assert(
      applied.paragraphs[0]!.text.startsWith('AAA '),
      'immutable prefix intact',
    )
  })

  await run('H — reception, ceremony and preparation remain distinct', () => {
    const slots = [
      binding(
        'preparation_location',
        9,
        41,
        75,
        'Rezydencji Lubomirskich - Retyrada',
      ),
      binding('ceremony_location', 10, 38, 47, 'Rzeszowie'),
      binding(
        'reception_location',
        11,
        42,
        76,
        'Rezydencji Lubomirskich - Retyrada',
      ),
    ]
    const original = [
      {
        index: 9,
        text: 'Przygotowań ślubnych, które odbędą się w Rezydencji Lubomirskich - Retyrada.',
      },
      {
        index: 10,
        text: 'ceremonii ślubu, która odbędzie się w Rzeszowie;',
      },
      {
        index: 11,
        text: 'przyjęcia weselnego, które odbędzie się w Rezydencji Lubomirskich - Retyrada – z czego',
      },
    ]
    const applied = applyBoundSlotsToParagraphs({
      original,
      slots: normalizePhysicalBindings(slots),
      resolved: {
        preparation_location: 'Prep Place',
        ceremony_location: 'Ceremony City',
        reception_location: 'Reception Hall',
      },
    })
    assertEq(applied.failures.length, 0, 'no failures')
    assert(applied.paragraphs[0]!.text.includes('Prep Place'), 'prep')
    assert(applied.paragraphs[1]!.text.includes('Ceremony City'), 'ceremony')
    assert(applied.paragraphs[2]!.text.includes('Reception Hall'), 'reception')
    assert(
      !applied.paragraphs[2]!.text.includes('Prep Place'),
      'prep not leaked into reception',
    )
  })

  await run(
    'I — final payment date is not confused with deposit or wedding date',
    () => {
      const original = [
        {
          index: 8,
          text: 'wydarzeń odbywających się w dniu 19.06.2025r., składającego się',
        },
        {
          index: 30,
          text: 'Zadatek należy wpłacić do dnia 01.01.2025.',
        },
        {
          index: 31,
          text: 'pozostałą część Para młoda zapłaci najpóźniej w dniu 19.06.2025r.',
        },
      ]
      const slots = [
        binding('wedding_date', 8, 33, 43, '19.06.2025'),
        binding('deposit_due_date', 30, 30, 40, '01.01.2025'),
        binding('final_payment_due_date', 31, 52, 62, '19.06.2025'),
      ]
      const applied = applyBoundSlotsToParagraphs({
        original,
        slots,
        resolved: {
          wedding_date: '26.07.2026',
          deposit_due_date: '01.03.2026',
          final_payment_due_date: '15.07.2026',
        },
      })
      assertEq(applied.failures.length, 0, 'no failures')
      assert(applied.paragraphs[0]!.text.includes('26.07.2026'), 'wedding')
      assert(applied.paragraphs[1]!.text.includes('01.03.2026'), 'deposit')
      assert(applied.paragraphs[2]!.text.includes('15.07.2026'), 'final')
      assert(
        !applied.paragraphs[2]!.text.includes('01.03.2026'),
        'deposit not in final para',
      )
      assert(
        applied.paragraphs[2]!.text.includes('najpóźniej w dniu 15.07.2026r.'),
        'immutable clause preserved',
      )
    },
  )

  await run(
    'J — multiple physical occurrences of final_payment_due_date all replace',
    () => {
      const slots = [
        binding('final_payment_due_date', 1, 10, 20, '19.06.2025'),
        binding('final_payment_due_date', 2, 5, 15, '19.06.2025'),
      ]
      const applied = applyBoundSlotsToParagraphs({
        original: [
          { index: 1, text: 'Termin A 19.06.2025 koniec.' },
          { index: 2, text: 'Data 19.06.2025 ok.' },
        ],
        slots: slotsForSinglePassApply(normalizePhysicalBindings(slots)),
        resolved: { final_payment_due_date: '15.07.2026' },
      })
      assertEq(applied.failures.length, 0, 'no failures')
      assertEq(applied.applied.length, 2, 'both occurrences')
      assert(
        applied.paragraphs.every((p) => p.text.includes('15.07.2026')),
        'all replaced',
      )
    },
  )

  await run('K — overlapping multi-key spans are rejected during upload', () => {
    const conflicts = findSharedPhysicalSpanConflicts([
      binding('preparation_location', 7, 20, 40, 'Hotel'),
      binding('ceremony_location', 7, 20, 40, 'Hotel'),
      binding('reception_location', 7, 20, 40, 'Hotel'),
    ])
    assertEq(conflicts.length, 1, 'one cluster')
    assertEq(conflicts[0]!.registryKeys.length, 3, 'three keys')

    const partialOverlap = findSharedPhysicalSpanConflicts([
      binding('ceremony_location', 7, 10, 25, 'Kościół A'),
      binding('reception_location', 7, 20, 35, 'Hotel B'),
    ])
    assertEq(partialOverlap.length, 1, 'partial overlap conflict')
  })

  await run('L — malformed persisted offsets fail safely', () => {
    const applied = applyBoundSlotsToParagraphs({
      original: [{ index: 0, text: 'Hello world.' }],
      slots: [
        {
          ...binding('final_payment_due_date', 0, 2, 5, 'NOPE'),
          leftAnchor: null,
          rightAnchor: null,
        },
      ],
      resolved: { final_payment_due_date: '15.07.2026' },
    })
    assertEq(applied.failures.length, 1, 'fails safely')
    assert(
      applied.failures[0]!.reason.includes('Cannot safely locate'),
      'safe locate message',
    )
    assertEq(applied.paragraphs[0]!.text, 'Hello world.', 'unchanged on failure')
  })

  await run('M — immutable surrounding legal text remains unchanged', () => {
    const text =
      'pozostałą do zapłaty część wynagrodzenia, Para młoda zapłaci najpóźniej w dniu 19.06.2025r.'
    const start = text.indexOf('19.06.2025')
    const applied = applyBoundSlotsToParagraphs({
      original: [{ index: 31, text }],
      slots: [
        binding(
          'final_payment_due_date',
          31,
          start,
          start + 10,
          '19.06.2025',
        ),
      ],
      resolved: { final_payment_due_date: '15.07.2026' },
    })
    assertEq(applied.failures.length, 0, 'ok')
    assertEq(
      applied.paragraphs[0]!.text,
      text.replace('19.06.2025', '15.07.2026'),
      'only date token replaced',
    )
  })

  await run(
    'N — quality gate passes after correct replacement + live duplicate collapse',
    () => {
      const liveDupes = [
        binding(
          'reception_location',
          11,
          41,
          77,
          ' Rezydencji Lubomirskich - Retyrada ',
          {
            leftAnchor: 'przyjęcia weselnego, które odbędzie się w',
            rightAnchor: '– z czego',
            confidence: 0.9,
          },
        ),
        binding(
          'reception_location',
          11,
          42,
          76,
          'Rezydencji Lubomirskich - Retyrada',
          { confidence: 0.94, sampleContext: 'przyjęcia weselnego…' },
        ),
        binding('final_payment_due_date', 31, 175, 178, ' 19', {
          leftAnchor: 'najpóźniej w dniu',
          rightAnchor: '.',
          confidence: 0.9,
        }),
        binding('final_payment_due_date', 31, 176, 186, '19.06.2025', {
          confidence: 0.9,
          sampleContext: 'pozostałą do zapłaty…',
        }),
      ]
      const normalized = normalizePhysicalBindings(liveDupes)
      const reception = normalized.filter(
        (s) => s.registryKey === 'reception_location',
      )
      const payment = normalized.filter(
        (s) => s.registryKey === 'final_payment_due_date',
      )
      assertEq(reception.length, 1, 'one reception binding')
      assertEq(payment.length, 1, 'one payment binding')
      assertEq(
        reception[0]!.originalText,
        'Rezydencji Lubomirskich - Retyrada',
        'kept tight location',
      )
      assertEq(payment[0]!.originalText, '19.06.2025', 'kept full date token')

      const original = [
        {
          index: 11,
          text: 'przyjęcia weselnego, które odbędzie się w Rezydencji Lubomirskich - Retyrada – z czego w zakresie',
        },
        {
          index: 31,
          text: 'pozostałą do zapłaty część wynagrodzenia, pomniejszoną o zadatek, tj. kwotę 7 000 zł (słownie: siedem tysięcy złotych) brutto, Para młoda zapłaci Kamerzyście najpóźniej w dniu 19.06.2025r.',
        },
      ]
      const applied = applyBoundSlotsToParagraphs({
        original,
        slots: slotsForSinglePassApply(normalized),
        resolved: {
          reception_location: 'Hotel Bristol',
          final_payment_due_date: '15.07.2026',
        },
      })
      assertEq(applied.failures.length, 0, 'no locate failures')
      assert(
        applied.paragraphs[0]!.text.includes('Hotel Bristol'),
        'reception ok',
      )
      assert(applied.paragraphs[1]!.text.includes('15.07.2026'), 'payment ok')
      assert(
        applied.paragraphs[1]!.text.includes('najpóźniej w dniu 15.07.2026r.'),
        'clause intact',
      )

      const quality = verifyContractTransformation({
        original,
        transformed: applied.paragraphs,
        resolvedByKey: {
          reception_location: 'Hotel Bristol',
          final_payment_due_date: '15.07.2026',
        },
        slots: normalized,
      })
      assert(quality.ok, quality.report ?? quality.reason ?? 'quality gate')
    },
  )

  if (failed > 0) {
    console.error(`\n${failed} test(s) failed`)
    process.exit(1)
  }
  console.log('\nAll package-binding-locate tests passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
