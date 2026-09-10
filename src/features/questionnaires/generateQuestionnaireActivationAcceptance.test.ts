/**
 * Phase 3.2 — questionnaire generation contextual activation.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/questionnaires/generateQuestionnaireActivationAcceptance.test.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  GENERATE_PACKAGE_SNAPSHOT_NOTE,
  GENERATE_ZERO_PACKAGES_ADD_PACKAGE,
  GENERATE_ZERO_PACKAGES_BODY,
  GENERATE_ZERO_PACKAGES_CONTINUE,
  GENERATE_ZERO_PACKAGES_TITLE,
} from '@/features/questionnaires/generateQuestionnaireActivationCopy'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    throw err
  }
}

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const modal = read('src/features/questionnaires/GenerateQuestionnaireModal.tsx')
const css = read(
  'src/features/questionnaires/GenerateQuestionnaireModal.module.css',
)

run('A: loading — no false zero-package message', () => {
  assert(
    modal.includes('generate-questionnaire-packages-loading'),
    'loading status',
  )
  assert(
    modal.includes('packagesPending'),
    'pending gate before claiming zero',
  )
  assert(
    modal.includes('showZeroPackageChoice = packageCount === 0'),
    'zero only when count known as 0',
  )
  assert(
    modal.includes('Sprawdzanie pakietów'),
    'neutral loading copy',
  )
  assert(
    !modal.includes('hasSeenQuestionnaireEducation'),
    'no education flag',
  )
})

run('B: zero — exact approved title', () => {
  assert(
    GENERATE_ZERO_PACKAGES_TITLE === 'Nie masz jeszcze dodanych pakietów.',
    'title constant',
  )
  assert(
    modal.includes('GENERATE_ZERO_PACKAGES_TITLE'),
    'title wired as modal title',
  )
})

run('C: zero — exact approved body', () => {
  assert(
    GENERATE_ZERO_PACKAGES_BODY ===
      'Możesz utworzyć ankietę bez wyboru pakietu albo najpierw dodać pakiet, aby para mogła wskazać konkretny w ankiecie. Dzięki temu zlecenie utworzone na podstawie ankiety będzie od razu lepiej uzupełnione.',
    'body constant',
  )
  assert(modal.includes('GENERATE_ZERO_PACKAGES_BODY'), 'body wired')
})

run('D: zero — Utwórz bez pakietów available', () => {
  assert(
    GENERATE_ZERO_PACKAGES_CONTINUE === 'Utwórz bez pakietów',
    'continue label',
  )
  assert(
    modal.includes('cancelLabel') &&
      modal.includes('GENERATE_ZERO_PACKAGES_CONTINUE'),
    'continue as cancel action',
  )
  assert(
    modal.includes("cancelVariant={showZeroPackageChoice && !result ? 'secondary' : 'ghost'}"),
    'secondary button presentation',
  )
})

run('E: Utwórz bez pakietów uses existing generate path', () => {
  assert(
    modal.includes("questionnaireService.generate({\n        type: 'contract',\n      })") ||
      modal.includes("questionnaireService.generate({\n        type: 'contract'"),
    'generate contract',
  )
  assert(
    modal.includes('showZeroPackageChoice') &&
      modal.includes('() => void handleGenerate()'),
    'continue calls handleGenerate',
  )
})

run('F: zero — Dodaj pakiet available', () => {
  assert(
    GENERATE_ZERO_PACKAGES_ADD_PACKAGE === 'Dodaj pakiet',
    'add package label',
  )
  assert(
    modal.includes('generate-questionnaire-add-package'),
    'add package test id',
  )
})

run('G: Dodaj pakiet → /studio/pakiety', () => {
  assert(modal.includes("navigate('/studio/pakiety')"), 'navigate packages')
  const start = modal.indexOf('function handleAddPackage')
  assert(start >= 0, 'handler exists')
  const addBody = modal.slice(start, start + 280)
  assert(addBody.includes("navigate('/studio/pakiety')"), 'nav in handler')
  assert(addBody.includes('handleClose()'), 'closes modal')
  assert(!addBody.includes('handleGenerate'), 'no generate before nav')
  assert(!addBody.includes('questionnaireService'), 'no generate in add')
})

run('H: packages > 0 — zero block hidden', () => {
  assert(
    modal.includes('showSnapshotNote = packageCount != null && packageCount > 0'),
    'snapshot when count > 0',
  )
  assert(
    modal.includes('showZeroPackageChoice = packageCount === 0'),
    'zero exclusive',
  )
})

run('I: packages > 0 — snapshot note', () => {
  assert(
    GENERATE_PACKAGE_SNAPSHOT_NOTE ===
      'Pakiety dostępne w tej ankiecie są zapisywane przy tworzeniu linku. Późniejsze zmiany oferty nie zmienią już tej ankiety.',
    'snapshot copy',
  )
  assert(
    modal.includes('generate-questionnaire-snapshot-note'),
    'snapshot test id',
  )
  assert(css.includes('snapshotNote'), 'quiet note style')
})

run('J: packages > 0 — generation unchanged', () => {
  assert(modal.includes('Generuj link'), 'primary generate label')
  assert(
    modal.includes("type: 'contract'"),
    'still contract generate',
  )
  assert(
    modal.includes('Skopiuj unikalny link i wyślij go do pary.'),
    'manual send preserved',
  )
})

run('K: query failure — no false zero claim', () => {
  assert(
    modal.includes('packagesQuery.isError'),
    'error considered',
  )
  assert(
    modal.includes('packageCountKnown'),
    'success required before count',
  )
  // zero choice requires packageCount === 0 which needs known success
  assert(
    modal.includes(
      'const showZeroPackageChoice = packageCount === 0',
    ),
    'zero only from known zero',
  )
})

run('L: no onboarding persistence', () => {
  assert(!modal.includes('localStorage'), 'no localStorage')
  assert(!modal.includes('sessionStorage'), 'no sessionStorage')
  assert(!modal.includes('hasSeen'), 'no hasSeen flags')
  assert(!modal.includes('OnboardingDone'), 'no onboarding done')
  assert(
    modal.includes("queryKey: ['studio-packages', userId, 'active']"),
    'real package query',
  )
  assert(
    modal.includes('activeOnly: true'),
    'matches snapshot activeOnly',
  )
})

run('visual: Guide-family presentation, not alert', () => {
  assert(css.includes('generatePanel'), 'panel language')
  assert(css.includes('.lede'), 'editorial lede')
  assert(modal.includes('mobilePresentation="center"'), 'centered mobile')
  assert(modal.includes('entrance="settle"'), 'settle entrance')
  assert(!modal.includes('warning'), 'no warning framing')
  assert(!modal.includes('alert('), 'no alert()')
})

console.log('\nAll Phase 3.2 generate-questionnaire activation checks passed.')
