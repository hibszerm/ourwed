/**
 * Re-persist normalized physical bindings for a package contract version.
 * Collapses overlapping same-key duplicates (reception / final payment).
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.app.json scripts/repairPackageSlotMapBindings.ts
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { normalizePhysicalBindings } from '../src/features/documents/template/logicalContractFields'
import { parseSlotMap, type TemplateSlotMap } from '../src/features/documents/template/types'

const VERSION_ID = 'b0cd5be9-4054-48fd-9bb4-438e1cc0b964'

function queryJson(sql: string): unknown {
  const out = execSync(
    `npx supabase db query --linked -o json ${JSON.stringify(sql)}`,
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  const cleaned = out.replace(/\x1b\[[0-9;]*m/g, '')
  const idx = cleaned.indexOf('{"boundary"')
  if (idx < 0) throw new Error(`No JSON in query output:\n${cleaned.slice(-500)}`)
  return JSON.parse(cleaned.slice(idx))
}

function main() {
  mkdirSync('tmp', { recursive: true })
  const result = queryJson(`
    SELECT slot_map
    FROM document_template_versions
    WHERE id = '${VERSION_ID}'
  `) as { rows: Array<{ slot_map: TemplateSlotMap }> }

  const rawMap = result.rows[0]?.slot_map
  if (!rawMap) throw new Error('slot_map missing')
  writeFileSync(
    'tmp/slot_map_before_repair.json',
    JSON.stringify(rawMap, null, 2),
  )

  const parsed = parseSlotMap(rawMap)
  const before = parsed.slots.filter(
    (s) =>
      s.registryKey === 'reception_location' ||
      s.registryKey === 'final_payment_due_date' ||
      s.registryKey === 'ceremony_location',
  )
  console.log('BEFORE critical bindings:', before.length)
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

  const normalizedSlots = normalizePhysicalBindings(parsed.slots)
  const repaired: TemplateSlotMap = {
    ...parsed,
    slots: normalizedSlots,
  }

  const after = repaired.slots.filter(
    (s) =>
      s.registryKey === 'reception_location' ||
      s.registryKey === 'final_payment_due_date' ||
      s.registryKey === 'ceremony_location',
  )
  console.log('\nAFTER critical bindings:', after.length)
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

  writeFileSync(
    'tmp/slot_map_after_repair.json',
    JSON.stringify(repaired, null, 2),
  )

  // Escape for SQL dollar-quoting
  const payload = JSON.stringify(repaired).replace(/'/g, "''")
  const updateSql = `
    UPDATE document_template_versions
    SET slot_map = '${payload}'::jsonb
    WHERE id = '${VERSION_ID}'
    RETURNING id,
      (
        SELECT count(*) FROM jsonb_array_elements(slot_map->'slots') s
        WHERE s->>'registryKey' IN (
          'reception_location','final_payment_due_date','ceremony_location'
        )
      ) AS critical_count;
  `
  writeFileSync('tmp/repair_slot_map.sql', updateSql)
  console.log('\nWrote tmp/repair_slot_map.sql — applying…')
  const updated = queryJson(updateSql) as {
    rows: Array<{ id: string; critical_count: number }>
  }
  console.log('Updated:', updated.rows[0])
  console.log('Repair complete.')
}

main()
