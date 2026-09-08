/**
 * Migration hygiene: no untimestamped / open-RLS bootstrap files in migrations/.
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/db/migrationHygieneAcceptance.test.ts
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`ok — ${name}`)
  } catch (e) {
    console.error(`FAIL — ${name}`)
    throw e
  }
}

const migrationsDir = resolve(process.cwd(), 'supabase/migrations')
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))

run('every migration filename is timestamp-prefixed', () => {
  const bad = files.filter((f) => !/^\d{14}_.+\.sql$/.test(f))
  assert(bad.length === 0, `unstamped migrations: ${bad.join(', ')}`)
})

run('no migration creates dev_allow_all policies', () => {
  for (const f of files) {
    const sql = readFileSync(join(migrationsDir, f), 'utf8')
    const creates = [
      ...sql.matchAll(
        /create\s+policy\s+"?dev_allow_all[^"\s]*/gi,
      ),
    ]
    assert(
      creates.length === 0,
      `${f} creates ${creates.map((m) => m[0]).join(', ')}`,
    )
  }
})

run('archived bootstrap retains historical markers (not executable)', () => {
  const archived = resolve(
    process.cwd(),
    'supabase/migrations_archive/bootstrap/travel_planning.sql',
  )
  const sql = readFileSync(archived, 'utf8')
  assert(sql.includes('HISTORICAL'), 'historical marker')
  assert(sql.includes('dev_allow_all_travel_segments'), 'archived open policy text')
})

run('multi_tenant migration still drops legacy open policies', () => {
  const sql = readFileSync(
    join(migrationsDir, '20260722150000_multi_tenant_rls.sql'),
    'utf8',
  )
  assert(sql.includes('drop policy if exists "dev_allow_all_packages"'), 'drops packages')
  assert(
    sql.includes('drop policy if exists "dev_allow_all_travel_segments"'),
    'drops travel_segments',
  )
})

console.log('ok — migrationHygieneAcceptance')
