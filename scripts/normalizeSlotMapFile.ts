/**
 * Normalize overlapping same-key bindings in a dumped slot_map JSON file.
 * Run after exporting tmp/slot_map_raw.json from document_template_versions.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { normalizePhysicalBindings } from '../src/features/documents/template/logicalContractFields'
import { parseSlotMap } from '../src/features/documents/template/types'

const CRITICAL = new Set([
  'reception_location',
  'final_payment_due_date',
  'ceremony_location',
  'preparation_location',
])

const raw = JSON.parse(readFileSync('tmp/slot_map_raw.json', 'utf8'))
const parsed = parseSlotMap(raw)
const before = parsed.slots.filter((s) => CRITICAL.has(s.registryKey ?? ''))
console.log('BEFORE', before.length)
for (const s of before) {
  console.log({
    id: s.id,
    key: s.registryKey,
    para: s.paragraphIndex,
    start: s.startOffset,
    end: s.endOffset,
    orig: s.originalText,
    bound: s.physicallyBound,
  })
}

const slots = normalizePhysicalBindings(parsed.slots)
const repaired = { ...parsed, slots }
const after = slots.filter((s) => CRITICAL.has(s.registryKey ?? ''))
console.log('\nAFTER', after.length)
for (const s of after) {
  console.log({
    id: s.id,
    key: s.registryKey,
    para: s.paragraphIndex,
    start: s.startOffset,
    end: s.endOffset,
    orig: s.originalText,
    bound: s.physicallyBound,
  })
}

writeFileSync('tmp/slot_map_repaired.json', JSON.stringify(repaired))
writeFileSync(
  'tmp/slot_map_repaired.pretty.json',
  JSON.stringify(repaired, null, 2),
)
console.log('\nwrote tmp/slot_map_repaired.json', slots.length, 'slots')
