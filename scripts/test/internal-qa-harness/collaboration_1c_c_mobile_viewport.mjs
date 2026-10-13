import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const css = readFileSync(join(root, 'src/features/collaboration/CollaborativeWeddingPages.module.css'), 'utf8')
const html = `<!doctype html><html lang="pl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<style>*,*::before,*::after{box-sizing:border-box}html,body{min-height:100%;margin:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}${css}</style>
</head><body><main class="page" data-testid="collaborative-detail">
<a class="backLink" href="#">Wszystkie wspólne zlecenia</a><p class="eyebrow">Wspólne zlecenie</p>
<h1>Aleksandra i Bartłomiej z bardzo długą nazwą do zawijania</h1>
<section class="section"><h2>Data ślubu</h2><p>12 czerwca 2027</p></section>
<section class="section"><h2>Miejsca i godziny</h2><ul class="places">
<li><h3>Przygotowania panny młodej</h3><p>Ulica o bardzo długiej nazwie 124, lokal 18B, 00-999 Warszawa, dodatkowy opis miejsca który powinien się zawinąć na małym ekranie</p><p class="time">Godzina: 09:30</p></li>
<li><h3>Ceremonia</h3><p>Kościół św. Jana, Plac długi 100, Kraków</p></li></ul></section>
<a class="backLink" data-testid="return-link" href="#">Wszystkie wspólne zlecenia</a></main></body></html>`

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  for (const [width, height, label] of [
    [390, 844, '390×844'], [375, 812, '375×812'], [393, 852, '393×852'], [1440, 960, 'desktop'],
  ]) {
    await page.setViewportSize({ width, height })
    await page.setContent(html, { waitUntil: 'load' })
    const metrics = await page.evaluate(() => {
      const main = document.querySelector('[data-testid="collaborative-detail"]')
      const address = document.querySelector('.places li p')
      const link = document.querySelector('[data-testid="return-link"]')
      return {
        documentWidth: document.documentElement.scrollWidth,
        mainWidth: main.getBoundingClientRect().width,
        addressScrollWidth: address.scrollWidth,
        addressClientWidth: address.clientWidth,
        linkHeight: link.getBoundingClientRect().height,
      }
    })
    assert.equal(metrics.documentWidth, width, `${label} has no horizontal document overflow`)
    assert.ok(metrics.mainWidth <= width, `${label} detail page fits the viewport`)
    assert.ok(metrics.addressScrollWidth <= metrics.addressClientWidth, `${label} place address wraps within its card`)
    assert.ok(metrics.linkHeight >= 44, `${label} return link meets the touch target minimum`)
  }
} finally {
  await browser.close()
}
console.log('PASS collaboration 1C-C rendered-style viewport matrix: 390×844, 375×812, 393×852, desktop (16 assertions)')
