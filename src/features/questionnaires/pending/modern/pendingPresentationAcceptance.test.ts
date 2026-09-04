/**
 * Oczekujące V1 — Modern review-queue presentation.
 * Run: npm run test:pending-presentation
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

{
  const page = read('src/pages/PendingWeddingsPage.tsx')
  assertIncludes(page, 'ModernPendingWorkspace', 'page mounts modern workspace')
  assertIncludes(page, 'width="wide"', 'Modern wide shell')
  assertNotIncludes(page, 'title="Oczekujące"', 'no AppLayout title H1')
  assertIncludes(page, '<AppLayout>', 'AppLayout without title prop')
}

{
  const workspace = read(
    'src/features/questionnaires/pending/modern/ModernPendingWorkspace.tsx',
  )
  const row = read(
    'src/features/questionnaires/pending/modern/ModernPendingRow.tsx',
  )
  const copy = read(
    'src/features/questionnaires/pending/modern/pendingCopy.ts',
  )
  const css = read(
    'src/features/questionnaires/pending/modern/ModernPendingWorkspace.module.css',
  )
  const hook = read(
    'src/features/questionnaires/hooks/usePendingQuestionnaires.ts',
  )

  assertIncludes(workspace, 'usePendingQuestionnaires', 'reuses pending hook')
  assertIncludes(workspace, 'requirePro()', 'page PRO gate preserved')
  assertNotIncludes(
    workspace,
    "actionKey: 'apply_questionnaire_responses'",
    'does not adopt dashboard actionKey',
  )
  assertIncludes(workspace, 'questionnaireService.approve', 'approve reused')
  assertIncludes(workspace, 'questionnaireService.reject', 'reject reused')
  assertIncludes(workspace, 'afterApprove()', 'non-blocking approve invalidate')
  assertIncludes(workspace, 'navigate(`/sluby/${wedding.id}`)', 'navigates to wedding')
  assertNotIncludes(workspace, 'await afterApprove', 'does not await approve invalidate')
  assertNotIncludes(workspace, 'Ładowanie', 'no loading copy')
  assertIncludes(copy, PENDING_TITLE_NEEDLE(), 'H1 copy')
  assertIncludes(
    copy,
    'Ankiety do umowy przesłane przez pary, które czekają na Twoją decyzję.',
    'subtitle',
  )
  assertIncludes(copy, 'Akceptuj', 'accept copy')
  assertIncludes(copy, 'Odrzuć', 'reject copy')
  assertIncludes(copy, 'Otwórz ankietę', 'open copy')
  assertIncludes(copy, 'Brak oczekujących zgłoszeń', 'empty title')
  assertIncludes(
    copy,
    'Nie masz teraz żadnych ankiet do umowy wymagających decyzji.',
    'empty copy',
  )
  assertNotIncludes(copy, 'lead', 'no lead jargon in copy')
  assertNotIncludes(copy, 'leadow', 'no leadowa jargon')

  assertIncludes(row, 'to={`/ankiety/${item.instance.id}`}', 'open instance route')
  assertIncludes(row, "state={{ from: '/oczekujace' }}", 'explicit from state for back IA')
  assertIncludes(row, 'PENDING_ACCEPT', 'accept action')
  assertIncludes(row, 'PENDING_REJECT', 'reject action')
  assertIncludes(row, 'formatPendingSubmittedAt', 'submitted_at presented')
  assertNotIncludes(row, 'answerJson', 'no answer_json in row UI')
  assert(row.includes('<Link'), 'open uses Link')
  assertNotIncludes(row, '<Button', 'no Button inside row (avoids nested Link>Button)')
  assertNotIncludes(row, 'PENDING_OPEN</Button>', 'open is a Link not a Button')

  assertIncludes(css, 'max-width: 1120px', 'queue 1120 left axis')
  assertNotIncludes(css, 'margin-inline: auto', 'queue not centered catalog')
  assertIncludes(css, 'min-height: var(--touch-target)', '44px targets')
  assertIncludes(css, 'overflow-wrap: anywhere', 'long text wrap')
  assertIncludes(css, 'outline: 2px solid var(--color-accent)', 'focus-visible')

  assertIncludes(hook, "PENDING_QUESTIONNAIRES_KEY = 'pending-questionnaires'", 'query key frozen')
  assertNotIncludes(workspace, "queryKey: ['pending-questionnaires'", 'no forked query')
  assertNotIncludes(workspace, 'pendingWeddingService', 'does not revive dead service')
  assertNotIncludes(row, 'confirm(', 'no reject confirmation')
  assertNotIncludes(workspace, 'Modal', 'no reject confirmation modal')

  console.log('PASS  pending modern presentation')
}

{
  const dead = read('src/lib/api/pendingWeddingService.ts')
  assertIncludes(dead, 'In-memory until', 'dead service file retained')
  const workspace = read(
    'src/features/questionnaires/pending/modern/ModernPendingWorkspace.tsx',
  )
  assertNotIncludes(workspace, 'pendingWeddingService', 'workspace ignores dead service')
  console.log('PASS  dead pendingWeddingService left untouched')
}

function PENDING_TITLE_NEEDLE() {
  return "PENDING_TITLE = 'Oczekujące'"
}

console.log('\nAll Oczekujące V1 presentation acceptance checks passed.')
