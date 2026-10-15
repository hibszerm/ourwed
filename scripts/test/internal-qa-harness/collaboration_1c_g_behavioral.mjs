import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const envPath = process.argv[2]
if (!envPath) throw new Error('Usage: node collaboration_1c_g_behavioral.mjs /private/tmp/.../local.env')
const env = Object.fromEntries(readFileSync(envPath, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#'))
  .map((line) => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1).replace(/^"|"$/g, '')] }))
const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = env
assert.ok(apiUrl && anonKey && serviceKey, 'local Supabase URL and keys are required')
assert.equal(new URL(apiUrl).hostname, '127.0.0.1', 'browser tests must target loopback only')
const email = `1cg-browser-${randomUUID()}@example.test`
const password = `LocalOnly-${randomUUID()}!`
const origin = 'http://127.0.0.1:4173'
const now = () => new Date().toISOString()
const system = [
  { preset_id: '9cg00000-0000-4000-8000-000000000001', scope: 'system', name: 'Podgląd podstawowy',
    description: 'Podgląd podstawowych informacji, miejsc i godzin.', version: '1', updated_at: now(),
    created_at: now(), permission_group_mapping_version: '1', grants: [
      { capability_key: 'wedding.identity', level: 1 }, { capability_key: 'places.address', level: 1 }, { capability_key: 'schedule.operational_time', level: 1 }] },
  { preset_id: '9cg00000-0000-4000-8000-000000000002', scope: 'system', name: 'Pełny dostęp operacyjny',
    description: 'Podgląd podstawowych informacji oraz edycja miejsc i godzin.', version: '1', updated_at: now(),
    created_at: now(), permission_group_mapping_version: '1', grants: [
      { capability_key: 'wedding.identity', level: 1 }, { capability_key: 'places.address', level: 2 }, { capability_key: 'schedule.operational_time', level: 2 }] },
]
const mixedGrants = [
  { capability_key: 'wedding.identity', level: 1 },
  { capability_key: 'places.address', level: 2 },
  { capability_key: 'schedule.operational_time', level: 1 },
]
const presets = new Map(system.map((item) => [item.preset_id, structuredClone(item)]))
presets.set('9cg00000-0000-4000-8000-000000000003', {
  preset_id: '9cg00000-0000-4000-8000-000000000003', scope: 'user', name: 'Mieszany testowy', description: 'Zachowaj poziomy',
  version: '1', updated_at: now(), created_at: now(), permission_group_mapping_version: '1', grants: structuredClone(mixedGrants),
})
let ownerId
let vite
let browser
const calls = []
let failPresetList = false
const failPresetDetails = new Set()
let failPresetCreateOnce = false
let failPresetUpdateOnce = false
let failPresetArchiveOnce = false
let conflictPresetUpdateOnce = false
const pendingDto = { wedding_id: '8cg00000-0000-4000-8000-000000000001', invitation_id: '8cg00000-0000-4000-8000-000000000002',
  status: 'pending', invitee_display_name: 'Local invitee', role_key: 'unspecified', custom_role_label: null, access_mode: 'viewer',
  access_configuration_version: 1, configuration_revision: '1', custom_grants: [],
  viewer_preview: system[0].grants, editor_preview: system[1].grants, permission_group_mapping_version: '1' }
const activeDto = { ...pendingDto, invitation_id: undefined, membership_id: '8cg00000-0000-4000-8000-000000000003',
  status: 'active', access_version: '1' }

function response(status, data) {
  return { status, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
    'access-control-allow-methods': 'POST, OPTIONS', 'content-type': 'application/json' }, body: JSON.stringify(data) }
}
function fail(route, message) { return route.fulfill(response(400, { code: 'P0001', message, details: null, hint: null })) }
function activeItems() { return [...presets.values()].filter((item) => item.scope === 'system' || !item.archived_at) }
function detail(item) {
  const { archived_at: _archivedAt, owner_user_id: _owner, system_key: _systemKey, ...publicItem } = item
  return publicItem
}
async function api(path, { method = 'GET', body, key = anonKey, token = key } = {}) {
  const res = await fetch(`${apiUrl}${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${token}`,
    ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  if (!res.ok) throw new Error(`local API request failed (${res.status})`)
  return text ? JSON.parse(text) : null
}
async function removeUser() {
  if (!ownerId) return
  await fetch(`${apiUrl}/auth/v1/admin/users/${ownerId}`, { method: 'DELETE', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }).catch(() => {})
}
async function assertNoOverflow(page, label) {
  const result = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }))
  assert.ok(result.width <= result.viewport, `${label} has no horizontal overflow: ${JSON.stringify(result)}`)
}
async function assertActionReachable(button, label) {
  await button.scrollIntoViewIfNeeded()
  assert.ok(await button.isVisible(), `${label} action is reachable by scrolling`)
}

try {
  const signup = await api('/auth/v1/signup', { method: 'POST', body: { email, password, data: {
    first_name: 'Local', last_name: '1C-G Browser', profession: 'photographer', legal_registration_accepted: true,
    terms_version: '1.1', privacy_version: '1.1' } } })
  ownerId = signup.user?.id ?? signup.id
  assert.ok(ownerId, 'a disposable local Auth user is created')
  presets.get('9cg00000-0000-4000-8000-000000000003').owner_user_id = ownerId
  vite = spawn('./node_modules/.bin/vite', ['--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
    cwd: process.cwd(), env: { ...process.env, VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: anonKey }, stdio: ['ignore', 'pipe', 'pipe'] })
  let viteErrors = ''
  vite.stdout.setEncoding('utf8'); vite.stdout.on('data', (chunk) => { viteErrors += chunk })
  vite.stderr.setEncoding('utf8'); vite.stderr.on('data', (chunk) => { viteErrors += chunk })
  let ready = false
  let fixtureResponse = ''
  for (let i = 0; i < 80; i++) {
    if (vite.exitCode !== null) throw new Error(`local Vite exited: ${viteErrors}`)
    try {
      const res = await fetch(`${origin}/scripts/test/internal-qa-harness/collaboration_1c_g_behavioral.html`)
      fixtureResponse = `HTTP ${res.status}`
      if (res.ok) { ready = true; break }
    } catch (error) { fixtureResponse = String(error) }
    await delay(250)
  }
  assert.ok(ready, `local browser fixture did not start (${fixtureResponse}): ${viteErrors}`)
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route(`${apiUrl}/rest/v1/rpc/**`, async (route) => {
    const req = route.request(); const name = req.url().split('/').pop(); const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const input = req.postDataJSON() ?? {}
    calls.push({ name, input })
    if (name === 'list_collaboration_permission_presets') return failPresetList ? fail(route, 'UNAVAILABLE') : route.fulfill(response(200, activeItems().map(detail)))
    if (name === 'get_collaboration_permission_preset') {
      const item = presets.get(input.p_preset_id)
      if (failPresetDetails.has(input.p_preset_id)) { failPresetDetails.delete(input.p_preset_id); return fail(route, 'UNAVAILABLE') }
      if (!item || item.archived_at) return fail(route, 'UNAVAILABLE')
      return route.fulfill(response(200, detail(item)))
    }
    if (name === 'create_collaboration_permission_preset' || name === 'duplicate_collaboration_permission_preset') {
      if (name === 'create_collaboration_permission_preset' && failPresetCreateOnce) {
        failPresetCreateOnce = false
        return fail(route, 'UNAVAILABLE')
      }
      const source = name.startsWith('duplicate') ? presets.get(input.p_source_preset_id) : null
      if (name.startsWith('duplicate') && (!source || source.archived_at)) return fail(route, 'UNAVAILABLE')
      const nameValue = input.p_name
      if (activeItems().some((item) => item.scope === 'user' && item.name.toLocaleLowerCase('pl') === nameValue.trim().toLocaleLowerCase('pl'))) return fail(route, 'CONFLICT')
      const id = randomUUID()
      const grants = name.startsWith('duplicate') ? structuredClone(source.grants) : structuredClone(input.p_grants)
      const item = { preset_id: id, scope: 'user', name: nameValue.trim(), description: input.p_description?.trim() || null,
        version: '1', owner_user_id: ownerId, created_at: now(), updated_at: now(), permission_group_mapping_version: '1', grants }
      presets.set(id, item)
      return route.fulfill(response(200, detail(item)))
    }
    if (name === 'update_collaboration_permission_preset') {
      const item = presets.get(input.p_preset_id)
      if (!item || item.archived_at || item.owner_user_id !== ownerId) return fail(route, 'UNAVAILABLE')
      if (failPresetUpdateOnce) { failPresetUpdateOnce = false; return fail(route, 'UNAVAILABLE') }
      if (conflictPresetUpdateOnce) {
        conflictPresetUpdateOnce = false
        item.name = 'Server version two'; item.version = '2'; item.updated_at = now()
        return fail(route, 'CONFLICT')
      }
      if (input.p_expected_version !== item.version) return fail(route, 'CONFLICT')
      const changed = item.name !== input.p_name.trim() || item.description !== (input.p_description?.trim() || null)
        || JSON.stringify(item.grants) !== JSON.stringify(input.p_grants)
      if (changed) {
        item.name = input.p_name.trim(); item.description = input.p_description?.trim() || null
        item.grants = structuredClone(input.p_grants); item.version = String(BigInt(item.version) + 1n); item.updated_at = now()
      }
      return route.fulfill(response(200, { changed, version: item.version, preset: detail(item) }))
    }
    if (name === 'archive_collaboration_permission_preset') {
      const item = presets.get(input.p_preset_id)
      if (!item || item.archived_at || item.owner_user_id !== ownerId) return fail(route, 'UNAVAILABLE')
      if (failPresetArchiveOnce) { failPresetArchiveOnce = false; return fail(route, 'UNAVAILABLE') }
      if (input.p_expected_version !== item.version) return fail(route, 'CONFLICT')
      item.archived_at = now(); item.version = String(BigInt(item.version) + 1n); item.updated_at = item.archived_at
      return route.fulfill(response(200, { archived: true, version: item.version }))
    }
    if (name === 'get_wedding_collaboration_invitation_access_management') return route.fulfill(response(200, pendingDto))
    if (name === 'get_wedding_collaboration_membership_access_management') return route.fulfill(response(200, activeDto))
    if (name === 'update_wedding_collaboration_invitation_access') {
      pendingDto.access_mode = input.p_access_mode
      pendingDto.custom_grants = structuredClone(input.p_custom_grants)
      pendingDto.configuration_revision = String(BigInt(pendingDto.configuration_revision) + 1n)
      return route.fulfill(response(200, { changed: true, configuration_revision: pendingDto.configuration_revision, configuration: structuredClone(pendingDto) }))
    }
    if (name === 'update_wedding_collaboration_membership_access') {
      activeDto.access_mode = input.p_access_mode
      activeDto.custom_grants = structuredClone(input.p_custom_grants)
      activeDto.access_version = String(BigInt(activeDto.access_version) + 1n)
      return route.fulfill(response(200, { changed: true, access_version: activeDto.access_version, configuration: structuredClone(activeDto) }))
    }
    if (name === 'get_wedding_collaboration_access_previews') return route.fulfill(response(200, {
      viewer_preview: system[0].grants, editor_preview: system[1].grants, permission_group_mapping_version: '1' }))
    if (name === 'get_wedding_collaboration_state') return route.fulfill(response(200, { wedding_id: '8cg00000-0000-4000-8000-000000000001', invitations: [], active_memberships: [] }))
    if (name === 'get_collaboration_state') return route.fulfill(response(200, { incoming_pending: [], outgoing_pending: [], connections: [
      { id: '8cg00000-0000-4000-8000-000000000004', display_name: 'Local collaborator', connected_at: now() }] }))
    if (name === 'create_wedding_collaboration_invitation_configured') return route.fulfill(response(200, { status: 'created', invitation_id: randomUUID() }))
    return route.fulfill(response(404, { message: 'unexpected local RPC' }))
  })

  await page.goto(`${origin}/scripts/test/internal-qa-harness/collaboration_1c_g_behavioral.html`)
  await page.waitForFunction(() => Boolean(window.__onecgTest))
  await page.evaluate(({ email: userEmail, password: userPassword }) => window.__onecgTest.login(userEmail, userPassword), { email, password })
  await page.getByTestId('auth-user-id').filter({ hasText: ownerId }).waitFor()

  // Settings manager and the exact mixed-state editor.
  await page.getByTestId('collaboration-permission-preset-manager').waitFor()
  await page.getByText('Podgląd podstawowy', { exact: true }).waitFor()
  for (const [width, height] of [[390, 844], [375, 812]]) {
    await page.setViewportSize({ width, height })
    await assertNoOverflow(page, `preset manager ${width}×${height}`)
  }
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByText('Pełny dostęp operacyjny', { exact: true }).waitFor()
  const editorTrigger = page.getByRole('button', { name: 'Edytuj' }).first()
  await editorTrigger.focus()
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Edytuj', 'edit trigger is keyboard focusable')
  await editorTrigger.click()
  const managerDialog = page.getByRole('dialog')
  await managerDialog.waitFor()
  assert.ok(await managerDialog.getAttribute('aria-labelledby'), 'preset editor dialog is labelled')
  await page.keyboard.press('Tab')
  assert.ok(await managerDialog.evaluate((node) => node.contains(document.activeElement)), 'keyboard focus stays inside the editor dialog')
  await page.setViewportSize({ width: 375, height: 812 })
  await assertNoOverflow(page, 'preset edit dialog 375×812')
  await assertActionReachable(managerDialog.getByRole('button', { name: 'Zapisz zestaw' }), 'preset edit save')
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByText('Różne poziomy').waitFor()
  const mixedGroup = page.getByRole('radiogroup', { name: 'Miejsca i godziny' })
  assert.ok(await mixedGroup.getAttribute('aria-describedby'), 'mixed permission state is announced by the group')
  assert.equal(await mixedGroup.getByRole('radio', { name: 'Brak' }).getAttribute('tabindex'), '0', 'mixed group has a keyboard entry point')
  const initialUpdate = calls.filter((call) => call.name === 'update_collaboration_permission_preset').length
  failPresetUpdateOnce = true
  await page.getByLabel('Nazwa zestawu').fill('Mieszany po zmianie nazwy')
  await page.getByRole('button', { name: 'Zapisz zestaw' }).click()
  await managerDialog.getByRole('alert').filter({ hasText: 'Wpisane dane pozostały w formularzu' }).waitFor()
  assert.equal(await page.getByLabel('Nazwa zestawu').inputValue(), 'Mieszany po zmianie nazwy', 'update network failure keeps the local draft')
  await page.getByRole('button', { name: 'Zapisz zestaw' }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(calls.filter((call) => call.name === 'update_collaboration_permission_preset').length, initialUpdate + 2)
  assert.equal(presets.get('9cg00000-0000-4000-8000-000000000003').version, '2', 'rename-only change increments source preset from v1 to v2')
  assert.deepEqual(presets.get('9cg00000-0000-4000-8000-000000000003').grants, mixedGrants, 'rename-only keeps exact mixed grants')
  await page.getByRole('button', { name: 'Edytuj' }).first().focus()
  await page.getByRole('button', { name: 'Edytuj' }).first().click()
  const keyboardGroup = page.getByRole('radiogroup', { name: 'Miejsca i godziny' })
  await keyboardGroup.getByRole('radio', { name: 'Brak' }).focus()
  await page.keyboard.press('ArrowRight')
  await keyboardGroup.getByRole('radio', { name: 'Podgląd' }).waitFor()
  assert.equal(await keyboardGroup.getByRole('radio', { name: 'Podgląd' }).getAttribute('aria-checked'), 'true', 'explicit keyboard group selection normalizes the group')
  await page.getByText('Zamknij', { exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Edytuj')
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Edytuj', 'closing the editor returns focus to its trigger')

  // Create, duplicate system, archive, and verify confirmation.
  failPresetCreateOnce = true
  await page.getByRole('button', { name: 'Utwórz zestaw' }).click()
  const createDialog = page.getByRole('dialog')
  await page.setViewportSize({ width: 390, height: 844 })
  await assertNoOverflow(page, 'preset create dialog 390×844')
  await assertActionReachable(createDialog.getByRole('button', { name: 'Zapisz zestaw' }), 'preset create save')
  await page.getByLabel('Nazwa zestawu').fill('Pusty zakres')
  await page.getByRole('button', { name: 'Zapisz zestaw' }).click()
  await createDialog.getByRole('alert').filter({ hasText: 'Wpisane dane pozostały w formularzu' }).waitFor()
  assert.equal(await page.getByLabel('Nazwa zestawu').inputValue(), 'Pusty zakres', 'create network failure keeps the local draft')
  await page.getByRole('button', { name: 'Zapisz zestaw' }).click()
  await page.getByText('Pusty zakres').waitFor()
  const emptyPreset = [...presets.values()].find((item) => item.name === 'Pusty zakres')
  assert.deepEqual(emptyPreset.grants, [], 'manager supports empty snapshots')
  await page.getByRole('button', { name: 'Utwórz zestaw' }).click()
  await page.getByLabel('Nazwa zestawu').fill('Conflict preset')
  await page.getByRole('button', { name: 'Zapisz zestaw' }).click()
  const conflictRow = page.getByText('Conflict preset', { exact: true }).locator('xpath=../..')
  await conflictRow.getByRole('button', { name: 'Edytuj' }).click()
  await page.getByLabel('Nazwa zestawu').fill('Draft from editor A')
  conflictPresetUpdateOnce = true
  await page.getByRole('button', { name: 'Zapisz zestaw' }).click()
  await page.getByRole('alert').filter({ hasText: 'Zestaw zmienił się w międzyczasie' }).waitFor()
  assert.equal(await page.getByLabel('Nazwa zestawu').inputValue(), 'Draft from editor A', 'stale conflict keeps editor A draft')
  await page.getByRole('button', { name: 'Wczytaj aktualną wersję, zachowując moje zmiany' }).click()
  assert.equal(await page.getByLabel('Nazwa zestawu').inputValue(), 'Draft from editor A', 'refresh updates baseline without replacing local fields')
  await page.getByRole('button', { name: 'Zapisz zestaw' }).click()
  const conflictPreset = [...presets.values()].find((item) => item.name === 'Draft from editor A')
  assert.equal(conflictPreset.version, '3', 'stale writer saves only after loading the latest version')
  await page.getByRole('button', { name: 'Duplikuj', exact: true }).first().click()
  const duplicateDialog = page.getByRole('dialog')
  await page.setViewportSize({ width: 375, height: 812 })
  await assertNoOverflow(page, 'preset duplicate dialog 375×812')
  await assertActionReachable(duplicateDialog.getByRole('button', { name: 'Zapisz zestaw' }), 'preset duplicate save')
  await page.getByLabel('Nazwa zestawu').fill('Kopia systemowa')
  await page.getByRole('button', { name: 'Zapisz zestaw' }).click()
  const copy = [...presets.values()].find((item) => item.name === 'Kopia systemowa')
  assert.ok(copy && copy.scope === 'user' && copy.version === '1', 'system duplicate is an independent user preset')
  await page.getByRole('button', { name: 'Archiwizuj' }).last().click()
  const archiveDialog = page.getByRole('dialog')
  await page.setViewportSize({ width: 390, height: 844 })
  await assertNoOverflow(page, 'preset archive dialog 390×844')
  await assertActionReachable(archiveDialog.getByRole('button', { name: 'Archiwizuj zestaw' }), 'preset archive confirm')
  failPresetArchiveOnce = true
  await page.getByRole('button', { name: 'Archiwizuj zestaw' }).click()
  await archiveDialog.getByRole('alert').filter({ hasText: 'Nie udało się zarchiwizować zestawu' }).waitFor()
  assert.ok(await archiveDialog.isVisible(), 'archive network failure keeps confirmation dialog open')
  await page.getByRole('button', { name: 'Archiwizuj zestaw' }).click()
  assert.ok([...presets.values()].some((item) => item.archived_at), 'archive action soft-archives the preset')

  // Pending access: selecting/applying is local; save-as is a separate write.
  failPresetList = true
  await page.getByRole('button', { name: 'Oczekujące' }).click()
  const pendingDialog = page.getByRole('dialog')
  await pendingDialog.waitFor()
  await page.getByRole('radio', { name: 'Niestandardowe' }).check()
  await pendingDialog.getByRole('alert').filter({ hasText: 'Nie udało się wczytać zestawu' }).waitFor()
  await page.getByRole('radiogroup', { name: 'Miejsca i godziny' }).waitFor()
  failPresetList = false
  await pendingDialog.getByRole('button', { name: 'Spróbuj ponownie' }).click()
  await pendingDialog.getByRole('button', { name: /^Podgląd podstawowy / }).waitFor()
  failPresetDetails.add('9cg00000-0000-4000-8000-000000000001')
  await pendingDialog.getByRole('button', { name: /^Podgląd podstawowy / }).click()
  await pendingDialog.getByRole('alert').filter({ hasText: 'Nie udało się wczytać zestawu' }).waitFor()
  const authorityBeforeApply = calls.filter((call) => call.name === 'update_wedding_collaboration_invitation_access').length
  await pendingDialog.getByRole('button', { name: /^Podgląd podstawowy / }).click()
  await pendingDialog.getByText(/Zastosowano zestaw/).waitFor()
  assert.equal(calls.filter((call) => call.name === 'update_wedding_collaboration_invitation_access').length, authorityBeforeApply,
    'applying preset makes no authority RPC')
  await pendingDialog.getByRole('button', { name: /Pusty zakres/ }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('[role="radiogroup"][aria-label="Podstawowe informacje"] [role="radio"]')].some((radio) => radio.textContent?.trim() === 'Brak' && radio.getAttribute('aria-checked') === 'true'))
  assert.equal(await page.getByRole('radiogroup', { name: 'Podstawowe informacje' }).getByRole('radio', { name: 'Brak' }).getAttribute('aria-checked'), 'true', 'empty preset does not add wedding.identity')
  assert.equal(await page.getByRole('radiogroup', { name: 'Miejsca i godziny' }).getByRole('radio', { name: 'Brak' }).getAttribute('aria-checked'), 'true', 'empty preset stays empty in the access draft')
  const authorityBeforeEmptySave = calls.filter((call) => call.name === 'update_wedding_collaboration_invitation_access').length
  await page.getByRole('button', { name: 'Zapisz dostęp' }).click()
  await pendingDialog.waitFor({ state: 'hidden' })
  const emptyAuthorityCall = calls.filter((call) => call.name === 'update_wedding_collaboration_invitation_access').at(-1)
  assert.equal(calls.filter((call) => call.name === 'update_wedding_collaboration_invitation_access').length, authorityBeforeEmptySave + 1)
  assert.equal(emptyAuthorityCall.input.p_access_mode, 'custom', 'empty snapshot is saved through existing Custom authority path')
  assert.deepEqual(emptyAuthorityCall.input.p_custom_grants, [], 'existing authority save preserves an exact empty Custom snapshot')
  await page.getByRole('button', { name: 'Oczekujące' }).click()
  await pendingDialog.waitFor()
  assert.equal(await pendingDialog.getByRole('radiogroup', { name: 'Podstawowe informacje' }).getByRole('radio', { name: 'Brak' }).getAttribute('aria-checked'), 'true', 'refetched empty Custom authority remains empty')
  assert.equal(await pendingDialog.getByRole('radiogroup', { name: 'Miejsca i godziny' }).getByRole('radio', { name: 'Brak' }).getAttribute('aria-checked'), 'true', 'refetched empty Custom authority does not add identity or grouped grants')
  await pendingDialog.getByRole('button', { name: /Mieszany po zmianie nazwy/ }).click()
  await pendingDialog.getByText('Różne poziomy').waitFor()
  await pendingDialog.getByLabel('Rola przy tym zleceniu').selectOption('system:photographer')
  await pendingDialog.getByText('Różne poziomy').waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  await assertNoOverflow(page, 'pending access sheet with permission matrix 390×844')
  await pendingDialog.getByRole('button', { name: 'Zapisz jako zestaw' }).click()
  const saveAsDialog = page.getByRole('dialog')
  await assertNoOverflow(page, 'save-as-preset dialog 390×844')
  await assertActionReachable(saveAsDialog.getByRole('button', { name: 'Zapisz zestaw' }), 'save-as-preset save')
  await page.getByLabel('Nazwa zestawu').fill('Zapisany z dostępu')
  const accessSaveAsCount = calls.filter((call) => call.name === 'update_wedding_collaboration_invitation_access').length
  await page.getByRole('button', { name: 'Zapisz zestaw' }).click()
  assert.equal(calls.filter((call) => call.name === 'update_wedding_collaboration_invitation_access').length, accessSaveAsCount,
    'save-as-preset does not save pending authority')
  await page.getByRole('button', { name: 'Zapisz dostęp' }).click()
  await page.waitForFunction(() => window.__onecgTest.currentUserId())
  const pendingAuthorityCall = calls.filter((call) => call.name === 'update_wedding_collaboration_invitation_access').at(-1)
  assert.equal(calls.filter((call) => call.name === 'update_wedding_collaboration_invitation_access').length, authorityBeforeApply + 2)
  assert.ok(!('p_preset_id' in pendingAuthorityCall.input), 'pending authority RPC receives no preset identity')
  assert.deepEqual(pendingAuthorityCall.input.p_custom_grants, mixedGrants, 'final pending save receives the exact locally-applied mixed snapshot')

  // Accepted membership uses its existing authority command.
  await page.getByRole('button', { name: 'Aktywne' }).click()
  const activeDialog = page.getByRole('dialog')
  await activeDialog.waitFor()
  await page.getByRole('radio', { name: 'Niestandardowe' }).check()
  await activeDialog.getByRole('button', { name: /Mieszany po zmianie nazwy/ }).click()
  const memberBefore = calls.filter((call) => call.name === 'update_wedding_collaboration_membership_access').length
  await page.getByRole('button', { name: 'Zapisz dostęp' }).click()
  assert.equal(calls.filter((call) => call.name === 'update_wedding_collaboration_membership_access').length, memberBefore + 1)
  const membershipAuthorityCall = calls.filter((call) => call.name === 'update_wedding_collaboration_membership_access').at(-1)
  assert.deepEqual(membershipAuthorityCall.input.p_custom_grants, mixedGrants, 'accepted membership save receives the exact selected Custom preset')
  assert.ok(!('p_preset_id' in membershipAuthorityCall.input), 'membership authority RPC receives no preset identity')

  // Initial invite stays on its single configured-create command.
  await page.getByRole('button', { name: 'Nowe zaproszenie' }).click()
  await page.getByRole('button', { name: 'Dodaj współpracownika' }).click()
  await page.getByLabel('Wybierz połączone konto').selectOption('8cg00000-0000-4000-8000-000000000004')
  await page.getByRole('radio', { name: 'Niestandardowe' }).check()
  await page.getByRole('button', { name: /Mieszany po zmianie nazwy/ }).click()
  const configuredBefore = calls.filter((call) => call.name === 'create_wedding_collaboration_invitation_configured').length
  await page.getByRole('button', { name: 'Sprawdź zaproszenie' }).click()
  await page.getByRole('button', { name: 'Wyślij zaproszenie' }).click()
  assert.equal(calls.filter((call) => call.name === 'create_wedding_collaboration_invitation_configured').length, configuredBefore + 1)
  const configuredCall = calls.filter((call) => call.name === 'create_wedding_collaboration_invitation_configured').at(-1)
  assert.ok(!('p_preset_id' in configuredCall.input), 'configured create receives no preset identity')
  assert.equal(configuredCall.input.p_access_mode, 'custom', 'system preset creates a Custom invitation, not Viewer or Editor')
  assert.deepEqual(configuredCall.input.p_custom_grants, mixedGrants, 'configured create stores the exact selected user snapshot')

  // Changing and archiving the source preset cannot propagate to saved authority.
  const savedMembershipGrants = structuredClone(activeDto.custom_grants)
  const savedMembershipVersion = activeDto.access_version
  const savedInvitationGrants = structuredClone(pendingDto.custom_grants)
  const savedInvitationRevision = pendingDto.configuration_revision
  await page.getByRole('button', { name: 'Ustawienia' }).click()
  let sourceRow = page.getByText('Mieszany po zmianie nazwy', { exact: true }).locator('xpath=../..')
  await sourceRow.getByRole('button', { name: 'Edytuj' }).click()
  await page.getByRole('radiogroup', { name: 'Miejsca i godziny' }).getByRole('radio', { name: 'Edycja' }).click()
  await page.getByRole('button', { name: 'Zapisz zestaw' }).click()
  await page.waitForFunction(() => window.__onecgTest.currentUserId())
  assert.equal(presets.get('9cg00000-0000-4000-8000-000000000003').version, '3', 'grant edit increments source preset from v2 to v3')
  assert.deepEqual(activeDto.custom_grants, savedMembershipGrants, 'preset v2 does not alter saved membership grants')
  assert.equal(activeDto.access_version, savedMembershipVersion, 'preset v2 does not increment membership access_version')
  assert.deepEqual(pendingDto.custom_grants, savedInvitationGrants, 'preset v2 does not alter saved invitation grants')
  assert.equal(pendingDto.configuration_revision, savedInvitationRevision, 'preset v2 does not increment invitation revision')
  sourceRow = page.getByText('Mieszany po zmianie nazwy', { exact: true }).locator('xpath=../..')
  await sourceRow.getByRole('button', { name: 'Archiwizuj' }).click()
  await page.getByRole('button', { name: 'Archiwizuj zestaw' }).click()
  assert.ok(presets.get('9cg00000-0000-4000-8000-000000000003').archived_at, 'source preset is archived')
  assert.deepEqual(activeDto.custom_grants, savedMembershipGrants, 'archiving source leaves saved membership grants unchanged')
  assert.equal(activeDto.access_version, savedMembershipVersion, 'archiving source leaves membership version unchanged')
  assert.deepEqual(pendingDto.custom_grants, savedInvitationGrants, 'archiving source leaves saved invitation grants unchanged')
  assert.equal(pendingDto.configuration_revision, savedInvitationRevision, 'archiving source leaves invitation revision unchanged')
  assert.deepEqual(configuredCall.input.p_custom_grants, mixedGrants, 'source edit/archive leaves configured invite snapshot unchanged')
  await page.getByRole('button', { name: 'Oczekujące' }).click()
  const pendingAfterArchive = page.getByRole('dialog')
  await pendingAfterArchive.getByText('Różne poziomy').waitFor()
  assert.equal(await pendingAfterArchive.getByRole('button', { name: /Mieszany po zmianie nazwy/ }).count(), 0,
    'archived source is no longer offered to the pending draft')
  await page.keyboard.press('Escape')
  await pendingAfterArchive.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Aktywne' }).click()
  const membershipAfterArchive = page.getByRole('dialog')
  await membershipAfterArchive.getByText('Różne poziomy').waitFor()
  assert.equal(await membershipAfterArchive.getByRole('button', { name: /Mieszany po zmianie nazwy/ }).count(), 0,
    'archived source is no longer offered to the accepted draft')

  for (const [width, height] of [[390, 844], [375, 812], [1440, 960]]) {
    await page.setViewportSize({ width, height })
    await assertNoOverflow(page, `${width}×${height}`)
  }
  assert.deepEqual(pageErrors, [], `browser has no uncaught page errors: ${pageErrors.join('; ')}`)
  console.log('collaboration_1c_g browser/mobile: PASS (settings, create/edit/duplicate/archive, pending/accepted/invite, 390×844, 375×812, desktop)')
} finally {
  await browser?.close().catch(() => {})
  if (vite && vite.exitCode === null) vite.kill('SIGTERM')
  await removeUser()
}
