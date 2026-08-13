/**
 * Public questionnaire submit success: dedicated screen + deterministic scroll.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scrollPublicFormToTop } from '@/features/prewedding/scrollPublicFormToTop'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

const page = readFileSync(
  resolve(process.cwd(), 'src/features/prewedding/PreWeddingPublicFormPage.tsx'),
  'utf8',
)

run('1. successful submit sets submitted; scroll happens in layout effect', () => {
  assert(page.includes('setSubmitted(true)'), 'success flag')
  assert(page.includes('useLayoutEffect'), 'layout-aware scroll')
  assert(page.includes('scrollPublicFormToTop(thankYouRef.current)'), 'scroll helper')
  const submitStart = page.indexOf('async function handleSubmit')
  const submitFn = page.slice(submitStart, page.indexOf('useLayoutEffect(() => {'))
  assert(submitFn.includes('setSubmitted(true)'), 'set after API')
  assert(!submitFn.includes('scrollPublicFormToTop'), 'no scroll inside submit before paint')
  assert(!submitFn.includes('window.scrollTo'), 'no window.scrollTo in submit')
})

run('2. validation / API errors do not set submitted or scroll to top', () => {
  const submitStart = page.indexOf('async function handleSubmit')
  const submitFn = page.slice(submitStart, page.indexOf('useLayoutEffect(() => {'))
  assert(submitFn.includes('validateRequired'), 'validates')
  assert(submitFn.includes('scrollIntoView'), 'error stays on field')
  const catchBlock = submitFn.slice(submitFn.indexOf('} catch'))
  assert(catchBlock.includes('_form'), 'form error')
  assert(!catchBlock.includes('setSubmitted(true)'), 'failed submit does not succeed')
})

run('3. submitted screen is dedicated — no questionnaire intro', () => {
  const thankYou = page.slice(page.indexOf('prewedding-thank-you'), page.indexOf('prewedding-thank-you') + 1400)
  assert(thankYou.includes('Dziękujemy!'), 'title')
  assert(thankYou.includes('Ankieta została wysłana.'), 'sent copy')
  assert(!thankYou.includes('StudioBrandHeader'), 'no intro header')
  assert(!thankYou.includes('form.title'), 'no questionnaire title')
  assert(!thankYou.includes('form.introduction'), 'no introduction')
  assert(thankYou.includes('form.studioName'), 'studio branding remains')
})

run('4. already-submitted link stays editable until this-session submit', () => {
  assert(page.includes('Thank-you is shown only after a successful submit'), 'session thank-you')
  assert(!page.includes("if (result.status === 'submitted') setSubmitted(true)"), 'no lock on load')
})

run('5. scroll helper writes every plausible scroller', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/scrollPublicFormToTop.ts'),
    'utf8',
  )
  assert(src.includes('window.scrollTo(0, 0)'), 'window')
  assert(src.includes('document.documentElement.scrollTop = 0'), 'html')
  assert(src.includes('document.body.scrollTop = 0'), 'body')
  assert(src.includes("getElementById('root')"), 'root')
  assert(src.includes('root.scrollIntoView'), 'thank-you node')
})

run('6. helper is callable (jsdom-less no-op is fine)', () => {
  scrollPublicFormToTop(null)
})

if (!process.exitCode) {
  console.log('OK prewedding submit success acceptance')
}
