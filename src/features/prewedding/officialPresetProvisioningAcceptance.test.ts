/**
 * Ankiety V1 Phase 1 — official presets for NEW accounts only.
 */

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { decidePreWeddingDefaultSeed } from '@/features/prewedding/defaultTemplateSeed'
import { DEFAULT_TEMPLATE_SOURCE_KEY } from '@/features/prewedding/defaultTemplate'
import {
  OFFICIAL_PRESET_SOURCE_KEY_PHOTO,
  OFFICIAL_PRESET_SOURCE_KEY_PHOTO_VIDEO,
  OFFICIAL_PRESET_SOURCE_KEY_VIDEO,
  OFFICIAL_PRESET_SOURCE_KEYS,
  OFFICIAL_PRE_WEDDING_PRESETS,
  collectPresetQuestionIds,
  countPresetQuestions,
  hasPresetOption,
  planOfficialPresetProvisioning,
} from '@/features/prewedding/officialPresets'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS  ${message}`)
    passed++
  } else {
    console.error(`  FAIL  ${message}`)
    failed++
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    console.error(
      `  FAIL  ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
    failed++
  } else {
    console.log(`  PASS  ${message}`)
    passed++
  }
}

function run(name: string, fn: () => void) {
  console.log(`\n${name}`)
  fn()
}

function sha(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const MIGRATION = 'supabase/migrations/20260824220000_official_pre_wedding_presets_v1.sql'
const SERVICE = 'src/lib/api/preweddingQuestionnaireService.ts'

function extractDollarJson(sql: string, tag: string): unknown {
  const start = sql.indexOf(`$${tag}$`)
  const end = sql.indexOf(`$${tag}$`, start + tag.length + 2)
  assert(start >= 0 && end > start, `${tag} json located in SQL`)
  return JSON.parse(sql.slice(start + tag.length + 2, end))
}

function getOrSeedDefaultBody(): string {
  const src = read(SERVICE)
  const start = src.indexOf('async getOrSeedDefault()')
  const end = src.indexOf('async create(', start)
  assert(start >= 0 && end > start, 'getOrSeedDefault located')
  return src.slice(start, end)
}

const byKey = Object.fromEntries(OFFICIAL_PRE_WEDDING_PRESETS.map((p) => [p.sourceKey, p]))
const video = byKey[OFFICIAL_PRESET_SOURCE_KEY_VIDEO]!
const photo = byKey[OFFICIAL_PRESET_SOURCE_KEY_PHOTO]!
const photoVideo = byKey[OFFICIAL_PRESET_SOURCE_KEY_PHOTO_VIDEO]!

run('A: new owner provisioning plans exactly 3 pre-wedding templates', () => {
  const rows = planOfficialPresetProvisioning([])
  assertEqual(rows.length, 3, 'three inserts')
  assert(
    rows.every((row) => row.type === 'pre_wedding' && row.isArchived === false),
    'pre_wedding and not archived',
  )
})

run('B: exact source_keys', () => {
  const keys = planOfficialPresetProvisioning([]).map((row) => row.sourceKey)
  assertEqual(keys.join(','), OFFICIAL_PRESET_SOURCE_KEYS.join(','), 'signup key order')
  assertEqual(OFFICIAL_PRESET_SOURCE_KEY_VIDEO, 'pre_wedding_video_v1', 'video key')
  assertEqual(OFFICIAL_PRESET_SOURCE_KEY_PHOTO, 'pre_wedding_photo_v1', 'photo key')
  assertEqual(
    OFFICIAL_PRESET_SOURCE_KEY_PHOTO_VIDEO,
    'pre_wedding_photo_video_v1',
    'photo+video key',
  )
})

run('C: exactly one default — photo_video_v1', () => {
  const rows = planOfficialPresetProvisioning([])
  const defaults = rows.filter((row) => row.isDefault)
  assertEqual(defaults.length, 1, 'one default')
  assertEqual(defaults[0]?.sourceKey, OFFICIAL_PRESET_SOURCE_KEY_PHOTO_VIDEO, 'Foto+Film default')
  assertEqual(video.isDefault, false, 'Film not default')
  assertEqual(photo.isDefault, false, 'Fotografia not default')
})

run('D: exact preset schema fingerprints and important IDs', () => {
  assertEqual(video.schema.sections.length, 11, 'Film sections')
  assertEqual(countPresetQuestions(video.schema), 28, 'Film questions')
  assertEqual(photo.schema.sections.length, 11, 'Fotografia sections')
  assertEqual(countPresetQuestions(photo.schema), 28, 'Fotografia questions')
  assertEqual(photoVideo.schema.sections.length, 11, 'Foto+Film sections')
  assertEqual(countPresetQuestions(photoVideo.schema), 29, 'Foto+Film questions')

  const filmIds = collectPresetQuestionIds(video.schema)
  const photoIds = collectPresetQuestionIds(photo.schema)
  const bothIds = collectPresetQuestionIds(photoVideo.schema)
  assert(!filmIds.includes('q14'), 'Film has no group photo id')
  assert(filmIds.includes('q_speeches'), 'Film speeches id')
  assert(filmIds.includes('q22') && filmIds.includes('q27_info') && filmIds.includes('q28'), 'Film tips/music')
  assert(!hasPresetOption(video.schema, 'Nie mamy filmu'), 'Film has no Nie mamy filmu')
  assert(photoIds.includes('q14'), 'Fotografia group photo')
  assert(!photoIds.includes('q_speeches'), 'Fotografia has no speeches')
  assert(hasPresetOption(photo.schema, 'Nie mamy filmu'), 'Fotografia keeps Nie mamy filmu')
  assert(bothIds.includes('q14') && bothIds.includes('q_speeches'), 'Foto+Film has both')
  assert(!hasPresetOption(photoVideo.schema, 'Nie mamy filmu'), 'Foto+Film has no Nie mamy filmu')
  assertEqual(new Set(photoIds).size, photoIds.length, 'Fotografia unique ids')
  assert(
    !photoIds.some((id) => /^q_[0-9a-f]{8,}$/i.test(id) && id !== 'q_speeches'),
    'Fotografia has no hashed ids',
  )

  const frozenVideo = JSON.parse(
    read('src/features/prewedding/officialPresets/schemas/pre_wedding_video_v1.json'),
  )
  const frozenPhoto = JSON.parse(
    read('src/features/prewedding/officialPresets/schemas/pre_wedding_photo_v1.json'),
  )
  const frozenBoth = JSON.parse(
    read('src/features/prewedding/officialPresets/schemas/pre_wedding_photo_video_v1.json'),
  )
  assertEqual(sha(video.schema), sha(frozenVideo.schema), 'Film TS matches frozen JSON')
  assertEqual(sha(photo.schema), sha(frozenPhoto.schema), 'Fotografia TS matches frozen JSON')
  assertEqual(sha(photoVideo.schema), sha(frozenBoth.schema), 'Foto+Film TS matches frozen JSON')
  assertEqual(
    sha(video.schema),
    'e41a8621c3b85d0a1c55534f2215391b08b838b48885ee1da0419195d3736009',
    'Film matches approved live schema',
  )
  assertEqual(
    sha(photo.schema),
    '390df35ff4c3e6908dc53f008096fdf46ed861de60f1b59d9f58022b3bff88d9',
    'Fotografia matches approved live schema',
  )
  assertEqual(
    sha(photoVideo.schema),
    '14241a60605a40d90e2a9ddb015d8255a139103c50805d2e81941d1995e1eccf',
    'Foto+Film matches approved live schema',
  )

  const sql = read(MIGRATION)
  assertEqual(sha(extractDollarJson(sql, 'ow_video_v1')), sha(video.schema), 'SQL Film schema')
  assertEqual(sha(extractDollarJson(sql, 'ow_photo_v1')), sha(photo.schema), 'SQL Fotografia schema')
  assertEqual(
    sha(extractDollarJson(sql, 'ow_photo_video_v1')),
    sha(photoVideo.schema),
    'SQL Foto+Film schema',
  )

  const group = photo.schema.sections
    .flatMap((s) => s.questions)
    .find((q) => q.id === 'q14')
  assertEqual(group?.weddingDayMapping, 'groupPhotoPlan', 'q14 mapping')
  assertEqual(
    video.schema.sections.flatMap((s) => s.questions).find((q) => q.id === 'q24')?.required,
    false,
    'Film family optional',
  )
  assertEqual(
    photo.schema.sections.flatMap((s) => s.questions).find((q) => q.id === 'q24')?.required,
    false,
    'Fotografia family optional',
  )
})

run('E: no generic fourth template in the official preset set', () => {
  const keys = planOfficialPresetProvisioning([]).map((row) => row.sourceKey)
  assert(!(keys as readonly string[]).includes(DEFAULT_TEMPLATE_SOURCE_KEY), 'v2 not in signup set')
  const sql = read(MIGRATION)
  const provisionStart = sql.indexOf('provision_official_pre_wedding_presets')
  const provisionFn = sql.slice(provisionStart, sql.indexOf('create or replace function public.handle_new_user'))
  assert(!provisionFn.includes('pre_wedding_default_v2'), 'SQL provision does not insert v2')
})

run('F: provisioning retry does not duplicate rows', () => {
  const first = planOfficialPresetProvisioning([])
  const retry = planOfficialPresetProvisioning(first.map((row) => row.sourceKey))
  assertEqual(retry.length, 0, 'second pass inserts nothing')
  const partial = planOfficialPresetProvisioning([OFFICIAL_PRESET_SOURCE_KEY_VIDEO])
  assertEqual(partial.length, 2, 'retry completes missing presets only')
  assert(
    !partial.some((row) => row.sourceKey === OFFICIAL_PRESET_SOURCE_KEY_VIDEO),
    'existing Film is not reinserted',
  )
})

run('G: existing owner is not backfilled', () => {
  const sql = read(MIGRATION)
  assert(sql.includes('p_owner_id'), 'provision is per-owner')
  assert(sql.includes('AFTER INSERT ON auth.users') || sql.includes('on auth.users'), 'new-user only')
  assert(!/insert into public\.questionnaire_templates[\s\S]*from public\.(profiles|users)/i.test(sql), 'no owner backfill select')
  assert(sql.includes('perform public.provision_official_pre_wedding_presets(new.id)'), 'called with new.id')
  assert(!sql.includes('getOrSeedDefault'), 'signup does not call getOrSeedDefault')
})

run('H: user customization — seed path does not UPDATE an existing source_key row', () => {
  const sql = read(MIGRATION)
  const provisionFn = sql.slice(
    sql.indexOf('create or replace function public.provision_official_pre_wedding_presets'),
    sql.indexOf('create or replace function public.handle_new_user'),
  )
  assert(!/\bupdate\s+public\.questionnaire_templates/i.test(provisionFn), 'provision has no template UPDATE')
  assert(provisionFn.includes('where not exists'), 'skip existing source_key')
  const renamed = planOfficialPresetProvisioning(OFFICIAL_PRESET_SOURCE_KEYS)
  assertEqual(renamed.length, 0, 'owned copies are left alone')
  const body = getOrSeedDefaultBody()
  assert(!body.includes('.update('), 'getOrSeedDefault does not UPDATE templates')
})

run('I: archived owned preset is not silently recreated', () => {
  const archivedStillPresent = decidePreWeddingDefaultSeed({
    hasCurrentSourceKey: false,
    hasOfficialPresetSourceKey: true,
    hasActiveDefault: false,
  })
  assertEqual(archivedStillPresent.action, 'return_official', 'archived official still counts')
  const sql = read(MIGRATION)
  assert(
    sql.includes('existing.source_key') && sql.includes('where not exists'),
    'SQL skips any existing source_key regardless of archive',
  )
})

run('J: existing issued snapshots untouched', () => {
  const sql = read(MIGRATION)
  assert(!/insert into public\.wedding_questionnaires/i.test(sql), 'no issued insert')
  assert(!/update public\.wedding_questionnaires/i.test(sql), 'no issued update')
  assert(!/schema_snapshot_json\s*=/i.test(sql), 'no snapshot assignment')
  const body = getOrSeedDefaultBody()
  assert(!body.includes('wedding_questionnaires'), 'getOrSeedDefault ignores issued rows')
  assert(!body.includes('schema_snapshot_json'), 'getOrSeedDefault ignores snapshots')
})

run('K: Phase 0 — never rewrite v1/custom rows; official accounts skip generic v2', () => {
  const official = decidePreWeddingDefaultSeed({
    hasCurrentSourceKey: false,
    hasOfficialPresetSourceKey: true,
    hasActiveDefault: true,
  })
  assertEqual(official.action, 'return_official', 'official wins over v2 insert')
  const legacyCustom = decidePreWeddingDefaultSeed({
    hasCurrentSourceKey: false,
    hasOfficialPresetSourceKey: false,
    hasActiveDefault: true,
  })
  assertEqual(legacyCustom.action, 'insert_current', 'legacy still inserts v2 beside custom')
  if (legacyCustom.action === 'insert_current') {
    assertEqual(legacyCustom.isDefault, false, 'does not steal existing default')
  }
  const body = getOrSeedDefaultBody()
  assert(body.includes('OFFICIAL_PRESET_SOURCE_KEYS'), 'looks up official keys')
  assert(body.includes('existingActive.find((t) => t.isDefault)'), 'honors user-selected default')
  assert(body.includes('DEFAULT_TEMPLATE_SOURCE_KEY'), 'legacy v2 path remains')
  assert(!body.includes('DEFAULT_TEMPLATE_SOURCE_KEY_V1'), 'does not rewrite v1 origin rows')
})

run('library names, public titles, and intro are frozen', () => {
  assertEqual(video.name, 'Film', 'Film library name')
  assertEqual(photo.name, 'Fotografia', 'Fotografia library name')
  assertEqual(photoVideo.name, 'Fotografia + Film', 'Foto+Film library name')
  assert(
    [video, photo, photoVideo].every((p) => p.title === 'Ankieta przedślubna'),
    'public title',
  )
  assert(
    [video, photo, photoVideo].every((p) =>
      p.introduction.startsWith('Cześć! Już niedługo się widzimy.'),
    ),
    'shared intro',
  )
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
