/**
 * Phase 2B — Operational core Dark compatibility.
 * Run: npm run test:operational-dark
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveThemeCssVariables } from '@/features/theme/themeRegistry'
import { THEME_IDS } from '@/features/theme/types'
import lightBaseline from '@/features/appearance/lightThemeTokenBaseline.json'
import {
  DARK_CALENDAR_EVENT_COLORS,
  LIGHT_CALENDAR_EVENT_COLORS,
  resolveCalendarEventColors,
} from '@/features/theme/calendarEventColors'

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
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

function scanCssDir(rel: string) {
  const abs = resolve(process.cwd(), rel)
  const hits: string[] = []
  for (const entry of readdirSync(abs)) {
    if (!entry.endsWith('.module.css')) continue
    const css = read(`${rel}/${entry}`)
    if (
      css.includes('#fff') ||
      css.includes('#ffffff') ||
      css.includes('color: white') ||
      css.includes('#fafafa') ||
      css.includes('rgba(0, 0, 0') ||
      css.includes('rgb(0 0 0')
    ) {
      hits.push(entry)
    }
  }
  return hits
}

run('A. operational CSS modules avoid light-only hardcodes', () => {
  const dirs = [
    'src/features/calendar/modern',
    'src/features/calendar/components',
    'src/features/finance',
    'src/features/tasks/modern',
    'src/features/notifications/modern',
    'src/features/questionnaires/pending/modern',
    'src/features/sessions/modern',
  ]
  for (const dir of dirs) {
    const hits = scanCssDir(dir)
    assert(hits.length === 0, `${dir}: ${hits.join(', ')}`)
  }
})

run('B. Light token baseline remains unchanged', () => {
  const baselineRecord = lightBaseline as Record<string, Record<string, string>>
  for (const id of THEME_IDS) {
    const current = resolveThemeCssVariables(id, 'light')
    const baseline = baselineRecord[id]
    for (const key of Object.keys(baseline)) {
      assert(current[key] === baseline[key], `${id} ${key}`)
    }
  }
})

run('C. all five themes resolve distinct Dark tokens', () => {
  for (const id of THEME_IDS) {
    const dark = resolveThemeCssVariables(id, 'dark')
    const light = resolveThemeCssVariables(id, 'light')
    assert(dark['--app-background'] !== light['--app-background'], id)
    assert(Boolean(dark['--surface-primary']), `${id} surface`)
  }
})

run('D. calendar classic components resolve appearance-aware chip colors', () => {
  const chip = read('src/features/calendar/components/CalendarEventChip.tsx')
  const week = read('src/features/calendar/components/CalendarWeekView.tsx')
  const drawer = read('src/features/calendar/components/CalendarDrawer.tsx')
  assert(chip.includes('resolveCalendarEventColors'), 'chip')
  assert(week.includes('resolveCalendarEventColors'), 'week')
  assert(drawer.includes('resolveCalendarEventColors'), 'drawer')
})

run('E. modals inherit root appearance (no local override)', () => {
  const taskForm = read('src/features/tasks/TaskFormModal.tsx')
  const taskDel = read('src/features/tasks/TaskDeleteModal.tsx')
  const sessionPay = read('src/features/sessions/actions/SessionPaymentModal.tsx')
  for (const [label, src] of [
    ['TaskFormModal', taskForm],
    ['TaskDeleteModal', taskDel],
    ['SessionPaymentModal', sessionPay],
  ]) {
    assert(!src.includes('data-appearance='), `${label} no local appearance`)
  }
})

run('F. public Light isolation remains intact', () => {
  const pub = read('src/features/theme/usePublicThemeIsolation.ts')
  assert(pub.includes("applyAppearanceToDocument('light')"), 'public light')
})

run('G. mobile navigation V1.8.1 geometry frozen', () => {
  const sidebar = read('src/layouts/Sidebar.module.css')
  assert(sidebar.includes('width: min(74vw, 292px)'), 'drawer width')
  assert(sidebar.includes('280ms cubic-bezier(0.22, 1, 0.36, 1)'), 'motion')
})

run('H. finance chart uses semantic CSS tokens', () => {
  const css = read('src/features/finance/FinanceCenter.module.css')
  assert(css.includes('.chartBarPaid'), 'paid bar')
  assert(css.includes('var(--color-text-primary)'), 'paid semantic')
  assert(css.includes('.chartBarRemain'), 'remain bar')
  assert(!css.includes('#fff'), 'no white hardcode')
})

run('I. calendar event colors preserve Light baseline', () => {
  const light = resolveCalendarEventColors('light')
  assert(JSON.stringify(light) === JSON.stringify(LIGHT_CALENDAR_EVENT_COLORS), 'light')
  assert(JSON.stringify(resolveCalendarEventColors('dark')) === JSON.stringify(DARK_CALENDAR_EVENT_COLORS), 'dark')
})

run('J. in-scope routes do not force Light appearance', () => {
  const router = read('src/routes/router.tsx')
  for (const route of ['/kalendarz', '/finanse', '/zadania', '/powiadomienia', '/oczekujace', '/sesje']) {
    assert(router.includes(route), route)
  }
  assert(!router.includes("data-appearance='light'"), 'no forced light')
})

console.log('\nOperational Dark Phase 2B acceptance done.')
