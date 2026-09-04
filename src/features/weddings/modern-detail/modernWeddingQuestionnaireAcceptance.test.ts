/**
 * Modern Wedding Detail — Ankieta przedślubna presentation acceptance.
 * Run: npm run test:modern-wedding-detail
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildAnswerList } from '@/features/prewedding/answerSummary'
import {
  composeModernQuestionnaireChapter,
  EMPTY_QUESTIONNAIRE_COPY,
  EMPTY_QUESTIONNAIRE_HEADLINE,
  pendingApplyCopy,
} from '@/features/weddings/modern-detail/modernWeddingQuestionnaireModel'
import type { PreWeddingTemplateSchema } from '@/types/preweddingQuestionnaire'

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(actual: T, expected: T, m: string) {
  if (actual !== expected) {
    throw new Error(`${m}: expected ${String(expected)}, got ${String(actual)}`)
  }
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

run('1. Option B chapters and Modern wiring', () => {
  const workspace = read(
    'src/features/weddings/modern-detail/ModernWeddingDetailWorkspace.tsx',
  )
  const ui = read(
    'src/features/weddings/modern-detail/ModernWeddingQuestionnaireWorkspace.tsx',
  )
  const v2 = read('src/features/weddings/detail/v2/WeddingDetailV2.tsx')
  assert(workspace.includes('ModernWeddingQuestionnaireWorkspace'), 'modern tab')
  assert(
    !workspace.includes("from '@/features/weddings/detail/v2/WeddingPreWeddingQuestionnaireWorkspace'"),
    'classic workspace not imported by modern shell',
  )
  assert(v2.includes('WeddingPreWeddingQuestionnaireWorkspace'), 'classic still uses V2 workspace')
  assert(ui.includes('Plan dnia'), 'plan chapter')
  assert(ui.includes('Odpowiedzi pary'), 'answers chapter')
  assert(ui.includes("presentation=\"modern\""), 'modern plan presentation')
  assert(ui.includes('mapping-panel'), 'review stays in ankieta chapter')
  assert(ui.includes('usePreWeddingQuestionnaireWorkspace'), 'shared controller')
  assert(!ui.includes('queryKey:'), 'no new query layer in modern UI')
})

run('2. Status presentation mapping — empty, draft, shared, completed', () => {
  assertEq(
    EMPTY_QUESTIONNAIRE_HEADLINE,
    'Wyślij Parze ankietę przedślubną.',
    'neutral empty headline',
  )
  assert(
    EMPTY_QUESTIONNAIRE_COPY.includes('miejsca, godziny'),
    'empty copy mentions collected info',
  )

  const draft = composeModernQuestionnaireChapter({
    status: 'draft',
    answeredRequired: 0,
    totalRequired: 26,
    pendingApplyCount: 0,
  })
  assertEq(draft.kind, 'ready_to_share', 'draft is ready to share')
  assertEq(draft.headline, 'Ankieta gotowa do wysłania', 'draft product copy')
  assert(draft.showPrimaryShare, 'draft shows primary share')
  assert(draft.supportLine === null, 'no draft support theater')

  const ready = composeModernQuestionnaireChapter({
    status: 'ready',
    answeredRequired: 0,
    totalRequired: 26,
    pendingApplyCount: 0,
  })
  assertEq(ready.kind, 'ready_to_share', 'ready maps like draft')
  assert(ready.showPrimaryShare, 'ready shows primary share')

  const sent = composeModernQuestionnaireChapter({
    status: 'sent',
    sentAt: '2026-08-19T10:00:00.000Z',
    answeredRequired: 0,
    totalRequired: 26,
    pendingApplyCount: 0,
  })
  assertEq(sent.kind, 'waiting', 'sent is waiting')
  assertEq(sent.headline, 'Udostępniona', 'sent product copy')
  assert(!sent.showPrimaryShare, 'sent hides primary share')
  assertEq(sent.supportLine, 'Czekamy na odpowiedzi Pary.', 'waiting copy')

  const opened = composeModernQuestionnaireChapter({
    status: 'opened',
    sentAt: '2026-08-19T10:00:00.000Z',
    firstOpenedAt: '2026-08-20T08:00:00.000Z',
    answeredRequired: 4,
    totalRequired: 26,
    pendingApplyCount: 0,
  })
  assertEq(opened.headline, 'Para otworzyła ankietę', 'opened copy')
  assert(!opened.showPrimaryShare, 'opened hides primary share')
  assert(opened.progressLine === '4 z 26 wymaganych odpowiedzi', 'opened progress')

  const inProgress = composeModernQuestionnaireChapter({
    status: 'in_progress',
    lastSavedAt: '2026-08-20T12:00:00.000Z',
    answeredRequired: 18,
    totalRequired: 26,
    pendingApplyCount: 0,
  })
  assertEq(inProgress.headline, 'Para uzupełnia ankietę', 'in_progress copy')
  assert(!inProgress.showPrimaryShare, 'in_progress hides primary share')
  assert(inProgress.progressLine === '18 z 26 wymaganych odpowiedzi', 'progress before complete')

  const clean = composeModernQuestionnaireChapter({
    status: 'submitted',
    submittedAt: '2026-08-19T10:00:00.000Z',
    answeredRequired: 26,
    totalRequired: 26,
    pendingApplyCount: 0,
  })
  assertEq(clean.kind, 'submitted_clean', 'clean submitted')
  assertEq(clean.headline, 'Wypełniona', 'filled')
  assert(clean.progressLine === null, 'no 26/26 theater')
  assert(clean.supportLine === 'Dane z ankiety są aktualne.', 'calm support')
  assert(!clean.attention, 'no attention')
  assert(!clean.showPrimaryShare, 'completed hides primary share')

  const pending = composeModernQuestionnaireChapter({
    status: 'reopened',
    submittedAt: '2026-07-30T10:00:00.000Z',
    answeredRequired: 26,
    totalRequired: 26,
    pendingApplyCount: 3,
  })
  assertEq(pending.kind, 'submitted_pending', 'legacy reopened is submitted')
  assert(pending.attention, 'attention for diffs')
  assertEq(pending.supportLine, '3 zmiany wymagają sprawdzenia', 'count copy')
  assertEq(pendingApplyCopy(1), '1 zmiana wymaga sprawdzenia', 'singular')
})

run('3. Domain freeze — shared apply/share, no auto apply', () => {
  const hook = read(
    'src/features/prewedding/usePreWeddingQuestionnaireWorkspace.ts',
  )
  const apply = read(
    'src/features/prewedding/weddingDaySync/applyWeddingDaySync.ts',
  )
  const modern = read(
    'src/features/weddings/modern-detail/ModernWeddingQuestionnaireWorkspace.tsx',
  )
  assert(hook.includes("PREWEDDING_QUERY_KEY = 'prewedding-questionnaire'"), 'same key')
  assert(hook.includes("['prewedding-response', questionnaire?.id]"), 'same response key')
  assert(hook.includes('applyWeddingDaySyncCandidates'), 'same apply')
  assert(hook.includes('readValidShareToken'), 'shared controller validates cache')
  assert(hook.includes('shareTokenHashesEqual'), 'Copy requires current hash match')
  assert(apply.includes('resolve: false'), 'no geocode')
  assert(apply.includes('mergeLocationAnswerWithExisting(incoming, null)'), 'no placeId inherit')
  assert(!modern.includes('applyWeddingDaySyncCandidates('), 'modern does not fork apply')
  assert(modern.includes('ctrl.runApply'), 'modern calls shared apply')
})

run('4. Visual language — stream answers, share hierarchy, no Classic chrome', () => {
  const ui = read(
    'src/features/weddings/modern-detail/ModernWeddingQuestionnaireWorkspace.tsx',
  )
  const css = read(
    'src/features/weddings/modern-detail/ModernWeddingQuestionnaireWorkspace.module.css',
  )
  const classic = read(
    'src/features/weddings/detail/v2/WeddingPreWeddingQuestionnaireWorkspace.tsx',
  )
  assert(classic.includes('statusBadge'), 'classic badge remains in classic')
  assert(!ui.includes('statusBadge'), 'modern has no classic badge class')
  assert(!css.includes('backdrop-filter'), 'no glass')
  assert(!css.includes('linear-gradient'), 'no gradient')
  const reviewIdx = ui.indexOf('ReviewPanel')
  const answersIdx = ui.indexOf('AnswersDocument')
  assert(reviewIdx > 0 && answersIdx > reviewIdx, 'review before answers')
  assert(ui.includes('Adres podany ręcznie przez parę'), 'poorer-place copy')
  assert(ui.includes('współrzędne nie zostaną przeniesione'), 'no inherit explained')
  assert(ui.includes('buildAnswerList'), 'flat snapshot-order list')
  assert(!ui.includes('buildAnswerSections'), 'no section grouping in modern')
  assert(!css.includes('answerGrid'), 'no 2-column answer grid')
  assert(css.includes('answerStream'), 'single-column stream')
  assert(ui.includes('EMPTY_QUESTIONNAIRE_HEADLINE'), 'neutral empty headline')
  assert(!ui.includes('Przygotuj ankietę dla'), 'no partner-name empty lead')
  assert(ui.includes('Udostępnij Parze'), 'share CTA product copy')
  assert(!ui.includes("'Udostępnij ankietę'"), 'no repeating share label')
  assert(ui.includes('chapter.showPrimaryShare'), 'primary share gated by presentation')
  assert(ui.includes('Link dla Pary'), 'link management title')
  assert(ui.includes('Kopiuj link'), 'copy is the default action')
  assert(ui.includes('share-overflow-btn'), 'kebab overflow')
  assert(ui.includes('FloatingPortal'), 'overflow is portaled')
  assert(ui.includes('Wygenerować nowy link?'), 'rotate confirm')
  assert(ui.includes('skipBrowserConfirm: true'), 'modern skips native confirm')
  assert(!ui.includes('share-link-url'), 'URL is never rendered')
  assert(!ui.includes('displayPublicQuestionnaireUrl'), 'no truncated URL helper in UI')
  assert(!ui.includes('Aktywny'), 'no active status')
  assert(!ui.includes('<details'), 'no expandable admin panel')
  assert(!ui.includes('plaintext'), 'no plaintext copy')
  assert(!ui.includes('token hash'), 'no token hash copy')
  assert(!ui.includes('Szkic'), 'no draft status label')
  assert(ui.includes('Link niedostępny w tej sesji'), 'hash-only product copy')
})

run('5. Plan dnia modern is presentation-only', () => {
  const plan = read('src/features/prewedding/PreWeddingDayPlan.tsx')
  assert(plan.includes("presentation = 'classic'"), 'classic default')
  assert(plan.includes('weddingPlaceService.reorder'), 'reorder preserved')
  assert(plan.includes('saveTime.mutateAsync'), 'time edit preserved')
  assert(plan.includes('TravelRouteTotals'), 'classic totals remain')
  assert(plan.includes('presentation === \'modern\''), 'modern branch')
})

run('6. Answer stream follows schema snapshot order, not default q1–q28', () => {
  const schema: PreWeddingTemplateSchema = {
    sections: [
      {
        id: 'custom-b',
        title: 'Should not appear as a chapter',
        questions: [
          {
            id: 'custom-note',
            label: 'Uwagi dla fotografa',
            type: 'long_text',
            required: false,
          },
          {
            id: 'info-only',
            label: 'To jest informacja bez odpowiedzi',
            type: 'information',
            required: false,
          },
        ],
      },
      {
        id: 'custom-a',
        title: 'Also not a chapter',
        questions: [
          {
            id: 'q-date',
            label: 'Data ślubu',
            type: 'date',
            required: true,
          },
          {
            id: 'hidden-q',
            label: 'Ukryte',
            type: 'short_text',
            required: false,
            hidden: true,
          },
        ],
      },
    ],
  }
  const items = buildAnswerList(schema, {
    'custom-note': 'Prosimy o spokojne zdjęcia grupowe.',
    'q-date': '2026-08-20',
    'hidden-q': 'nie pokazuj',
  })
  assertEq(items.length, 2, 'information and hidden skipped')
  assertEq(items[0]?.questionId, 'custom-note', 'snapshot order, not default ids')
  assertEq(items[1]?.questionId, 'q-date', 'later section still chronological')
  assertEq(items[0]?.label, 'Uwagi dla fotografa', 'label from schema')
})

run('7. Compact link management never renders the URL', () => {
  const ui = read(
    'src/features/weddings/modern-detail/ModernWeddingQuestionnaireWorkspace.tsx',
  )
  const hook = read(
    'src/features/prewedding/usePreWeddingQuestionnaireWorkspace.ts',
  )
  assert(ui.includes("'Kopiuj link'"), 'copy label')
  assert(ui.includes('share-overflow-menu'), 'overflow menu')
  assert(ui.includes('Otwórz ankietę'), 'open in overflow')
  assert(ui.includes('Kopiuj wiadomość'), 'copy message in overflow')
  assert(ui.includes('Wyślij e-mailem'), 'mailto in overflow')
  assert(ui.includes('rotate-link-btn'), 'rotate in overflow')
  assert(ui.includes('confirm-rotate-link-btn'), 'rotate confirm action')
  assert(!/\bAktywny\b/.test(ui), 'no Aktywny')
  assert(!ui.includes('/ankieta/'), 'no public URL path in markup')
  assert(hook.includes('window.confirm'), 'classic rotate confirm remains')
  assert(hook.includes('skipBrowserConfirm'), 'modern can skip native confirm')
})

console.log('\nmodern wedding questionnaire: done')
