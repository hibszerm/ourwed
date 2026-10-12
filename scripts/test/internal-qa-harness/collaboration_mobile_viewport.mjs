import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const port = 5189
const baseUrl = `http://127.0.0.1:${port}`
const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  stdio: 'ignore',
})

async function waitForVite() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Vite fixture server exited (${server.exitCode})`)
    try {
      const response = await fetch(`${baseUrl}/scripts/test/internal-qa-harness/collaboration_modal_fixture.html`)
      if (response.ok) return
    } catch {
      // The local fixture server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Vite fixture server did not become ready')
}

await waitForVite()
const browser = await chromium.launch({ headless: true })
try {
  for (const viewport of [
    { width: 390, height: 844, name: '390x844' },
    { width: 375, height: 812, name: '375x812' },
    { width: 393, height: 852, name: '393x852' },
    { width: 1440, height: 900, name: 'desktop' },
  ]) {
    const page = await browser.newPage({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 })
    await page.goto(`${baseUrl}/scripts/test/internal-qa-harness/collaboration_modal_fixture.html`)
    await page.getByRole('heading', { name: 'Zaproszenia do współpracy' }).waitFor()
    assert.ok(await page.getByRole('region', { name: 'Zaproszenia przychodzące' }).isVisible(), `${viewport.name}: populated incoming state is visible`)
    assert.ok(await page.getByRole('region', { name: 'Zaproszenia wychodzące' }).isVisible(), `${viewport.name}: populated outgoing state is visible`)
    assert.ok(await page.getByRole('region', { name: 'Aktywni współpracownicy' }).isVisible(), `${viewport.name}: populated active state is visible`)

    await page.getByRole('button', { name: 'Dodaj współpracownika' }).click()
    const inviteDialog = page.getByRole('dialog', { name: 'Dodaj współpracownika' })
    await inviteDialog.waitFor()
    assert.ok((await inviteDialog.evaluate((el) => el.getBoundingClientRect().bottom)) <= viewport.height + 1, `${viewport.name}: invite sheet stays inside viewport`)
    const close = inviteDialog.getByRole('button', { name: 'Zamknij' })
    assert.ok(await close.isVisible(), `${viewport.name}: close control is visible`)
    if (viewport.width < 600) {
      assert.ok(await close.evaluate((el) => el.getBoundingClientRect().height >= 44), `${viewport.name}: close control meets a 44px tap target`)
    }
    const input = inviteDialog.getByLabel('Adres e-mail')
    await input.scrollIntoViewIfNeeded()
    await input.focus()
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'collaboration-email', `${viewport.name}: invite input receives keyboard focus`)
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Anuluj', `${viewport.name}: cancel action is keyboard reachable`)
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Wyślij zaproszenie', `${viewport.name}: invite action is keyboard reachable`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width, `${viewport.name}: no horizontal viewport overflow`)
    await close.click()

    await page.getByRole('region', { name: 'Aktywni współpracownicy' }).getByRole('button', { name: 'Zakończ współpracę' }).click()
    const endDialog = page.getByRole('dialog', { name: 'Zakończyć współpracę?' })
    await endDialog.waitFor()
    assert.ok((await endDialog.evaluate((el) => el.getBoundingClientRect().bottom)) <= viewport.height + 1, `${viewport.name}: end confirmation stays inside viewport`)
    const endAction = endDialog.getByRole('button', { name: 'Zakończ współpracę' })
    assert.ok(await endAction.isVisible(), `${viewport.name}: end confirmation action is visible`)
    assert.ok(await endDialog.getByRole('button', { name: 'Anuluj' }).isVisible(), `${viewport.name}: cancel action is visible`)
    if (viewport.width < 600) {
      const targetHeight = await endAction.evaluate((el) => el.getBoundingClientRect().height)
      assert.ok(targetHeight >= 44, `${viewport.name}: end action meets a 44px tap target (measured ${targetHeight}px)`)
    }
    await endDialog.getByRole('button', { name: 'Anuluj' }).focus()
    for (let tab = 0; tab < 5; tab += 1) {
      if (await endAction.evaluate((el) => el === document.activeElement)) break
      await page.keyboard.press('Tab')
    }
    assert.ok(await endAction.evaluate((el) => el === document.activeElement), `${viewport.name}: end confirmation action is keyboard reachable`)
    await page.close()
    console.log(`PASS rendered Collaboration Modal ${viewport.name}`)
  }
} finally {
  await browser.close()
  server.kill('SIGTERM')
}
