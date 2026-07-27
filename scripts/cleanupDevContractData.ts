/**
 * Development data cleanup for OURWED.
 *
 * Wipes contracts, templates, generated documents, weddings, packages and
 * related storage objects created during AI/product development.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (or --db-url) — never commit that key.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/cleanupDevContractData.ts
 *   # or after `supabase login` + link:
 *   npx tsx scripts/cleanupDevContractData.ts --sql-only
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = process.cwd()

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined
}

function loadDotEnvLocal() {
  try {
    const raw = readFileSync(resolve(root, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!m) continue
      if (process.env[m[1]] == null) process.env[m[1]] = m[2]
    }
  } catch {
    /* optional */
  }
}

async function listAllStoragePaths(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  prefix = '',
): Promise<string[]> {
  const out: string[] = []
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    offset: 0,
  })
  if (error) {
    console.warn(`[storage] list ${prefix || '/'}:`, error.message)
    return out
  }
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    // Folders have null id / no metadata in some API versions
    const isFolder =
      entry.id == null ||
      (entry.metadata == null && !entry.name.includes('.'))
    if (isFolder && entry.name && !entry.metadata) {
      out.push(...(await listAllStoragePaths(supabase, bucket, path)))
    } else {
      out.push(path)
    }
  }
  return out
}

async function wipeStorageBucket(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
) {
  const paths = await listAllStoragePaths(supabase, bucket)
  console.log(`[storage] ${bucket}: ${paths.length} object(s)`)
  const chunk = 100
  let removed = 0
  for (let i = 0; i < paths.length; i += chunk) {
    const slice = paths.slice(i, i + chunk)
    const { error } = await supabase.storage.from(bucket).remove(slice)
    if (error) {
      console.warn(`[storage] remove failed:`, error.message)
    } else {
      removed += slice.length
    }
  }
  return { listed: paths.length, removed }
}

async function countRows(
  supabase: ReturnType<typeof createClient>,
  table: string,
): Promise<number | string> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (error) return `error: ${error.message}`
  return count ?? 0
}

async function main() {
  loadDotEnvLocal()
  const url = env('VITE_SUPABASE_URL') ?? env('SUPABASE_URL')
  const serviceKey =
    env('SUPABASE_SERVICE_ROLE_KEY') ?? env('SERVICE_ROLE_KEY')
  const sqlOnly = process.argv.includes('--sql-only')

  if (!url) {
    throw new Error('Missing VITE_SUPABASE_URL / SUPABASE_URL')
  }
  if (!serviceKey && !sqlOnly) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. Export it, or run with --sql-only after applying SQL via supabase db.',
    )
  }

  const sql = readFileSync(
    resolve(root, 'scripts/cleanupDevContractData.sql'),
    'utf8',
  )

  if (sqlOnly) {
    console.log('SQL cleanup script ready at scripts/cleanupDevContractData.sql')
    console.log('Apply with: supabase db query --linked -f scripts/cleanupDevContractData.sql')
    console.log('---')
    console.log(sql)
    return
  }

  const supabase = createClient(url, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('Collecting storage paths before SQL wipe…')
  const beforeStorage = await listAllStoragePaths(supabase, 'document-files')

  console.log('Running SQL wipe via RPC/sql is preferred; attempting table deletes…')
  // Prefer applying the SQL file through psql / supabase CLI; service role
  // still cannot execute arbitrary SQL over PostgREST. Delete in FK-safe order
  // via the API, mirroring the SQL script.

  const nullPackages = await supabase
    .from('packages')
    .update({
      active_contract_template_id: null,
      active_contract_template_version_id: null,
    })
    .not('id', 'is', null)
  if (nullPackages.error) {
    console.warn('packages null template:', nullPackages.error.message)
  }

  const nullDraftRuns = await supabase
    .from('wedding_document_drafts')
    .update({ generation_run_id: null })
    .not('id', 'is', null)
  if (nullDraftRuns.error) {
    console.warn('drafts null run:', nullDraftRuns.error.message)
  }

  const tablesInOrder = [
    'wedding_contract_generation_runs',
    'wedding_document_generation_sequences',
    'wedding_documents',
    'wedding_document_drafts',
    'document_template_component_links',
    'document_block_conditions',
    'document_blocks',
    'document_templates',
    'document_components',
    'contracts',
    'wedding_extra_services',
    'travel_segments',
    'wedding_places',
    'calendar_events',
    'tasks',
    'timeline_events',
    'notes',
    'payments',
    'contacts',
    'form_answers',
    'form_instances',
    'galleries',
    'notifications',
    'weddings',
    'package_items',
    'packages',
    'extra_services',
  ] as const

  const deleted: Record<string, number | string> = {}
  for (const table of tablesInOrder) {
    // Locked rows need the SQL script (drops the immutability trigger).
    // Exported rows can be deleted via API.
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000')
    deleted[table] = error ? `error: ${error.message}` : (count ?? 'ok')
    console.log(`delete ${table}:`, deleted[table])
  }

  const storage = await wipeStorageBucket(supabase, 'document-files')

  const remaining: Record<string, number | string> = {}
  for (const table of [
    'document_templates',
    'wedding_documents',
    'wedding_document_drafts',
    'wedding_contract_generation_runs',
    'contracts',
    'weddings',
    'packages',
    'users',
    'profiles',
    'studio_details',
    'forms',
    'document_variable_registry',
  ]) {
    remaining[table] = await countRows(supabase, table)
  }

  console.log('\n=== Cleanup report ===')
  console.log('Storage objects before:', beforeStorage.length)
  console.log('Storage wipe:', storage)
  console.log('Deletes:', deleted)
  console.log('Remaining:', remaining)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
