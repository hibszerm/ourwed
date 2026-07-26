/**
 * Live acceptance: repaired bindings + real DOCX locate/replace for the two failed slots.
 */
import { readFileSync } from 'node:fs'
import { applyBoundSlotsToParagraphs } from '../src/features/documents/template/applyBoundSlots'
import { extractDocxParagraphsIncludingEmpty } from '../src/features/documents/template/extractDocxParagraphs'
import { verifyContractTransformation } from '../src/features/documents/template/contractQualityCheck'
import { parseSlotMap } from '../src/features/documents/template/types'
import {
  normalizePhysicalBindings,
  slotsForSinglePassApply,
} from '../src/features/documents/template/logicalContractFields'

async function main() {
  const slotMap = parseSlotMap(
    JSON.parse(readFileSync('tmp/slot_map_repaired.json', 'utf8')),
  )
  const bytes = readFileSync('./tmp-package-source.docx')
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  )
  const paragraphs = await extractDocxParagraphsIncludingEmpty(ab)

  const slots = slotsForSinglePassApply(
    normalizePhysicalBindings(slotMap.slots),
  ).filter(
    (s) =>
      s.registryKey === 'reception_location' ||
      s.registryKey === 'final_payment_due_date',
  )

  console.log(
    'slots under test',
    slots.map((s) => ({
      id: s.id,
      key: s.registryKey,
      para: s.paragraphIndex,
      start: s.startOffset,
      end: s.endOffset,
      orig: s.originalText,
    })),
  )

  const resolved = {
    reception_location: 'Hotel Example Reception',
    final_payment_due_date: '15.07.2026',
  }

  const applied = applyBoundSlotsToParagraphs({
    original: paragraphs,
    slots,
    resolved,
  })

  console.log(
    'failures',
    applied.failures.map((f) => `${f.registryKey}: ${f.reason}`),
  )
  console.log(
    'applied',
    applied.applied.map((a) => ({
      key: a.registryKey,
      para: a.paragraphIndex,
      value: a.resolvedValue,
      loc: a.location,
    })),
  )

  const p11 = applied.paragraphs.find((p) => p.index === 11)
  const p31 = applied.paragraphs.find((p) => p.index === 31)
  console.log('para11 after:', p11?.text.slice(0, 120))
  console.log('para31 after:', p31?.text.slice(-80))

  const quality = verifyContractTransformation({
    original: paragraphs.filter((p) => p.index === 11 || p.index === 31),
    transformed: applied.paragraphs.filter(
      (p) => p.index === 11 || p.index === 31,
    ),
    resolvedByKey: resolved,
    slots,
  })
  console.log('quality', {
    ok: quality.ok,
    reason: quality.reason,
    report: quality.report?.slice(0, 500),
  })

  if (applied.failures.length > 0 || !quality.ok) {
    process.exit(1)
  }
  console.log('\nLIVE ACCEPTANCE OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
