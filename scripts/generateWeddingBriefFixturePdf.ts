/**
 * Dev helper: render fixture Wedding Brief HTML → Gotenberg PDF → PNG pages.
 *   npx tsx --env-file=.env.local scripts/generateWeddingBriefFixturePdf.ts
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildWeddingBriefPdfData } from '../src/features/wedding-brief/buildWeddingBriefPdfData.ts'
import {
  buildWeddingBriefFilename,
  renderWeddingBriefHtml,
} from '../src/features/wedding-brief/renderWeddingBriefHtml.ts'
import { renderWeddingBriefFooterHtml } from '../src/features/wedding-brief/renderWeddingBriefFooterHtml.ts'
import { DEFAULT_TEMPLATE_SCHEMA } from '../src/features/prewedding/defaultTemplate.ts'
import {
  convertHtmlViaGotenberg,
  readGotenbergConfig,
} from '../supabase/functions/docx-to-pdf/gotenbergConvert.ts'
import type { Wedding } from '../src/types/wedding.ts'
import type { WeddingPlace } from '../src/types/travel.ts'

const outDir = resolve('tmp/wedding-brief-pdf')
mkdirSync(outDir, { recursive: true })

const wedding = {
  id: '00000000-0000-4000-8000-000000000001',
  couple: {
    partner1: 'Aleksandra Nowak',
    partner2: 'Michał Kowalski',
    partner1FirstName: 'Aleksandra',
    partner1LastName: 'Nowak',
    partner2FirstName: 'Michał',
    partner2LastName: 'Kowalski',
    email: 'aleksandra@example.test',
    phone: '500 100 200',
    venue: 'Villa Love',
    city: 'Izdebnik',
  },
  date: '2026-09-12',
  ceremonyTime: '14:30',
  packageName: 'Video Standard',
  packageId: 'pkg-1',
  price: 8500,
  depositAmount: 1500,
  currency: 'PLN',
  status: 'active',
  workflowStage: 'preparation',
  payments: [
    {
      id: 'p1',
      label: 'Zadatek',
      type: 'deposit',
      amount: 1500,
      paidAt: '2026-04-10',
      paid: true,
      method: 'transfer',
    },
    {
      id: 'p2',
      label: 'Rata',
      type: 'installment',
      amount: 2000,
      paidAt: '2026-07-01',
      paid: true,
      method: 'transfer',
    },
  ],
  notes: [
    {
      id: 'n1',
      author: 'Studio',
      content:
        'WAŻNE: Ojciec Panny Młodej nie bierze udziału w uroczystości. Nie organizować wspólnych zdjęć rodzinnych bez wcześniejszego potwierdzenia.',
      pinned: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'n2',
      author: 'Studio',
      content:
        'Para szczególnie chce naturalne ujęcia rodziców i dziadków oraz dużo materiału z parkietu.',
      pinned: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'n3',
      author: 'Studio',
      content:
        'Przy sali dostępny jest mały parking techniczny od tylnego wejścia. Kontakt przed wjazdem z managerem sali.',
      pinned: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  contacts: [],
  checklist: [],
  schedule: [],
  finances: [],
  deliverables: [],
  timeline: [],
  questionnaires: {
    contractData: { status: 'completed' },
    weddingQuestionnaire: { status: 'completed' },
  },
  contract: { status: 'generated' },
  accentColor: '#0a0a0a',
  packageItems: [],
  coverageEndTime: '00:30',
  createdAt: '2026-01-01T00:00:00.000Z',
} as Wedding

const places: WeddingPlace[] = [
  {
    id: '1',
    weddingId: wedding.id,
    role: 'bride_preparation',
    label: 'Dom Aleksandry',
    placeId: 'test:bride',
    formattedAddress: 'ul. Lipowa 12, 30-001 Kraków',
    latitude: 50.06143,
    longitude: 19.93658,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: '2',
    weddingId: wedding.id,
    role: 'groom_preparation',
    label: 'Dom Michała',
    placeId: 'test:groom',
    formattedAddress: 'ul. Dębowa 5, 30-002 Kraków',
    latitude: 50.0548,
    longitude: 19.9452,
    sortOrder: 1,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: '3',
    weddingId: wedding.id,
    role: 'ceremony',
    label: 'Kościół pw. św. Józefa',
    placeId: 'test:ceremony',
    formattedAddress: 'ul. Zamoyskiego 2, 30-519 Kraków',
    latitude: 50.0465,
    longitude: 19.9551,
    sortOrder: 2,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: '4',
    weddingId: wedding.id,
    role: 'reception',
    label: 'Villa Love',
    placeId: 'test:villa',
    formattedAddress: 'Lwowska 78, 34-144 Izdebnik',
    latitude: 49.825068,
    longitude: 19.752234,
    sortOrder: 3,
    createdAt: '',
    updatedAt: '',
  },
]

const answers = {
  q1: '2026-09-12',
  q2: 'Aleksandra Nowak',
  q3: '500 100 200',
  q5: 'Michał Kowalski',
  q6: '500 300 400',
  q4: {
    placeId: 'test:bride',
    formattedAddress: 'ul. Lipowa 12, 30-001 Kraków',
    latitude: 50.06143,
    longitude: 19.93658,
    label: 'Dom Aleksandry',
  },
  q7: {
    placeId: 'test:groom',
    formattedAddress: 'ul. Dębowa 5, 30-002 Kraków',
    latitude: 50.0548,
    longitude: 19.9452,
    label: 'Dom Michała',
  },
  q8: '12:45 — wyjazd do Aleksandry',
  q9: 'Tak, jedno wspólne u Panny Młodej',
  q10: '13:45',
  q11: {
    placeId: 'test:ceremony',
    formattedAddress: 'ul. Zamoyskiego 2, 30-519 Kraków',
    latitude: 50.0465,
    longitude: 19.9551,
    label: 'Kościół pw. św. Józefa',
  },
  q12: '14:30',
  q13:
    'Zależy nam na ujęciach wejścia do kościoła, przysiędze na wprost i wyjściu pod konfetti.',
  q14: 'Chcemy pod kościołem',
  q15: 'Przed kościołem/USC - bezpośrednio po ceremonii',
  q16: {
    placeId: 'test:villa',
    formattedAddress: 'Lwowska 78, 34-144 Izdebnik',
    latitude: 49.825068,
    longitude: 19.752234,
    label: 'Villa Love',
  },
  q17: '17:15',
  q18: '95',
  q19: true,
  q20:
    '08:30 przygotowanie sprzętu · 09:30 przygotowania PM · 11:00 przygotowania Panny · 12:30 detale · 13:15 błogosławieństwo · 13:45 wyjazd · 14:30 ceremonia · 15:30 zdjęcie grupowe · 16:00 życzenia · 16:45 wyjazd na salę · 17:15 powitanie · 18:00 obiad · 19:30 zdjęcia rodzinne · 20:15 sesja plenerowa · 21:00 pierwszy taniec · 21:15 zabawa · 22:30 tort · 23:30 zimne ognie · 00:30 koniec coverage',
  q21:
    'Naturalne ujęcia rodziców i dziadków, dużo parkietu, spokojny teaser filmowy.',
  q22: 'Zdajemy się na Ciebie!',
  q23: 'Lubimy ciepłe kolory i czarno-białe kadry emocji.',
  q24:
    'Ojciec Panny Młodej nie bierze udziału. Nie organizować wspólnych zdjęć rodzinnych bez potwierdzenia.',
  q25:
    'Suknia: Atelier Flora · Makijaż: Beauty by Ola · Dekoracje: Zielony Stół · Fryzura: Salon Frame',
  q26: 'DJ Horizon — kontakt 500 900 100',
  q28: true,
}

const data = buildWeddingBriefPdfData({
  wedding,
  places,
  contacts: [
    {
      id: 'c1',
      weddingId: wedding.id,
      name: 'Aleksandra Nowak',
      role: 'Panna Młoda',
      phone: '500 100 200',
      email: 'aleksandra@example.test',
      createdAt: '',
    },
    {
      id: 'c2',
      weddingId: wedding.id,
      name: 'Michał Kowalski',
      role: 'Pan Młody',
      phone: '500 300 400',
      email: 'michal@example.test',
      createdAt: '',
    },
    {
      id: 'c3',
      weddingId: wedding.id,
      name: 'Magdalena Koordynacja',
      role: 'Wedding planner',
      phone: '500 500 600',
      email: 'planner@example.test',
      createdAt: '',
    },
    {
      id: 'c4',
      weddingId: wedding.id,
      name: 'Manager Villa Love',
      role: 'Kontakt sala',
      phone: '500 700 800',
      email: 'venue@example.test',
      createdAt: '',
    },
  ],
  extras: [
    {
      id: 'e1',
      weddingId: wedding.id,
      extraServiceId: 'x',
      priceSnapshot: 400,
      quantity: 1,
      createdAt: '',
      name: 'Teaser',
    },
  ],
  preWedding: {
    title: 'Ankieta przedślubna',
    submittedAt: '2026-08-20T10:00:00.000Z',
    schema: DEFAULT_TEMPLATE_SCHEMA,
    answers,
  },
  generatedAt: new Date('2026-09-11T06:42:00.000Z'),
})

const html = renderWeddingBriefHtml(data)
const footerHtml = renderWeddingBriefFooterHtml(data)
const filename = buildWeddingBriefFilename(data)

writeFileSync(resolve(outDir, 'brief.html'), html, 'utf8')
console.log('Wrote HTML', resolve(outDir, 'brief.html'))

const config = readGotenbergConfig({
  get: (k) => process.env[k],
})
if (!config.ok) {
  console.error(config.message)
  process.exit(1)
}

const { pdfBytes, provider } = await convertHtmlViaGotenberg({
  html,
  footerHtml,
  filename,
  config,
  maxPdfBytes: 40 * 1024 * 1024,
})

const pdfPath = resolve(outDir, filename)
writeFileSync(pdfPath, pdfBytes)
console.log('Wrote PDF', pdfPath, 'provider=', provider, 'bytes=', pdfBytes.byteLength)

// Render pages via Gotenberg PDF → PNG if available, else pdftoppm / pdfjs fallback
const form = new FormData()
form.append(
  'files',
  new File([pdfBytes], filename, { type: 'application/pdf' }),
)
form.append('format', 'png')
form.append('quality', '90')

try {
  const res = await fetch(`${config.url}/forms/chromium/convert/url`, {
    method: 'POST',
    body: (() => {
      // Prefer LibreOffice screenshots endpoint if present; else skip
      return form
    })(),
  })
  if (!res.ok) {
    console.warn('PNG via chromium/url skipped status=', res.status)
  }
} catch {
  console.warn('PNG conversion endpoint not used — trying pdftoppm')
}

async function renderWithPdftoppm() {
  const { spawnSync } = await import('node:child_process')
  const check = spawnSync('pdftoppm', ['-v'], { encoding: 'utf8' })
  if (check.error) {
    console.warn('pdftoppm not installed — install poppler for PNG pages')
    return false
  }
  const prefix = resolve(outDir, 'page')
  const result = spawnSync(
    'pdftoppm',
    ['-png', '-r', '150', pdfPath, prefix],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    console.warn('pdftoppm failed', result.stderr)
    return false
  }
  console.log('Rendered PNG pages to', outDir)
  return true
}

await renderWithPdftoppm()

if (!existsSync(pdfPath)) {
  process.exit(1)
}
console.log('DONE', filename)
