import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const envPath = process.argv[2]
if (!envPath) throw new Error('Usage: node collaboration_1c_f_behavioral.mjs /private/tmp/.../local.env')
const env = Object.fromEntries(readFileSync(envPath, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#'))
  .map((line) => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1).replace(/^"|"$/g, '')] }))
const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = env
assert.ok(apiUrl && anonKey && serviceKey, 'local Supabase URL and keys are required')
const apiOrigin = new URL(apiUrl)
assert.equal(apiOrigin.hostname, '127.0.0.1', 'browser test must target loopback')
assert.ok(apiOrigin.port, 'browser test must target an explicit loopback port')
const email = `1cf-browser-${randomUUID()}@example.test`
const password = `LocalOnly-${randomUUID()}!`
const origin = 'http://127.0.0.1:4189'
const invitationId = '8cf00000-0000-4000-8000-000000000002'
const weddingId = '8cf00000-0000-4000-8000-000000000001'
const preview = [
  { capability_key: 'wedding.identity', level: 1 },
  { capability_key: 'places.address', level: 1 },
  { capability_key: 'schedule.operational_time', level: 1 },
]
const editor = [
  { capability_key: 'wedding.identity', level: 1 },
  { capability_key: 'places.address', level: 2 },
  { capability_key: 'schedule.operational_time', level: 2 },
]
let dto = { wedding_id: weddingId, invitation_id: invitationId, status: 'pending', invitee_display_name: 'Local collaborator',
  role_key: 'unspecified', custom_role_label: null, access_mode: 'viewer', access_configuration_version: 0,
  configuration_revision: '1', custom_grants: [], effective_preview: preview, viewer_preview: preview, editor_preview: editor,
  permission_group_mapping_version: '1' }
let nextUpdate = 'success'
let updateCalls = 0
let lastUpdate = null
let vite
let browser
let userId
async function api(path, { key = anonKey, token = key, method = 'GET', body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${token}`,
    ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  if (!response.ok) throw new Error(`local ${method} ${path} failed with HTTP ${response.status}`)
  return text ? JSON.parse(text) : null
}
async function removeUser() {
  if (!userId) return
  await fetch(`${apiUrl}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }).catch(() => {})
}
try {
  const signup = await api('/auth/v1/signup', { method: 'POST', body: { email, password, data: {
    first_name: 'Local', last_name: '1C-F Browser', profession: 'photographer', legal_registration_accepted: true,
    terms_version: '1.1', privacy_version: '1.1' } } })
  userId = signup.user?.id ?? signup.id
  assert.ok(userId, 'local disposable Auth user is created')
  vite = spawn('./node_modules/.bin/vite', ['--host', '127.0.0.1', '--port', '4189', '--strictPort'], {
    cwd: process.cwd(), env: { ...process.env, VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: anonKey }, stdio: ['ignore', 'ignore', 'pipe'] })
  let viteErrors = ''
  vite.stderr.setEncoding('utf8'); vite.stderr.on('data', (chunk) => { viteErrors += chunk })
  let ready = false
  for (let i = 0; i < 60; i++) {
    if (vite.exitCode !== null) throw new Error(`Vite exited: ${viteErrors}`)
    try { if ((await fetch(`${origin}/scripts/test/internal-qa-harness/collaboration_1c_f_behavioral.html`)).ok) { ready = true; break } } catch {}
    await delay(250)
  }
  assert.ok(ready, `local Vite server did not start: ${viteErrors}`)
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const pageErrors = []
  const calls = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.route(`${apiUrl}/rest/v1/rpc/**`, async (route) => {
    const req = route.request(); const name = req.url().split('/').pop(); const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (name === 'get_wedding_collaboration_invitation_access_management') return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(dto) })
    if (name === 'update_wedding_collaboration_invitation_access') {
      updateCalls++; lastUpdate = req.postDataJSON(); calls.push(name)
      if (nextUpdate === 'conflict') { nextUpdate = 'success'; return route.fulfill({ status: 400, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'P0001', message: 'CONFLICT', details: null, hint: null }) }) }
      if (nextUpdate === 'network') { nextUpdate = 'success'; return route.fulfill({ status: 503, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ message: 'local transient failure' }) }) }
      dto = { ...dto, role_key: lastUpdate.p_role_key, custom_role_label: lastUpdate.p_custom_role_label,
        access_mode: lastUpdate.p_access_mode, custom_grants: lastUpdate.p_custom_grants ?? [],
        configuration_revision: String(Number(dto.configuration_revision) + 1), access_configuration_version: 1 }
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ changed: true, configuration_revision: dto.configuration_revision, configuration: dto }) })
    }
    return route.fulfill({ status: 404, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ message: 'unexpected local RPC' }) })
  })
  await page.goto(`${origin}/scripts/test/internal-qa-harness/collaboration_1c_f_behavioral.html`)
  await page.waitForFunction(() => Boolean(window.__onecfTest))
  await page.evaluate(({ email, password }) => window.__onecfTest.login(email, password), { email, password })
  await page.getByRole('dialog').waitFor()
  await page.getByText('Zakres dostępu').waitFor()
  let passed = 0
  for (const [width, height, label] of [[390,844,'390×844'],[375,812,'375×812'],[1440,900,'desktop']]) {
    await page.setViewportSize({ width, height })
    const metrics = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, panel: document.querySelector('[role=dialog]').getBoundingClientRect().width,
      scrollHeight: document.querySelector('[role=dialog]').scrollHeight, clientHeight: document.querySelector('[role=dialog]').clientHeight,
      buttons: [...document.querySelectorAll('[role=radio]')].map((el) => el.getBoundingClientRect().height) }))
    assert.equal(metrics.doc, width, `${label} has no horizontal overflow`)
    assert.ok(metrics.panel <= width, `${label} sheet fits viewport width`)
    assert.ok(metrics.buttons.every((h) => h >= 44), `${label} segmented controls meet 44px touch size`)
    passed += 3
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('radio', { name: /Niestandardowe/ }).check()
  const identity = page.getByRole('radiogroup', { name: 'Podstawowe informacje' })
  assert.equal(await identity.getByRole('radio', { name: 'Edycja' }).count(), 0, 'identity row has no edit option')
  assert.equal(await identity.getByRole('radio', { name: 'Podgląd' }).getAttribute('aria-checked'), 'true', 'Custom draft begins with server Viewer defaults')
  const group = page.getByRole('radiogroup', { name: 'Miejsca i godziny' })
  await group.getByRole('radio', { name: 'Podgląd' }).focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await group.getByRole('radio', { name: 'Edycja' }).getAttribute('aria-checked'), 'true', 'arrow key changes the focused permission radio')
  await page.getByLabel('Rola przy tym zleceniu').selectOption('system:photographer')
  await page.getByRole('button', { name: 'Zapisz dostęp' }).click()
  await page.getByRole('button', { name: 'Open management' }).waitFor()
  assert.equal(updateCalls, 1, 'one Save makes exactly one configured management RPC')
  assert.equal(lastUpdate.p_expected_configuration_revision, '1', 'pending revisions stay decimal strings')
  assert.deepEqual(lastUpdate.p_custom_grants, [{ capability_key: 'places.address', level: 2 }, { capability_key: 'schedule.operational_time', level: 2 }, { capability_key: 'wedding.identity', level: 1 }])
  passed += 4
  await page.getByTestId('open-management').focus()
  await page.getByTestId('open-management').click()
  await page.getByRole('dialog').waitFor()
  await page.getByLabel('Rola przy tym zleceniu').selectOption('custom')
  await page.getByLabel('Nazwa roli').fill('Asystent zdjęć')
  await page.getByRole('dialog').getByRole('button', { name: 'Zamknij' }).click()
  await page.getByRole('heading', { name: 'Niezapisane zmiany' }).waitFor()
  await page.getByRole('button', { name: 'Wróć do edycji' }).click()
  assert.equal(await page.getByLabel('Nazwa roli').inputValue(), 'Asystent zdjęć', 'custom role input is usable and dirty-close retains its draft')
  await page.getByLabel('Rola przy tym zleceniu').selectOption('system:assistant')
  passed++
  passed++
  nextUpdate = 'conflict'
  await page.getByRole('button', { name: 'Zapisz dostęp' }).click()
  await page.getByText(/Dostęp zmienił się w międzyczasie/).waitFor()
  assert.equal(await page.getByLabel('Rola przy tym zleceniu').inputValue(), 'system:assistant', 'conflict keeps draft')
  await page.getByRole('button', { name: 'Użyj aktualnej wersji' }).click()
  passed += 2
  nextUpdate = 'network'
  await page.getByRole('button', { name: 'Zapisz dostęp' }).click()
  await page.getByText(/Twoje ustawienia pozostają w formularzu/).waitFor()
  assert.equal(await page.getByLabel('Rola przy tym zleceniu').inputValue(), 'system:assistant', 'network error keeps draft')
  passed++
  await page.getByRole('button', { name: 'Anuluj' }).click()
  await page.getByRole('button', { name: 'Odrzuć zmiany' }).click()
  await page.waitForFunction(() => document.activeElement?.dataset.testid === 'open-management')
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.testid), 'open-management',
    `closing management restores focus to its trigger (${await page.evaluate(() => document.activeElement?.outerHTML)})`)
  assert.deepEqual(pageErrors, [], 'browser reports no client errors')
  console.log(`PASS 1C-F actual React management-sheet browser tests (${passed} assertions; desktop, 390×844, 375×812; Custom default, grant expansion, dirty-close, conflict, network recovery)`)
} finally {
  await browser?.close().catch(() => {})
  if (vite && vite.exitCode === null) { vite.kill('SIGTERM'); await Promise.race([new Promise((resolve) => vite.once('exit', resolve)), delay(3000)]); if (vite.exitCode === null) vite.kill('SIGKILL') }
  await removeUser()
}
