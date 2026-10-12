import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const css = readFileSync(join(root, 'src/features/collaboration/WeddingCollaboration.module.css'), 'utf8')
const html = `<!doctype html>
<html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<style>*,*::before,*::after{box-sizing:border-box}html,body{min-height:100%;margin:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}${css}</style></head>
<body><main class="invitePage" data-testid="wedding-invitation-preview">
<p class="eyebrow">Współpraca przy zleceniu</p><h1 class="pageTitle">Zaproszenie do zlecenia</h1>
<header class="previewHeader"><h2 class="coupleNames">Aleksandra i Bartłomiej</h2><p class="muted">Zaprasza: Studio Fotograficzne Przykład</p></header>
<dl class="previewFacts">
<div class="previewFact"><dt>Data ślubu</dt><dd>12 czerwca 2027</dd></div>
<div class="previewFact"><dt>Pakiet</dt><dd>Klasyczny reportaż ślubny</dd></div>
<div class="previewFact"><dt>Wartość zlecenia · CV</dt><dd>12 500,00 zł</dd></div>
<div class="previewFact"><dt>Twoja proponowana kwota</dt><dd>3 000,00 zł</dd></div>
<div class="previewFact"><dt>Stan zaproszenia</dt><dd>Oczekuje na odpowiedź</dd></div>
</dl><div class="previewActions"><button class="primaryButton" data-testid="primary-action">Akceptuj</button><button class="quietButton">Odrzuć</button></div></main></body></html>`

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  for (const [width, height, label] of [
    [390, 844, '390×844'],
    [375, 812, '375×812'],
    [393, 852, '393×852'],
    [1440, 960, 'desktop'],
  ]) {
    await page.setViewportSize({ width, height })
    await page.setContent(html, { waitUntil: 'load' })
    await page.getByTestId('primary-action').scrollIntoViewIfNeeded()
    const metrics = await page.evaluate(() => {
      const rootElement = document.documentElement
      const main = document.querySelector('[data-testid="wedding-invitation-preview"]')
      const action = document.querySelector('[data-testid="primary-action"]')
      const actionRect = action.getBoundingClientRect()
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentWidth: rootElement.scrollWidth,
        mainWidth: main.getBoundingClientRect().width,
        mainMaxHeight: getComputedStyle(main).maxHeight,
        mainOverflowY: getComputedStyle(main).overflowY,
        actionHeight: actionRect.height,
        actionBottom: actionRect.bottom,
        actionTop: actionRect.top,
      }
    })
    assert.equal(metrics.documentWidth, width, `${label} has no horizontal overflow`)
    assert.ok(metrics.mainWidth <= width, `${label} invitation fits the viewport width`)
    assert.equal(metrics.mainOverflowY, 'auto', `${label} invitation supports internal scrolling`)
    assert.ok(metrics.actionHeight >= 44, `${label} primary action meets the touch target minimum`)
    assert.ok(metrics.actionTop >= 0 && metrics.actionBottom <= height, `${label} primary action is reachable`)
    if (width < 600) assert.notEqual(metrics.mainMaxHeight, 'none', `${label} uses a dynamic viewport height cap`)
  }
} finally {
  await browser.close()
}
console.log('PASS collaboration 1C-B viewport matrix: 390×844, 375×812, 393×852, desktop (24 assertions)')
