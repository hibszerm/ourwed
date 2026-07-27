/**
 * Package-contract table-aware DOCX analysis + generation fixture tests.
 *
 * Run: npm run test:package-contract-tables
 */

import JSZip from 'jszip'
import { applyBoundSlotsToParagraphs } from './applyBoundSlots'
import {
  candidatesToTemplateSlots,
  detectContractCandidates,
} from './candidateDetection'
import { analyzeMoneyPairs } from './contractMoneyPairs'
import {
  extractDocxDocumentModel,
  extractDocxParagraphsIncludingEmpty,
} from './extractDocxParagraphs'
import { applyPackageContractAllowlistToSlotMap } from './packageContractAllowlist'
import {
  analyzePackageContractTables,
  classifyDetectedKey,
} from './packageContractTableAnalysis'
import { isSlotPhysicallyBound, type TemplateSlot } from './types'

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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function p(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

function cell(text: string): string {
  return `<w:tc>${p(text)}</w:tc>`
}

function row(cells: string[]): string {
  return `<w:tr>${cells.map(cell).join('')}</w:tr>`
}

function table(rows: string[][]): string {
  return `<w:tbl>${rows.map(row).join('')}</w:tbl>`
}

async function buildKwiatkowscyLikeDocx(options?: {
  withAmountWords?: boolean
  withOvertime?: boolean
  withPackageContent?: boolean
  withBank?: boolean
}): Promise<ArrayBuffer> {
  const withAmountWords = options?.withAmountWords !== false
  const withOvertime = options?.withOvertime !== false
  const withPackageContent = options?.withPackageContent !== false
  const withBank = options?.withBank !== false

  const event = table([
    ['Etap', 'Miejsce / opis', 'Ramy czasowe'],
    ['Przygotowania', 'Hotel Stary, Kraków', 'od 10:00'],
    ['Ceremonia', 'Kościół Mariacki, Kraków', '13:00 – 14:00'],
    [
      'Przyjęcie weselne',
      'Hotel Stary, Kraków',
      'do 22:00, maks. 8h pracy',
    ],
  ])

  const payment = table([
    ['Rata', 'Termin płatności', 'Kwota'],
    ['Zadatek', 'w terminie 5 dni od zawarcia Umowy', '500 zł'],
    ['II rata', 'do dnia 19.06.2027 r.', '3 500 zł'],
    ['III rata', 'najpóźniej w dniu ślubu', '3 500 zł'],
  ])

  const packageContent = withPackageContent
    ? table([
        ['Zawartość pakietu', 'Opis'],
        ['Zdjęcia', '400 sztuk'],
        ['Galeria online', '12 miesięcy'],
      ])
    : ''

  const totalLine = withAmountWords
    ? 'Strony ustalają łączne wynagrodzenie w wysokości 7 500 zł (słownie: siedem tysięcy pięćset złotych) brutto.'
    : 'Strony ustalają łączne wynagrodzenie w wysokości 7 500 zł brutto.'

  const overtime = withOvertime
    ? p(
        'Za każdą dodatkową rozpoczętą godzinę pracy zostanie doliczona kwota 300 zł.',
      )
    : ''

  const bank = withBank
    ? p(
        'Wpłaty należy dokonać na rachunek bankowy: PL61 1090 1014 0000 0712 1981 2874 w Banku Pekao.',
      )
    : ''

  const body = [
    p('Umowa o świadczenie usług fotograficznych'),
    p(
      'zawarta w dniu 01.01.2027 r. pomiędzy Anną Kowalską i Janem Kowalskim, zwanymi dalej „Klientami”',
    ),
    p('Data ślubu: 19.06.2027 r.'),
    event,
    p(totalLine),
    payment,
    packageContent,
    overtime,
    bank,
  ].join('')

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr/>
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
  zip.folder('_rels')!.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  )
  zip.folder('word')!.file('document.xml', documentXml)
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function run(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`ok — ${name}`)
  } catch (e) {
    console.error(`FAIL — ${name}`)
    throw e
  }
}

function boundByKey(slots: TemplateSlot[], key: string): TemplateSlot[] {
  return slots.filter(
    (s) =>
      s.registryKey === key &&
      isSlotPhysicallyBound(s) &&
      s.enabled !== false &&
      s.variableClassification !== 'template_constant',
  )
}

function anyByKey(slots: TemplateSlot[], key: string): TemplateSlot[] {
  return slots.filter((s) => s.registryKey === key)
}

async function main() {
  await run('1 — Event table extraction preserves rows/cells', async () => {
    const bytes = await buildKwiatkowscyLikeDocx()
    const model = await extractDocxDocumentModel(bytes)
    assert(model.tables.length >= 2, 'at least event + payment tables')
    const event = model.tables[0]!
    assertEq(event.rows.length, 4, 'event rows')
    assertEq(event.rows[1]!.cells[1]!.normalizedText, 'Hotel Stary, Kraków', 'prep place')
    assertEq(
      event.rows[2]!.cells[1]!.normalizedText,
      'Kościół Mariacki, Kraków',
      'ceremony place',
    )
    assertEq(
      event.rows[3]!.cells[1]!.normalizedText,
      'Hotel Stary, Kraków',
      'reception place',
    )
    assert(
      event.rows[1]!.cells[1]!.paragraphs[0]!.globalParagraphIndex !==
        event.rows[3]!.cells[1]!.paragraphs[0]!.globalParagraphIndex,
      'distinct global indices for identical location text',
    )
  })

  await run('2–5 — Location bindings are exact distinct table cells', async () => {
    const bytes = await buildKwiatkowscyLikeDocx()
    const model = await extractDocxDocumentModel(bytes)
    const candidates = detectContractCandidates(model.paragraphs, {
      tables: model.tables,
    })
    const slots = candidatesToTemplateSlots(candidates)
    const prep = boundByKey(slots, 'preparation_location')
    const ceremony = boundByKey(slots, 'ceremony_location')
    const reception = boundByKey(slots, 'reception_location')
    assertEq(prep.length, 1, 'prep location')
    assertEq(ceremony.length, 1, 'ceremony location')
    assertEq(reception.length, 1, 'reception location')
    assertEq(prep[0]!.originalText, 'Hotel Stary, Kraków', 'prep text')
    assertEq(ceremony[0]!.originalText, 'Kościół Mariacki, Kraków', 'ceremony text')
    assertEq(reception[0]!.originalText, 'Hotel Stary, Kraków', 'reception text')
    assert(
      prep[0]!.paragraphIndex !== reception[0]!.paragraphIndex,
      'identical text → distinct physical paragraphs',
    )
    assertEq(prep[0]!.tableIndex, 0, 'prep table')
    assertEq(prep[0]!.rowIndex, 1, 'prep row')
    assertEq(prep[0]!.cellIndex, 1, 'prep cell')
    assertEq(ceremony[0]!.rowIndex, 2, 'ceremony row')
    assertEq(reception[0]!.rowIndex, 3, 'reception row')
    assert(
      prep[0]!.id !== reception[0]!.id,
      'distinct binding ids for same location text',
    )
  })

  await run('6–8 — Times / coverage hours non-overlapping + immutable', async () => {
    const bytes = await buildKwiatkowscyLikeDocx()
    const model = await extractDocxDocumentModel(bytes)
    const tableResult = analyzePackageContractTables({
      paragraphs: model.paragraphs,
      tables: model.tables,
    })
    const timeKeys = tableResult.classifications.filter((c) =>
      ['coverage_start_time', 'coverage_end_time', 'coverage_hours'].includes(
        c.key ?? '',
      ),
    )
    assert(timeKeys.length >= 3, 'time/hours classifications present')
    for (const c of timeKeys) {
      assertEq(
        c.classification,
        'immutable_package_fact',
        `${c.key} immutable`,
      )
    }

    // Reception cell: end time + hours must not overlap
    const receptionTimeCell = model.tables[0]!.rows[3]!.cells[2]!
    const gIdx = receptionTimeCell.paragraphs[0]!.globalParagraphIndex
    const spans = tableResult.candidates.filter(
      (c) =>
        c.paragraphIndex === gIdx &&
        (c.proposedKey === 'coverage_end_time' ||
          c.proposedKey === 'coverage_hours'),
    )
    assert(spans.length === 2, 'end time + hours')
    const [a, b] = spans
    assert(
      !(a!.startOffset < b!.endOffset && b!.startOffset < a!.endOffset),
      'no overlapping physical bindings in reception time cell',
    )
    assertEq(spans.find((s) => s.proposedKey === 'coverage_end_time')?.text, '22:00', 'end')
    assertEq(spans.find((s) => s.proposedKey === 'coverage_hours')?.text, '8', 'hours')

    // Preparation time without consuming "od"
    const prepTime = tableResult.candidates.find(
      (c) =>
        c.proposedKey === 'coverage_start_time' &&
        c.rowIndex === 1,
    )
    assertEq(prepTime?.text, '10:00', 'prep time exact')
  })

  await run('9–11 — Payment table deposit / installments / dates', async () => {
    const bytes = await buildKwiatkowscyLikeDocx()
    const model = await extractDocxDocumentModel(bytes)
    const candidates = detectContractCandidates(model.paragraphs, {
      tables: model.tables,
    })
    const slots = candidatesToTemplateSlots(candidates)
    const deposit = boundByKey(slots, 'agreed_deposit_formatted')
    assertEq(deposit.length, 1, 'deposit bound')
    assert(deposit[0]!.originalText!.includes('500'), 'deposit 500')

    const tableResult = analyzePackageContractTables({
      paragraphs: model.paragraphs,
      tables: model.tables,
    })
    const unsupportedInstallments = tableResult.classifications.filter(
      (c) =>
        c.classification === 'unsupported_or_ambiguous' &&
        /3\s*500|3500/.test(c.text.replace(/\s/g, '')),
    )
    assert(
      unsupportedInstallments.length >= 1,
      'split installments unsupported without matching remaining key',
    )

    const due = boundByKey(slots, 'payment_due_date')
    assertEq(due.length, 1, 'II rata explicit date')
    assertEq(due[0]!.originalText, '19.06.2027', 'exact date span')

    const weddingRelative = tableResult.classifications.find((c) =>
      /wedding_relative/.test(c.reason),
    )
    assert(Boolean(weddingRelative), 'wedding-relative deadline classified')
    assertEq(
      weddingRelative!.classification,
      'unsupported_or_ambiguous',
      'relative deadline not dynamic',
    )
  })

  await run('12–13 — Total value + amount-in-words consistency', async () => {
    const bytes = await buildKwiatkowscyLikeDocx({ withAmountWords: true })
    const model = await extractDocxDocumentModel(bytes)
    const candidates = detectContractCandidates(model.paragraphs, {
      tables: model.tables,
    })
    const slots = candidatesToTemplateSlots(candidates)
    const total =
      boundByKey(slots, 'contract_value_formatted')[0] ??
      boundByKey(slots, 'contract_value')[0]
    assert(Boolean(total), 'total numeric bound')
    assert(total!.originalText!.includes('7 500'), '7500 span')

    const words = anyByKey(slots, 'contract_value_words')
    assert(words.length >= 1, 'words side detected')
    const reports = analyzeMoneyPairs({
      slots,
      paragraphs: model.paragraphs,
    })
    const cv = reports.find((r) => r.concept === 'contract_value')
    assert(Boolean(cv), 'money pair report')
    assert(cv!.numericDetected && cv!.wordsDetected, 'paired financial representation')
    // Product rule: both sides must bind when both exist (existing moneyPairsBlockReadiness)
    assert(
      cv!.missingSide === 'none' || cv!.wordsBound || cv!.numericBound,
      'pair safety model engaged',
    )
  })

  await run('14–16 — Bank / overtime / package content immutable', async () => {
    const bytes = await buildKwiatkowscyLikeDocx()
    const model = await extractDocxDocumentModel(bytes)
    const candidates = detectContractCandidates(model.paragraphs, {
      tables: model.tables,
    })
    const slots = candidatesToTemplateSlots(candidates)
    const { slotMap, filteredOutKeys } = applyPackageContractAllowlistToSlotMap({
      version: 1,
      slots,
      unmappedDynamics: [],
    })

    const bank = anyByKey(slots, 'company_bank_account')
    assert(bank.length >= 1, 'bank detected')
    assert(
      bank.every(
        (s) =>
          s.variableClassification === 'template_constant' ||
          !isSlotPhysicallyBound(s) ||
          s.enabled === false,
      ),
      'bank immutable',
    )

    assert(
      filteredOutKeys.includes('overtime_rate') ||
        anyByKey(slots, 'overtime_rate').every(
          (s) =>
            s.variableClassification === 'template_constant' ||
            s.enabled === false ||
            !isSlotPhysicallyBound(s),
        ) ||
        classifyDetectedKey('overtime_rate') === 'immutable_package_fact',
      'overtime immutable package fact',
    )

    const tableResult = analyzePackageContractTables({
      paragraphs: model.paragraphs,
      tables: model.tables,
    })
    const pkgContent = tableResult.traces.find(
      (t) => t.inferredTableType === 'package_content',
    )
    assert(Boolean(pkgContent), 'package content table recognized')
    assert(
      tableResult.classifications.some(
        (c) =>
          c.key === 'package_contents' &&
          c.classification === 'immutable_package_fact',
      ),
      'package content immutable',
    )

    // Dynamic locations survive allowlist
    assert(
      boundByKey(slotMap.slots, 'preparation_location').length === 1,
      'prep survives allowlist',
    )
  })

  await run('17 — Generation replaces exact cells; no cross-cell', async () => {
    const bytes = await buildKwiatkowscyLikeDocx()
    const model = await extractDocxDocumentModel(bytes)
    const candidates = detectContractCandidates(model.paragraphs, {
      tables: model.tables,
    })
    let slots = candidatesToTemplateSlots(candidates)
    slots = applyPackageContractAllowlistToSlotMap({
      version: 1,
      slots,
      unmappedDynamics: [],
    }).slotMap.slots.filter(isSlotPhysicallyBound)

    const applied = applyBoundSlotsToParagraphs({
      original: model.paragraphs,
      slots,
      resolved: {
        preparation_location: 'Dworek Biały',
        ceremony_location: 'Kościół św. Anny',
        reception_location: 'Pałac Ogrodowy',
        contract_value_formatted: '8 200 zł',
        agreed_deposit_formatted: '700 zł',
        payment_due_date: '20.07.2027',
      },
    })

    const prepSlot = slots.find((s) => s.registryKey === 'preparation_location')!
    const receptionSlot = slots.find(
      (s) => s.registryKey === 'reception_location',
    )!
    assertEq(
      applied.paragraphs[prepSlot.paragraphIndex!]!.text,
      'Dworek Biały',
      'prep cell replaced',
    )
    assertEq(
      applied.paragraphs[receptionSlot.paragraphIndex!]!.text,
      'Pałac Ogrodowy',
      'reception cell replaced',
    )
    assert(
      !applied.paragraphs[prepSlot.paragraphIndex!]!.text.includes(
        'Hotel Stary',
      ),
      'old prep gone from locator',
    )
    assert(
      applied.paragraphs[receptionSlot.paragraphIndex!]!.text !==
        applied.paragraphs[prepSlot.paragraphIndex!]!.text ||
        prepSlot.paragraphIndex !== receptionSlot.paragraphIndex,
      'no cross-cell collapse',
    )

    // Immutable package content cells unchanged
    const contentTable = model.tables.find((t) =>
      t.rows[0]?.cells.some((c) => /zawartość/i.test(c.normalizedText)),
    )
    if (contentTable) {
      for (const row of contentTable.rows) {
        for (const cell of row.cells) {
          for (const para of cell.paragraphs) {
            assertEq(
              applied.paragraphs[para.globalParagraphIndex]!.text,
              model.paragraphs[para.globalParagraphIndex]!.text,
              `immutable cell para ${para.globalParagraphIndex}`,
            )
          }
        }
      }
    }

    // Audit by locator: expected replacement present at bound index
    for (const trace of applied.applied) {
      if (trace.omitted) continue
      if (
        !['preparation_location', 'ceremony_location', 'reception_location'].includes(
          trace.registryKey,
        )
      ) {
        continue
      }
      const slot = slots.find((s) => s.registryKey === trace.registryKey)!
      const text = applied.paragraphs[slot.paragraphIndex!]!.text
      assert(
        text.includes(trace.resolvedValue),
        `audit locator has ${trace.registryKey}`,
      )
      assert(
        !text.includes('Hotel Stary'),
        `audit old value absent for ${trace.registryKey}`,
      )
    }
  })

  await run('paragraph templates still extract without tables', async () => {
    const zip = new JSZip()
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${p('Przyjęcie weselne odbędzie się w Hotel Bristol.')}
    ${p('łączne wynagrodzenie w wysokości 5 000 zł brutto.')}
    <w:sectPr/>
  </w:body>
</w:document>`
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    )
    zip.folder('_rels')!.file(
      '.rels',
      `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    )
    zip.folder('word')!.file('document.xml', xml)
    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const paras = await extractDocxParagraphsIncludingEmpty(bytes)
    assertEq(paras.length, 2, 'two body paras')
    const candidates = detectContractCandidates(paras, { tables: [] })
    const slots = candidatesToTemplateSlots(candidates)
    assert(
      boundByKey(slots, 'reception_location').length === 1 ||
        anyByKey(slots, 'reception_location').length >= 1,
      'paragraph venue still detected',
    )
  })

  console.log('\nAll package-contract table tests passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
