/**
 * Wedding Brief PDF — DTO builder + template acceptance tests.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildWeddingBriefPdfData } from '@/features/wedding-brief/buildWeddingBriefPdfData'
import {
  buildWeddingBriefFilename,
  renderWeddingBriefHtml,
} from '@/features/wedding-brief/renderWeddingBriefHtml'
import { DEFAULT_TEMPLATE_SCHEMA } from '@/features/prewedding/defaultTemplate'
import { COMPLETE_BRIEF_NOTE_MARKER } from '@/lib/dev/completeWeddingBriefReference'
import type { Wedding } from '@/types/wedding'
import type { WeddingPlace } from '@/types/travel'

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

function baseWedding(overrides?: Partial<Wedding>): Wedding {
  return {
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
    workflowStage: 'questionnaire',
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
          'WAŻNE: Ojciec Panny Młodej nie bierze udziału w uroczystości.',
        pinned: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'n2',
        author: 'System',
        content: COMPLETE_BRIEF_NOTE_MARKER,
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
    ...overrides,
  } as Wedding
}

const places: WeddingPlace[] = [
  {
    id: 'pl1',
    weddingId: 'w',
    role: 'reception',
    label: 'Villa Love',
    placeId: 'test:villa',
    formattedAddress: 'Lwowska 78, 34-144 Izdebnik',
    latitude: 49.825068,
    longitude: 19.752234,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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
    formattedAddress: 'ul. Lipowa 12, Kraków',
    latitude: 50.06,
    longitude: 19.94,
    label: 'Dom Aleksandry',
  },
  q7: 'ul. Dębowa 5, Kraków',
  q8: '12:45',
  q9: 'Tak, jedno wspólne u Panny Młodej',
  q10: '13:45',
  q11: {
    placeId: 'test:ceremony',
    formattedAddress: 'ul. Zamoyskiego 2, Kraków',
    latitude: 50.04,
    longitude: 19.95,
    label: 'Kościół',
  },
  q12: '14:30',
  q13: 'Przysięga i wyjście pod konfetti.',
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
    '09:30 przygotowania PM · 11:00 przygotowania Panny · 14:30 ceremonia · 17:15 przyjęcie · 21:00 pierwszy taniec',
  q21: 'Naturalne ujęcia rodziców.',
  q22: 'Zdajemy się na Ciebie!',
  q23: 'Ciepłe kolory.',
  q24: 'Ojciec PM nie bierze udziału.',
  q25: 'Suknia: Atelier Flora',
  q26: 'DJ Horizon',
  q28: true,
}

run('1. complete wedding DTO has couple, package, settlement', () => {
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding(),
    places,
    contacts: [
      {
        id: 'c1',
        weddingId: 'w',
        name: 'Aleksandra Nowak',
        role: 'Panna Młoda',
        phone: '500 100 200',
        email: 'aleksandra@example.test',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    extras: [
      {
        id: 'e1',
        weddingId: 'w',
        extraServiceId: 'x1',
        priceSnapshot: 500,
        quantity: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Teaser',
      },
    ],
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers,
      submittedAt: '2026-08-20T10:00:00.000Z',
    },
  })
  assert(data.wedding.coupleDisplayName.includes('Aleksandra'), 'couple')
  assert(data.wedding.packageName === 'Video Standard', 'package')
  assert(data.wedding.additionalServices.includes('Teaser'), 'extras')
  assert(data.settlement?.contractValue === 8500, 'contract value')
  assert(data.settlement?.totalPaid === 3500, 'paid')
  assert(data.settlement?.remainingToPay === 5000, 'remaining')
  assert(data.locations.some((l) => l.name === 'Villa Love'), 'venue name')
  assert(data.timeline.length >= 4, 'timeline')
  assert(Boolean(data.questionnaire?.sections.length), 'prewedding sections')
  assert(
    !data.importantNotes.some((n) => n.content.includes('reference_data_key')),
    'no marker note',
  )
  assert(Boolean(data.quickSummary.criticalNote), 'critical note')
})

run('2. partial wedding omits empties and does not crash', () => {
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding({
      payments: [],
      notes: [],
      packageName: '',
      price: 0,
      depositAmount: 0,
    }),
    places: [],
    contacts: [],
    extras: [],
    preWedding: null,
  })
  assert(data.timeline.length === 0, 'no timeline')
  assert(data.questionnaire === null, 'no questionnaire')
  assert(!data.settlement, 'no settlement')
  assert(Boolean(data.missingOperational?.length), 'missing plan message')
})

run('3. HTML has no QR / History / Activity / raw IDs / tokens', () => {
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding(),
    places,
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers,
    },
  })
  const html = renderWeddingBriefHtml(data)
  assert(html.includes('Villa Love'), 'venue in html')
  assert(html.includes('ą') || html.includes('ślub') || html.includes('Brief'), 'polish')
  assert(!/QR|qrcode|History|Activity|mappingKey|public_token/i.test(html), 'no forbidden')
  assert(!html.includes('q1'), 'no question ids')
  assert(!html.includes('undefined'), 'no undefined')
  assert(!html.includes('null'), 'no null')
  assert(html.includes('@page'), 'a4 css')
  assert(html.includes('Brief zlecenia'), 'title')
  const filename = buildWeddingBriefFilename(data)
  assert(filename.endsWith('.pdf'), 'pdf ext')
  assert(filename.includes('2026-09-12'), 'date in filename')
  assert(!/[ąćęłńóśźż]/i.test(filename), 'ascii filename')
})

run('4. choice labels preserved (not option ids)', () => {
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding(),
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers: { ...answers, q14: 'Chcemy pod kościołem' },
    },
  })
  const flat = data.questionnaire!.sections.flatMap((s) => s.answers)
  assert(
    flat.some((a) => a.value === 'Chcemy pod kościołem'),
    'choice label',
  )
  assert(flat.every((a) => !a.label.startsWith('q')), 'labels human')
})

run('5. seed marker + gotenberg html convert exist', () => {
  const seed = resolve('src/lib/dev/ensureCompleteWeddingBriefReference.ts')
  const convert = resolve('supabase/functions/docx-to-pdf/gotenbergConvert.ts')
  const htmlFn = resolve('supabase/functions/html-to-pdf/index.ts')
  assert(existsSync(seed), 'seed file')
  assert(existsSync(htmlFn), 'html-to-pdf function')
  const src = readFileSync(convert, 'utf8')
  assert(src.includes('convertHtmlViaGotenberg'), 'chromium convert')
  assert(src.includes('/forms/chromium/convert/html'), 'chromium endpoint')
  const seedSrc = readFileSync(seed, 'utf8')
  assert(seedSrc.includes('COMPLETE_BRIEF_NOTE_MARKER'), 'idempotent marker')
  assert(seedSrc.includes('selectBestExistingPackage'), 'existing package')
})

run('6. legacy location strings supported', () => {
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding({
      bridePreparationLocation: 'Dom pani młodej',
      ceremonyLocation: 'Kościół testowy',
      receptionLocation: 'Sala testowa',
    }),
    places: [],
  })
  assert(data.locations.some((l) => l.address.includes('Dom')), 'legacy prep')
  assert(data.locations.some((l) => l.address.includes('Kościół')), 'legacy ceremony')
})

run('7. after sync: canonical prep places used; appendix keeps questionnaire answers', () => {
  const syncedPlaces: WeddingPlace[] = [
    {
      id: 'bp',
      weddingId: 'w',
      role: 'bride_preparation',
      label: 'Michała Grażyńskiego 5',
      placeId: 'ChIJbride',
      formattedAddress: 'Michała Grażyńskiego 5, 41-810 Zabrze',
      latitude: 50.3241,
      longitude: 18.7856,
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'gp',
      weddingId: 'w',
      role: 'groom_preparation',
      label: 'Wolności 100',
      placeId: 'ChIJgroom',
      formattedAddress: 'Wolności 100, 41-800 Zabrze',
      latitude: 50.3012,
      longitude: 18.7851,
      sortOrder: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding({
      bridePreparationLocation: 'ustalone później',
      groomPreparationLocation: 'jeszcze nie wiemy',
    }),
    places: syncedPlaces,
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers,
      submittedAt: '2026-08-20T10:00:00.000Z',
    },
  })
  assert(
    data.locations.some((l) => l.address.includes('Grażyńskiego')),
    'canonical bride prep in locations',
  )
  assert(
    data.locations.some((l) => l.address.includes('Wolności')),
    'canonical groom prep in locations',
  )
  assert(
    !data.locations.some((l) => /ustalone później|jeszcze nie wiemy/i.test(l.address)),
    'placeholders not shown when places exist',
  )
  const flat = (data.questionnaire?.sections ?? []).flatMap((s) => s.answers)
  assert(flat.length > 0, 'appendix has answers')
  assert(
    flat.some((a) => String(a.value).includes('Lipowa') || String(a.value).includes('Aleksandry')),
    'appendix keeps original questionnaire location answer',
  )
  const html = renderWeddingBriefHtml(data)
  assert(!html.includes('bridePreparationLocation'), 'no raw mapping keys')
  assert(!html.includes('WEDDINGDATE'), 'no screaming keys')
})

console.log('Wedding brief acceptance done.')
