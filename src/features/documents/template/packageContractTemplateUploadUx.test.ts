/**
 * Package template upload UX — payment notice + progress stages.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/packageContractTemplateUploadUx.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PACKAGE_TEMPLATE_PAYMENT_NOTICE,
  assessPackageTemplatePaymentNotice,
} from './packageTemplatePaymentNotice'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

// 1. Standard deposit + final / remaining — no warning
const twoPart = assessPackageTemplatePaymentNotice([
  { index: 0, text: 'Zadatek: 3000 zł płatny przy podpisaniu umowy.' },
  { index: 1, text: 'Pozostała kwota: 7000 zł płatna najpóźniej 14 dni przed ślubem.' },
])
assert(twoPart === null, 'deposit + remaining must not warn')

const depositFinal = assessPackageTemplatePaymentNotice([
  { index: 0, text: 'Zaliczka w wysokości 2000 zł.' },
  { index: 1, text: 'Płatność końcowa w dniu ślubu.' },
])
assert(depositFinal === null, 'deposit + final must not warn')

// 2. Multi-installment — warn (matches generation manual path)
const threePart = assessPackageTemplatePaymentNotice([
  { index: 0, text: 'Zadatek: 1000 zł' },
  { index: 1, text: 'II rata: 2000 zł' },
  { index: 2, text: 'III rata: 2000 zł' },
])
assert(
  threePart === PACKAGE_TEMPLATE_PAYMENT_NOTICE,
  '3+ installments must warn',
)

// 3. No payment lines — no warning
assert(
  assessPackageTemplatePaymentNotice([
    { index: 0, text: 'Umowa o świadczenie usług fotograficznych.' },
  ]) === null,
  'no schedule → no warning',
)

// UI wiring
const ui = source('src/features/studio/PackageContractSection.tsx')
assert(ui.includes('PackageTemplateUploadProgress'), 'progress component')
assert(ui.includes('pipelineDone'), 'staged pipeline')
assert(ui.includes('Gotowy'), 'ready status')
assert(ui.includes('Usuń szablon'), 'remove action')
assert(ui.includes('Pobierz oryginał'), 'download action')
assert(ui.includes('Zastąp szablon'), 'replace action')
assert(!ui.includes('ContractAnalysisAnimation'), 'no AI analysis animation')

const upload = source(
  'src/features/documents/template/packageContractTemplateUpload.ts',
)
assert(upload.includes('assessPackageTemplatePaymentNotice'), 'assess helper')
assert(
  source(
    'src/features/documents/template/packageTemplatePaymentNotice.ts',
  ).includes('evaluatePaymentSchedulePolicy'),
  'uses generation policy',
)
assert(!upload.includes('PAYMENT_HINT_RE'), 'old regex removed')

const progress = source(
  'src/features/documents/contract-experience/PackageTemplateUploadProgress.tsx',
)
assert(progress.includes('Przesyłanie pliku'), 'step uploading')
assert(progress.includes('Zapisywanie szablonu'), 'step saving')
assert(progress.includes('Szablon został dodany'), 'step done')
assert(progress.includes('uploadProgressTrack'), 'progress bar')
assert(
  source('src/features/studio/PackageContractSection.tsx').includes(
    'success_transition',
  ),
  'success transition phase',
)
assert(
  source('src/features/studio/PackageContractSection.tsx').includes(
    'inFlightRef',
  ),
  'in-flight guard against empty flash',
)

console.log('ok — packageContractTemplateUploadUx')
