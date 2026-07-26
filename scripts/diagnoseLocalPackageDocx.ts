/**
 * Local DOCX + persisted-binding diagnose (no Supabase).
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/diagnoseLocalPackageDocx.ts
 */
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { extractDocxParagraphsIncludingEmpty } from '../src/features/documents/template/extractDocxParagraphs'
import {
  buildParagraphRunModel,
  canonicalizeParagraphText,
} from '../src/features/documents/template/canonicalParagraph'
import { locateSlotInParagraph } from '../src/features/documents/template/slotRenderer'
import type { TemplateSlot } from '../src/features/documents/template/types'

const slots: TemplateSlot[] = [
  {
    id: 'slot-reception_location-11-41-77',
    registryKey: 'reception_location',
    label: 'reception_location',
    sourceHint: 'wedding',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    paragraphIndex: 11,
    startOffset: 41,
    endOffset: 77,
    originalText: ' Rezydencji Lubomirskich - Retyrada ',
    leftAnchor: 'przyjęcia weselnego, które odbędzie się w',
    rightAnchor: '– z czego',
    allowedRange: { start: 41, end: 77 },
    confidence: 0.9,
  },
  {
    id: 'slot-reception_location-11-42-76',
    registryKey: 'reception_location',
    label: 'reception_location',
    sourceHint: 'wedding',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    paragraphIndex: 11,
    startOffset: 42,
    endOffset: 76,
    originalText: 'Rezydencji Lubomirskich - Retyrada',
    sampleContext:
      'przyjęcia weselnego, które odbędzie się w Rezydencji Lubomirskich - Retyrada – z czego w zakresie przyjęcia weselnego reportaż ślubny obejmuje czas maksymalnie ',
    allowedRange: { start: 42, end: 76 },
    confidence: 0.94,
  },
  {
    id: 'slot-final_payment_due_date-31-175-178',
    registryKey: 'final_payment_due_date',
    label: 'final_payment_due_date',
    sourceHint: 'wedding',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    paragraphIndex: 31,
    startOffset: 175,
    endOffset: 178,
    originalText: ' 19',
    leftAnchor: 'najpóźniej w dniu',
    rightAnchor: '.',
    allowedRange: { start: 175, end: 178 },
    confidence: 0.9,
  },
  {
    id: 'slot-final_payment_due_date-31-176-186',
    registryKey: 'final_payment_due_date',
    label: 'final_payment_due_date',
    sourceHint: 'wedding',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    paragraphIndex: 31,
    startOffset: 176,
    endOffset: 186,
    originalText: '19.06.2025',
    sampleContext:
      'pozostałą do zapłaty część wynagrodzenia, pomniejszoną o zadatek, tj. kwotę 7 000 zł (słownie: siedem tysięcy złotych) brutto, Para młoda zapłaci Kamerzyście na',
    allowedRange: { start: 176, end: 186 },
    confidence: 0.9,
  },
]

async function main() {
  const bytes = readFileSync('./tmp-package-source.docx')
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  )
  const paras = await extractDocxParagraphsIncludingEmpty(ab)
  console.log('paragraph count', paras.length)

  const zip = await JSZip.loadAsync(ab)
  const xml = await zip.file('word/document.xml')!.async('string')
  const xmlParas: string[] = []
  const re = /<w:p\b[\s\S]*?<\/w:p>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) xmlParas.push(m[0]!)

  function dumpPara(idx: number) {
    const p = paras.find((x) => x.index === idx)
    const xmlP = xmlParas[idx] ?? ''
    const model = buildParagraphRunModel(xmlP)
    let pos = 0
    const runs = model.runs.map((r) => {
      const start = pos
      const end = pos + r.canonicalText.length
      pos = end
      return {
        runIndex: r.runIndex,
        start,
        end,
        raw: r.rawText,
        canonical: r.canonicalText,
      }
    })
    const idMatch =
      xmlP.match(/w:paraId="([^"]+)"/) || xmlP.match(/w14:paraId="([^"]+)"/)
    console.log(
      JSON.stringify(
        {
          index: idx,
          paraId: idMatch?.[1] ?? null,
          rawLen: p?.text.length,
          text: p?.text,
          canonical: canonicalizeParagraphText(p?.text ?? ''),
          runCount: runs.length,
          runs,
        },
        null,
        2,
      ),
    )
  }

  for (const idx of [10, 11, 12, 30, 31, 32]) {
    console.log(`\n=== PARA ${idx} ===`)
    dumpPara(idx)
  }

  for (const slot of slots) {
    const p = paras.find((x) => x.index === slot.paragraphIndex)!
    const text = canonicalizeParagraphText(p.text)
    const slice = text.slice(slot.startOffset!, slot.endOffset!)
    const loc = locateSlotInParagraph(p.text, slot)
    console.log('\nLOCATE', slot.id, {
      originalSpan: slot.originalText,
      sliceAtOffsets: JSON.stringify(slice),
      sliceEq: slice === canonicalizeParagraphText(slot.originalText ?? ''),
      verbatimRaw: p.text.includes(slot.originalText ?? ''),
      verbatimCanon: text.includes(
        canonicalizeParagraphText(slot.originalText ?? ''),
      ),
      loc,
    })
  }

  for (const paraIdx of [11, 31] as const) {
    const group = slots
      .filter((s) => s.paragraphIndex === paraIdx)
      .sort((a, b) => (b.endOffset ?? 0) - (a.endOffset ?? 0))
    console.log(`\n=== SEQUENTIAL para ${paraIdx} ===`)
    let text = paras.find((p) => p.index === paraIdx)!.text
    for (const slot of group) {
      const loc = locateSlotInParagraph(text, slot)
      console.log({
        id: slot.id,
        ok: Boolean(loc),
        loc,
        span: slot.originalText,
      })
      if (loc) {
        text =
          text.slice(0, loc.start) +
          'X'.repeat(Math.max(1, (slot.endOffset ?? 0) - (slot.startOffset ?? 0))) +
          text.slice(loc.end)
      }
    }
    console.log(`\n=== LOCATE-ALL on original para ${paraIdx} ===`)
    const orig = paras.find((p) => p.index === paraIdx)!.text
    for (const slot of group) {
      console.log({
        id: slot.id,
        ok: Boolean(locateSlotInParagraph(orig, slot)),
        loc: locateSlotInParagraph(orig, slot),
      })
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
