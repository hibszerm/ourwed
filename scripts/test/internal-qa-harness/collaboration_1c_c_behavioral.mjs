import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const envPath = process.argv[2]
if (!envPath) throw new Error('Usage: node collaboration_1c_c_behavioral.mjs /private/tmp/.../local.env')
const env = Object.fromEntries(readFileSync(envPath, 'utf8').split(/\r?\n/)
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const split = line.indexOf('=')
    return [line.slice(0, split), line.slice(split + 1).replace(/^"|"$/g, '')]
  }))
const apiUrl = env.API_URL
const anonKey = env.ANON_KEY
const serviceKey = env.SERVICE_ROLE_KEY
assert.ok(apiUrl && anonKey && serviceKey, 'local Supabase URL and keys are required')
const apiOrigin = new URL(apiUrl)
assert.equal(apiOrigin.hostname, '127.0.0.1', 'behavior tests must target loopback')
assert.ok(apiOrigin.port, 'behavior tests must target an explicit loopback port')

async function api(path, { key = anonKey, token, method = 'GET', body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`local ${method} ${path} failed with HTTP ${response.status}`)
  return text ? JSON.parse(text) : null
}

async function createUser(label) {
  const email = `collaboration-1c-c-browser-${label}-${randomUUID()}@example.test`
  const password = `LocalOnly-${randomUUID()}!`
  const result = await api('/auth/v1/signup', {
    method: 'POST',
    body: {
      email,
      password,
      data: {
        first_name: 'Local',
        last_name: label,
        legal_registration_accepted: true,
        terms_version: '1.1',
        privacy_version: '1.1',
      },
    },
  })
  assert.ok(result.user?.id, 'local signup creates an Auth user')
  return { id: result.user.id, email, password }
}

async function removeUser(user) {
  if (!user?.id) return
  await api(`/auth/v1/admin/users/${user.id}`, { key: serviceKey, method: 'DELETE' })
}

const weddingId = 'a1000000-0000-4000-8000-000000000001'
const collaborativeDto = {
  wedding_id: weddingId,
  couple_first_name: 'Ada',
  couple_second_name: 'Member',
  wedding_date: '2027-06-01',
  places: [{ role: 'ceremony', formatted_address: 'Local synthetic ceremony address', operational_time: '09:05' }],
}
let ceremonyAddress = 'Local synthetic ceremony address'
let ceremonyAddressVersion = '1'
let ceremonyTimeOverride = '09:05'
let ceremonyTimeVersion = '1'
let forceAddressConflict = true
let paginationPages = null
let freshPaginationPages = null
let paginationTargetId = null
let paginationTargetName = 'Full'

function makePaginationPage(start, count, { targetId = null, targetName = null } = {}) {
  return Array.from({ length: count }, (_, offset) => {
    const number = start + offset
    const weddingId = `b2000000-0000-4000-8000-${String(number).padStart(12, '0')}`
    const target = weddingId === targetId
    const weddingDate = new Date(Date.UTC(2027, 0, number)).toISOString().slice(0, 10)
    return {
      wedding_id: weddingId,
      couple_first_name: target ? targetName : `Page ${Math.ceil(number / 50)}`,
      couple_second_name: target ? 'Target' : `Row ${number}`,
      wedding_date: weddingDate,
    }
  })
}

let users = []
let vite
let browser
let releaseHeldDetail
let heldDetailStarted
let holdNextDetail = false
let accessAvailable = true
let failNextDetail = false
let failNextEditState = false
let passed = 0
const pageErrors = []
const port = 4187
const origin = `http://127.0.0.1:${port}`

try {
  users = await Promise.all(['owner-a', 'member-b', 'member-c'].map(createUser))
  vite = spawn('./node_modules/.bin/vite', [
    '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], {
    cwd: process.cwd(),
    env: { ...process.env, VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: anonKey },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let viteErrors = ''
  vite.stderr.setEncoding('utf8')
  vite.stderr.on('data', (chunk) => { viteErrors += chunk })
  let serverReady = false
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (vite.exitCode !== null) throw new Error(`local Vite test server exited early: ${viteErrors}`)
    try {
      const response = await fetch(`${origin}/scripts/test/internal-qa-harness/collaboration_1c_c_behavioral.html`)
      if (response.ok) { serverReady = true; break }
    } catch {}
    await delay(250)
  }
  assert.ok(serverReady, `local Vite test server did not start: ${viteErrors}`)

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('requestfailed', (request) => {
    if (request.url().includes('/rest/v1/rpc/')) pageErrors.push(`rpc_request_failed:${request.failure()?.errorText}`)
  })

  const startHeldDetail = () => new Promise((resolve) => { heldDetailStarted = resolve })
  await page.route(`${apiUrl}/rest/v1/rpc/**`, async (route) => {
    const request = route.request()
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
    }
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors })
      return
    }
    const name = new URL(request.url()).pathname.split('/').at(-1)
    const bearer = request.headers().authorization?.replace(/^Bearer\s+/i, '') ?? ''
    let actorId = ''
    try { actorId = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString('utf8')).sub ?? '' } catch {}
    if (name === 'get_collaborative_wedding_operational_edit_state') {
      if (failNextEditState) {
        failNextEditState = false
        await route.fulfill({ status: 503, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'XX000', message: 'temporary backend failure' }) })
        return
      }
      if (actorId !== users[1].id || !accessAvailable) {
        await route.fulfill({ status: 400, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'P0001', message: 'UNAVAILABLE' }) })
        return
      }
      const roles = ['bride_preparation', 'groom_preparation', 'ceremony', 'reception']
      const places = roles.map((role) => ({
        role,
        formatted_address: role === 'ceremony' ? ceremonyAddress : '',
        address_version: role === 'ceremony' ? ceremonyAddressVersion : null,
        operational_time_override: role === 'ceremony' ? ceremonyTimeOverride : null,
        effective_operational_time: role === 'ceremony' ? (ceremonyTimeOverride ?? '15:30') : null,
        time_source: role === 'ceremony' ? (ceremonyTimeOverride === null ? 'ceremony_fallback' : 'override') : 'none',
        time_version: role === 'ceremony' ? ceremonyTimeVersion : null,
      }))
      const requestedWeddingId = request.postDataJSON().p_wedding_id
      await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ wedding_id: requestedWeddingId, places }) })
      return
    }
    if (name === 'update_collaborative_wedding_place') {
      const body = request.postDataJSON()
      if (actorId !== users[1].id || !accessAvailable) {
        await route.fulfill({ status: 400, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'P0001', message: 'UNAVAILABLE' }) })
        return
      }
      if (forceAddressConflict) {
        forceAddressConflict = false
        ceremonyAddress = 'Server latest'
        ceremonyAddressVersion = '2'
        await route.fulfill({ status: 400, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'P0001', message: 'CONFLICT' }) })
        return
      }
      if (body.p_expected_version !== ceremonyAddressVersion) {
        await route.fulfill({ status: 400, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'P0001', message: 'CONFLICT' }) })
        return
      }
      ceremonyAddress = body.p_formatted_address
      ceremonyAddressVersion = String(BigInt(ceremonyAddressVersion) + 1n)
      await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ wedding_id: weddingId, role: 'ceremony', formatted_address: ceremonyAddress, address_version: ceremonyAddressVersion, changed: true }) })
      return
    }
    if (name === 'update_collaborative_operational_time') {
      const body = request.postDataJSON()
      if (actorId !== users[1].id || !accessAvailable) {
        await route.fulfill({ status: 400, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'P0001', message: 'UNAVAILABLE' }) })
        return
      }
      if (body.p_expected_version !== ceremonyTimeVersion) {
        await route.fulfill({ status: 400, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'P0001', message: 'CONFLICT' }) })
        return
      }
      ceremonyTimeOverride = body.p_operational_time
      ceremonyTimeVersion = String(BigInt(ceremonyTimeVersion) + 1n)
      await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({
        wedding_id: weddingId,
        role: 'ceremony',
        operational_time_override: ceremonyTimeOverride,
        effective_operational_time: ceremonyTimeOverride ?? '15:30',
        time_source: ceremonyTimeOverride === null ? 'ceremony_fallback' : 'override',
        time_version: ceremonyTimeVersion,
        changed: true,
      }) })
      return
    }
    if (name === 'list_my_collaborative_weddings') {
      let rows = []
      if (actorId === users[1].id && (accessAvailable || freshPaginationPages)) {
        const pages = paginationPages
          ? (accessAvailable ? paginationPages : freshPaginationPages ?? paginationPages)
          : [[{ wedding_id: weddingId, couple_first_name: 'Ada', couple_second_name: 'Member', wedding_date: '2027-06-01' }]]
        const requestBody = request.postDataJSON()
        const cursorId = requestBody.p_after_wedding_id
        if (!cursorId) {
          rows = pages[0] ?? []
        } else {
          const pageIndex = pages.findIndex((items) => items.some((item) => item.wedding_id === cursorId))
          rows = pageIndex >= 0 ? pages[pageIndex + 1] ?? [] : []
        }
      }
      await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(rows) })
      return
    }
    if (name === 'get_collaborative_wedding_detail') {
      if (holdNextDetail) {
        holdNextDetail = false
        heldDetailStarted?.()
        await new Promise((resolve) => { releaseHeldDetail = resolve })
      }
      if (failNextDetail) {
        failNextDetail = false
        await route.fulfill({ status: 503, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'XX000', message: 'temporary backend failure' }) })
        return
      }
      const requestBody = request.postDataJSON()
      const requestedWeddingId = requestBody.p_wedding_id
      const value = actorId === users[1].id && accessAvailable
        ? requestedWeddingId === paginationTargetId
          ? { ...collaborativeDto, wedding_id: paginationTargetId, couple_first_name: paginationTargetName, couple_second_name: 'Target' }
          : { ...collaborativeDto, places: [{ ...collaborativeDto.places[0], formatted_address: ceremonyAddress, operational_time: ceremonyTimeOverride ?? '15:30' }] }
        : null
      await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(value) })
      return
    }
    await route.fulfill({ status: 404, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' })
  })

  await page.goto(`${origin}/scripts/test/internal-qa-harness/collaboration_1c_c_behavioral.html`)
  await page.waitForFunction(() => Boolean(window.__collabTest))
  async function login(index) {
    const user = users[index]
    await page.evaluate(({ email, password }) => window.__collabTest.login(email, password), user)
    await page.getByTestId('auth-user-id').waitFor({ state: 'visible' })
    await page.waitForFunction((id) => window.__collabTest.currentUserId() === id, user.id)
    passed += 1
  }
  async function logout() {
    await page.evaluate(() => window.__collabTest.logout())
    await page.waitForFunction(() => window.__collabTest.currentUserId() === null)
    passed += 1
  }

  await login(1)
  await page.getByRole('link', { name: 'Open collaboration' }).click()
  await page.getByRole('link', { name: /Ada i Member/ }).waitFor()
  failNextDetail = true
  await page.getByRole('link', { name: /Ada i Member/ }).click()
  await page.getByText('Nie udało się odświeżyć danych. Spróbuj ponownie.').waitFor()
  assert.match(page.url(), new RegExp(`${weddingId}$`), 'initial detail server failure keeps the route')
  assert.equal(await page.getByRole('heading', { name: 'Ada i Member' }).count(), 0, 'initial failure does not invent or render a private detail')
  const initialFailureCache = await page.evaluate((id) => window.__collabTest.cacheSnapshot(id), users[1].id)
  assert.equal(initialFailureCache.collaborativeListPresent, true, 'initial failure keeps the current-user list cache')
  assert.equal(await page.getByText('Dostęp do tego zlecenia został zakończony.').count(), 0, 'transient failure does not claim access ended')
  passed += 4
  await page.getByRole('button', { name: 'Spróbuj ponownie' }).click()
  await page.getByRole('heading', { name: 'Ada i Member' }).waitFor()
  assert.match(page.url(), new RegExp(`${weddingId}$`))
  const initialCache = await page.evaluate((id) => window.__collabTest.cacheSnapshot(id), users[1].id)
  assert.equal(initialCache.collaborativeDetail?.wedding_id, weddingId, 'initial detail is in the real collaboration detail query cache')
  assert.equal(initialCache.collaborativeListHasWedding, true, 'initial list cache contains the wedding')
  assert.equal(await page.getByText('Local synthetic ceremony address').count(), 1, 'detail renders the collaborative projection')
  passed += 3

  failNextEditState = true
  await page.evaluate((id) => window.__collabTest.refetchEditState(id), weddingId)
  await page.getByText('Nie udało się odświeżyć danych edycji. Spróbuj ponownie.').waitFor()
  assert.match(page.url(), new RegExp(`${weddingId}$`), 'edit-state server failure keeps the detail route')
  assert.equal(await page.getByRole('heading', { name: 'Ada i Member' }).count(), 1, 'edit-state failure keeps successful detail visible')
  assert.equal((await page.evaluate((id) => window.__collabTest.cacheSnapshot(id), users[1].id)).collaborativeEditStatePresent, true,
    'edit-state failure does not purge the cached edit-state')
  passed += 3
  await page.getByRole('button', { name: 'Ponów odświeżanie' }).click()
  await page.getByText('Nie udało się odświeżyć danych edycji. Spróbuj ponownie.').waitFor({ state: 'detached' })

  const ceremonyCard = page.getByTestId('collaborative-place-ceremony')
  await ceremonyCard.getByRole('button', { name: 'Edytuj adres' }).click()
  const addressInput = page.getByTestId('collaborative-address-input')
  await addressInput.fill('My preserved draft')
  failNextDetail = true
  await page.evaluate((id) => window.__collabTest.refetchDetail(id), weddingId)
  await page.getByText('Nie udało się odświeżyć danych. Spróbuj ponownie.').waitFor()
  assert.match(page.url(), new RegExp(`${weddingId}$`), 'background detail failure keeps the route')
  assert.equal(await page.getByTestId('collaborative-address-input').inputValue(), 'My preserved draft',
    'background detail failure preserves the open address draft')
  assert.equal(await page.getByRole('dialog').count(), 1, 'editor is mounted after a transient background failure')
  const transientCache = await page.evaluate((id) => window.__collabTest.cacheSnapshot(id), users[1].id)
  assert.equal(transientCache.collaborativeDetail?.wedding_id, weddingId, 'background failure retains detail cache')
  assert.equal(transientCache.collaborativeListPresent, true, 'background failure retains list cache')
  assert.equal(transientCache.collaborativeEditStatePresent, true, 'background failure retains edit-state cache')
  assert.equal(await page.getByText('Dostęp do tego zlecenia został zakończony.').count(), 0,
    'background failure is never presented as ended access')
  passed += 7
  await page.getByRole('button', { name: 'Zapisz' }).click()
  await page.getByText(/Aktualna wartość na serwerze: Server latest/).waitFor()
  assert.equal(await addressInput.inputValue(), 'My preserved draft', 'version conflict preserves the local address draft')
  await page.getByRole('button', { name: 'Zapisz' }).click()
  await page.getByTestId('collaborative-address-input').waitFor({ state: 'detached' })
  await page.getByText('My preserved draft').waitFor()
  passed += 2

  await ceremonyCard.getByRole('button', { name: 'Edytuj godzinę' }).click()
  const timeInput = page.getByTestId('collaborative-time-input')
  await timeInput.fill('10:30')
  await page.getByRole('button', { name: 'Zapisz' }).click()
  await page.getByText('Godzina: 10:30').waitFor()
  passed += 1
  await ceremonyCard.getByRole('button', { name: 'Edytuj godzinę' }).click()
  await page.getByRole('button', { name: 'Usuń godzinę' }).click()
  await page.getByText('Godzina: 15:30 (ustawienie ślubu)').waitFor()
  passed += 1

  await ceremonyCard.getByRole('button', { name: 'Edytuj adres' }).click()
  await page.getByTestId('collaborative-address-input').waitFor()
  for (const [width, height, label] of [
    [390, 844, '390×844'], [375, 812, '375×812'], [393, 852, '393×852'], [1440, 960, 'desktop'],
  ]) {
    await page.setViewportSize({ width, height })
    const editorLayout = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')
      const input = document.querySelector('[data-testid="collaborative-address-input"]')
      const save = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Zapisz')
      if (!dialog || !input || !save) return null
      const rect = dialog.getBoundingClientRect()
      const saveRect = save.getBoundingClientRect()
      return {
        documentWidth: document.documentElement.scrollWidth,
        dialogLeft: rect.left,
        dialogRight: rect.right,
        dialogBottom: rect.bottom,
        saveBottom: saveRect.bottom,
      }
    })
    assert.ok(editorLayout, `${label} address editor is mounted`)
    assert.equal(editorLayout.documentWidth, width, `${label} editor has no horizontal page overflow`)
    assert.ok(editorLayout.dialogLeft >= 0 && editorLayout.dialogRight <= width, `${label} editor fits horizontally`)
    assert.ok(editorLayout.dialogBottom <= height && editorLayout.saveBottom <= height, `${label} editor and save action fit vertically`)
    passed += 4
  }
  await page.getByRole('button', { name: 'Anuluj' }).click()

  for (const [width, height, label] of [
    [390, 844, '390×844'], [375, 812, '375×812'], [393, 852, '393×852'], [1440, 960, 'desktop'],
  ]) {
    await page.setViewportSize({ width, height })
    const layout = await page.evaluate(() => {
      const pageElement = document.querySelector('[data-testid="collaborative-wedding-detail"]')
      const address = document.querySelector('[aria-labelledby="collaborative-wedding-places"] li p')
      return {
        documentWidth: document.documentElement.scrollWidth,
        mainWidth: pageElement.getBoundingClientRect().width,
        addressScrollWidth: address.scrollWidth,
        addressClientWidth: address.clientWidth,
      }
    })
    assert.equal(layout.documentWidth, width, `${label} actual React page has no horizontal overflow`)
    assert.ok(layout.mainWidth <= width, `${label} actual React page fits viewport width`)
    assert.ok(layout.addressScrollWidth <= layout.addressClientWidth, `${label} actual React address wraps`)
    passed += 3
  }

  await ceremonyCard.getByRole('button', { name: 'Edytuj adres' }).click()
  await page.getByTestId('collaborative-address-input').fill('Draft before authoritative mutation denial')
  accessAvailable = false
  await page.getByRole('button', { name: 'Zapisz' }).click()
  await page.waitForFunction(() => window.location.hash === '#/wspolpraca/sluby')
  await page.getByText('Dostęp do tego zlecenia został zakończony.').waitFor()
  assert.equal((await page.evaluate((id) => window.__collabTest.cacheSnapshot(id), users[1].id)).collaborativeDetailPresent, false,
    'mutation UNAVAILABLE still removes the exact detail cache')
  assert.ok(await page.evaluate((id) => window.__collabTest.wasCollaborativeListRemoved(id), users[1].id),
    'mutation UNAVAILABLE still removes the current-user list')
  passed += 2
  accessAvailable = true

  const fullPageInitialTarget = 'b2000000-0000-4000-8000-000000000062'
  paginationTargetId = fullPageInitialTarget
  paginationPages = [makePaginationPage(1, 50), makePaginationPage(51, 50, { targetId: fullPageInitialTarget, targetName: 'Full' })]
  const freshFullPages = [
    makePaginationPage(1, 50),
    [...makePaginationPage(51, 50).filter((item) => item.wedding_id !== fullPageInitialTarget), ...makePaginationPage(101, 1)],
    makePaginationPage(102, 1),
  ]
  freshPaginationPages = freshFullPages
  await page.goto(`${origin}/scripts/test/internal-qa-harness/collaboration_1c_c_behavioral.html#/`)
  await page.getByRole('link', { name: 'Open collaboration' }).waitFor()
  await page.getByRole('link', { name: 'Open collaboration' }).click()
  await page.getByRole('link', { name: /^Page 1 i Row 1 / }).waitFor()
  await page.getByRole('button', { name: 'Pokaż kolejne' }).click()
  await page.getByRole('link', { name: 'Full i Target' }).waitFor()
  const loadedPageLengths = await page.evaluate((id) => window.__collabTest.cacheSnapshot(id).collaborativeListPageLengths, users[1].id)
  assert.deepEqual(loadedPageLengths, [50, 50], 'pagination regression setup loads two full non-final pages')
  passed += 1
  await page.getByRole('link', { name: 'Full i Target' }).click()
  await page.getByRole('heading', { name: 'Full i Target' }).waitFor()
  await page.evaluate((ids) => window.__collabTest.seedAccessLossIsolation(ids[0], ids[1]), [users[1].id, users[2].id])

  let detailStartedResolve
  const detailStarted = new Promise((resolve) => { detailStartedResolve = resolve })
  heldDetailStarted = detailStartedResolve
  accessAvailable = false
  holdNextDetail = true
  const revalidation = page.evaluate((id) => window.__collabTest.refetchDetail(id), fullPageInitialTarget)
  await detailStarted
  await page.getByText('Sprawdzanie dostępu do zlecenia…').waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Full i Target' }).count(), 0,
    'stale private detail is masked while server authorization is revalidated')
  passed += 2
  releaseHeldDetail()
  await revalidation
  await page.waitForFunction(() => window.location.hash === '#/wspolpraca/sluby')
  await page.getByText('Dostęp do tego zlecenia został zakończony.').waitFor()
  const clearedCache = await page.evaluate((ids) => window.__collabTest.cacheSnapshot(ids[0], ids[1]), [users[1].id, fullPageInitialTarget])
  assert.equal(clearedCache.collaborativeDetail, undefined, 'unavailable response removes exact collaborative detail cache')
  assert.ok(await page.evaluate((id) => window.__collabTest.wasCollaborativeListRemoved(id), users[1].id),
    'access loss removes the entire current-user collaboration list query')
  assert.ok(clearedCache.collaborativeListPresent, 'list route creates a fresh query after the previous list query was removed')
  assert.deepEqual(clearedCache.collaborativeListPageLengths, [50], 'fresh server-authoritative list begins at page one')
  assert.equal(clearedCache.collaborativeListHasWedding, false, 'fresh list excludes the wedding whose access ended')
  assert.equal(clearedCache.ownerWedding.brideName, 'Owner cache survives targeted access loss',
    'targeted collaboration access loss leaves owner wedding cache untouched')
  assert.equal(await page.evaluate((id) => window.__collabTest.otherIdentityListPresent(id), users[2].id), true,
    'targeted access loss leaves another identity collaboration list untouched')
  passed += 5
  assert.equal(await page.getByRole('heading', { name: 'Full i Target' }).count(), 0, 'generic ended state contains no stale couple detail')
  await page.getByRole('button', { name: 'Pokaż kolejne' }).click()
  await page.getByRole('link', { name: /Page 2 i Row 51/ }).waitFor()
  await page.getByRole('button', { name: 'Pokaż kolejne' }).click()
  await page.getByRole('link', { name: /Page 3 i Row 102/ }).waitFor()
  const fullScenarioPageLengths = await page.evaluate((id) => window.__collabTest.cacheSnapshot(id).collaborativeListPageLengths, users[1].id)
  assert.deepEqual(fullScenarioPageLengths, [50, 50, 1], 'later server page remains reachable after revocation from a full non-final page')
  assert.equal(await page.getByRole('link', { name: 'Full i Target' }).count(), 0, 'revoked wedding is absent after fresh pagination')
  passed += 3
  await page.goBack()
  await page.waitForFunction((id) => !window.location.hash.includes(id), fullPageInitialTarget)
  assert.ok(!page.url().includes(fullPageInitialTarget), 'browser back cannot restore the replaced stale detail route')
  passed += 5

  // A short fresh final page still terminates pagination without a synthetic extra cursor.
  paginationTargetId = 'b2000000-0000-4000-8000-000000000053'
  paginationTargetName = 'Final'
  paginationPages = [makePaginationPage(1, 50), makePaginationPage(51, 20, { targetId: paginationTargetId, targetName: 'Final' })]
  freshPaginationPages = [makePaginationPage(1, 50), makePaginationPage(51, 19)]
  accessAvailable = true
  await page.reload()
  await page.waitForFunction((id) => window.__collabTest.currentUserId() === id, users[1].id)
  await page.goto(`${origin}/scripts/test/internal-qa-harness/collaboration_1c_c_behavioral.html#/wspolpraca/sluby`)
  await page.getByRole('link', { name: /^Page 1 i Row 1 / }).waitFor()
  await page.getByRole('button', { name: 'Pokaż kolejne' }).click()
  await page.getByRole('link', { name: 'Final i Target' }).waitFor()
  await page.getByRole('link', { name: 'Final i Target' }).click()
  await page.getByRole('heading', { name: 'Final i Target' }).waitFor()
  accessAvailable = false
  await page.evaluate((id) => window.__collabTest.refetchDetail(id), paginationTargetId)
  await page.waitForFunction(() => window.location.hash === '#/wspolpraca/sluby')
  await page.getByRole('button', { name: 'Pokaż kolejne' }).click()
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="collaborative-wedding-list"] li').length === 69)
  assert.equal(await page.getByRole('button', { name: 'Pokaż kolejne' }).count(), 0,
    'fresh short final page ends pagination without looping')
  const finalPageLengths = await page.evaluate((id) => window.__collabTest.cacheSnapshot(id).collaborativeListPageLengths, users[1].id)
  assert.deepEqual(finalPageLengths, [50, 19], 'final-page regression uses fresh 50-row and 19-row server pages')
  passed += 2

  accessAvailable = true
  await login(0)
  await page.evaluate((id) => window.__collabTest.seedPrivateCaches(id), users[0].id)
  const ownerCacheBefore = await page.evaluate((id) => window.__collabTest.cacheSnapshot(id), users[0].id)
  assert.equal(ownerCacheBefore.ownerWedding.phone, 'OWNER_PRIVATE_PHONE_SENTINEL')
  assert.ok(ownerCacheBefore.collaborativeDetail && ownerCacheBefore.collaborativeListHasWedding)
  assert.ok(ownerCacheBefore.mutationCount > 0)
  passed += 1

  await logout()
  await login(1)
  const ownerCacheAfter = await page.evaluate((id) => window.__collabTest.cacheSnapshot(id), users[0].id)
  assert.equal(ownerCacheAfter.collaborativeDetail, undefined)
  assert.equal(ownerCacheAfter.ownerWedding, undefined, 'owner Wedding detail cache is cleared before member identity renders')
  assert.equal(ownerCacheAfter.ownerWeddingList, undefined)
  assert.equal(ownerCacheAfter.mutationCount, 0, 'tenant mutation cache is cleared on identity change')
  const memberWorkspaceSnapshot = await page.evaluate((id) => window.__collabTest.cacheSnapshot(id), users[1].id)
  assert.equal(memberWorkspaceSnapshot.ownerWedding, undefined, 'owner full Wedding never enters member cache')
  passed += 5

  await page.evaluate((id) => window.__collabTest.seedPrivateCaches(id), users[1].id)
  await logout()
  await login(0)
  const memberCacheAfterOwnerLogin = await page.evaluate((id) => window.__collabTest.cacheSnapshot(id), users[1].id)
  assert.equal(memberCacheAfterOwnerLogin.collaborativeDetail, undefined, 'member DTO is cleared before owner identity renders')
  assert.equal(memberCacheAfterOwnerLogin.collaborativeListHasWedding, false)
  assert.equal(memberCacheAfterOwnerLogin.mutationCount, 0)
  passed += 3

  await login(1)
  await page.evaluate((id) => window.__collabTest.seedPrivateCaches(id), users[1].id)
  await login(2)
  const memberCacheAfterMemberSwitch = await page.evaluate((id) => window.__collabTest.cacheSnapshot(id), users[1].id)
  assert.equal(memberCacheAfterMemberSwitch.collaborativeDetail, undefined, 'member B DTO is cleared before member C renders')
  assert.equal(memberCacheAfterMemberSwitch.collaborativeListHasWedding, false)
  assert.equal(memberCacheAfterMemberSwitch.mutationCount, 0)
  await page.goto(`${origin}/scripts/test/internal-qa-harness/collaboration_1c_c_behavioral.html#/wspolpraca/sluby/${weddingId}`)
  await page.waitForFunction(() => window.location.hash === '#/wspolpraca/sluby')
  assert.equal(await page.getByRole('heading', { name: 'Ada i Member' }).count(), 0,
    'member C cannot render member B collaborative DTO')
  assert.equal(await page.getByText('OWNER_PRIVATE_PHONE_SENTINEL').count(), 0,
    'owner full Wedding values cannot render in collaborator detail')
  passed += 5

  assert.deepEqual(pageErrors, [], 'browser reported no app or collaboration RPC errors')
  console.log(`PASS 1C-C/1C-D behavioral frontend tests (${passed} assertions; real AuthProvider, hooks, QueryClient, routes, React pages, command conflicts, and operational editors)`)
  console.log('PASS actual React collaboration detail and operational-editor viewport matrix: 390×844, 375×812, 393×852, desktop')
} finally {
  releaseHeldDetail?.()
  await browser?.close().catch(() => {})
  if (vite && vite.exitCode === null) {
    vite.kill('SIGTERM')
    await Promise.race([new Promise((resolve) => vite.once('exit', resolve)), delay(3000)])
    if (vite.exitCode === null) vite.kill('SIGKILL')
  }
  for (const user of users.reverse()) await removeUser(user).catch(() => {})
}
