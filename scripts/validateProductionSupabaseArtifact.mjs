#!/usr/bin/env node
/**
 * Pre-deploy / post-build gate for production frontend candidates.
 *
 * Fails if the built JS artifact contains known placeholder Supabase config
 * (the A1.0 incident: shell fixture env poisoned a prebuilt production deploy).
 *
 * Does not print credentials. Does not affect runtime.
 *
 * Usage:
 *   node scripts/validateProductionSupabaseArtifact.mjs
 *   node scripts/validateProductionSupabaseArtifact.mjs --root .vercel/output/static
 *   node scripts/validateProductionSupabaseArtifact.mjs --root dist
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const EXPECTED_PROJECT_REF = 'xyycwllsovpxlcustpcv'
const FORBIDDEN_HOST = 'example.supabase.co'
const FORBIDDEN_DUMMY_ANON = 'eyJhbGciOiJub25lIn0.e30.none'

function argValue(flag) {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : null
}

function listJsFiles(root) {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (name.endsWith('.js')) out.push(p)
    }
  }
  walk(root)
  return out
}

const rootArg = argValue('--root')
const candidates = rootArg
  ? [resolve(process.cwd(), rootArg)]
  : [
      resolve(process.cwd(), '.vercel/output/static'),
      resolve(process.cwd(), 'dist'),
    ]

const root = candidates.find((p) => existsSync(p))
if (!root) {
  console.error(
    'validateProductionSupabaseArtifact: no build output found. Looked for:',
    candidates.join(', '),
  )
  process.exit(2)
}

const files = listJsFiles(root)
if (files.length === 0) {
  console.error(`validateProductionSupabaseArtifact: no .js files under ${root}`)
  process.exit(2)
}

const blob = files.map((f) => readFileSync(f, 'utf8')).join('\n')

const gates = {
  REAL_SUPABASE_PROJECT_PRESENT: blob.includes(EXPECTED_PROJECT_REF),
  EXAMPLE_SUPABASE_ABSENT: !blob.includes(FORBIDDEN_HOST),
  DUMMY_ANON_KEY_ABSENT: !blob.includes(FORBIDDEN_DUMMY_ANON),
}

const failed = Object.entries(gates)
  .filter(([, ok]) => !ok)
  .map(([name]) => name)

console.log(`validateProductionSupabaseArtifact: root=${root} js_files=${files.length}`)
for (const [name, ok] of Object.entries(gates)) {
  console.log(`  ${name}=${ok ? 'YES' : 'NO'}`)
}

if (failed.length > 0) {
  console.error(
    'A11_ARTIFACT_ENV_VALIDATION_FAILED:',
    failed.join(', '),
  )
  console.error(
    'Refuse to promote: production candidate must contain project ref',
    EXPECTED_PROJECT_REF,
    `and must not contain ${FORBIDDEN_HOST} or the known dummy anon JWT.`,
  )
  process.exit(1)
}

console.log('validateProductionSupabaseArtifact: PASS')
