/**
 * Wedding Brief PDF V2 — operational field guide acceptance.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildWeddingBriefPdfData } from '@/features/wedding-brief/buildWeddingBriefPdfData'
import {
  BRIEF_MAPPING_RULES,
  BRIEF_QUESTION_RULES,
  resolveBriefFieldRule,
} from '@/features/wedding-brief/briefFieldRegistry'
import {
  buildWeddingBriefFilename,
  renderWeddingBriefHtml,
} from '@/features/wedding-brief/renderWeddingBriefHtml'
import { renderWeddingBriefFooterHtml } from '@/features/wedding-brief/renderWeddingBriefFooterHtml'
import { DEFAULT_TEMPLATE_SCHEMA } from '@/features/prewedding/defaultTemplate'
import { buildPrefill } from '@/lib/api/preweddingPrefill'
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

function countOccurrences(hay: string, needle: string): number {
  if (!needle) return 0
  let n = 0
  let i = 0
  while ((i = hay.indexOf(needle, i)) !== -1) {
    n += 1
    i += needle.length
  }
  return n
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
  {
    id: 'pl2',
    weddingId: 'w',
    role: 'ceremony',
    label: 'Kościół',
    placeId: 'test:ceremony',
    formattedAddress: 'ul. Zamoyskiego 2, Kraków',
    latitude: 50.04,
    longitude: 19.95,
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

/** Fully filled default pre-wedding questionnaire fixture. */
export const COMPLETE_BRIEF_ANSWERS = {
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
  q12: '16:00',
  q13: 'Przysięga i wyjście pod konfetti.',
  q14: 'Chcemy pod salą',
  q15: 'Życzenia odbędą się na sali',
  q16: {
    placeId: 'test:villa',
    formattedAddress: 'Lwowska 78, 34-144 Izdebnik',
    latitude: 49.825068,
    longitude: 19.752234,
    label: 'Villa Love',
  },
  q17: '18:00',
  q18: '100',
  q19: true,
  q20: 'Wysłano na maila',
  q21: 'Naturalne ujęcia rodziców i detale sukni.',
  q22: 'Zdajemy się na Ciebie!',
  q23: 'Ciepłe kolory, bez mocnego HDR.',
  q24: 'Ojciec PM nie bierze udziału.',
  q25: 'Suknia: Atelier Flora · Makijaż: Studio Glow',
  q26: 'DJ Horizon',
  q28: true,
}

function buildComplete() {
  return buildWeddingBriefPdfData({
    wedding: baseWedding(),
    places,
    contacts: [],
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
      answers: COMPLETE_BRIEF_ANSWERS,
      submittedAt: '2026-08-20T10:00:00.000Z',
    },
    generatedAt: new Date('2026-08-12T15:12:00.000Z'),
  })
}

run('1. assignment + settlement + contacts from questionnaire', () => {
  const data = buildComplete()
  assert(data.wedding.coupleDisplayName.includes('Aleksandra'), 'couple')
  assert(data.wedding.packageName === 'Video Standard', 'package')
  assert(data.wedding.guestCount === 100, 'guest count once in assignment')
  assert(data.wedding.additionalServices.includes('Teaser'), 'extras')
  assert(data.settlement?.remainingToPay === 5000, 'remaining in finance only')
  assert(
    data.contacts.some((c) => c.role === 'Panna Młoda' && c.phone === '500 100 200'),
    'bride phone in contacts',
  )
  assert(
    data.contacts.some((c) => c.role === 'Pan Młody' && c.phone === '500 300 400'),
    'groom phone in contacts',
  )
  assert(data.locations.some((l) => l.name === 'Villa Love'), 'venue')
  assert(data.timeline.some((t) => t.time === '16:00'), 'ceremony 16:00')
  assert(data.timeline.some((t) => t.time === '18:00'), 'reception 18:00')
  assert(data.criticalNotes.length >= 1, 'critical notes present')
  assert(!(data as { questionnaire?: unknown }).questionnaire, 'no questionnaire dump on DTO')
})

run('2. no raw questionnaire dump / no Ankieta prefix / no empty contacts', () => {
  const data = buildComplete()
  const html = renderWeddingBriefHtml(data)
  assert(!html.includes('Ankieta przedślubna'), 'no questionnaire appendix title')
  assert(!html.includes('Ankieta:'), 'no Ankieta: prefixes')
  assert(!html.includes('Dane z ankiety do umowy'), 'no contract dump')
  assert(!html.includes('Szybki przegląd'), 'old quick summary gone')
  assert(html.includes('Kluczowe kontakty'), 'contacts section')
  assert(html.includes('500 100 200'), 'bride phone visible')
  assert(!html.includes('Kluczowe kontakty —'), 'no empty contacts dash')
  assert(!/START COVERAGE[\s\S]*?—/i.test(html), 'no empty coverage placeholder')
})

run('3. semantic facts appear once (dedupe)', () => {
  const data = buildComplete()
  const html = renderWeddingBriefHtml(data)
  assert(data.wedding.guestCount === 100, 'guest count in assignment model')
  assert(
    data.settlement?.remainingToPay === 5000 &&
      !('remainingPayment' in (data as object)),
    'remaining only via settlement',
  )
  const settlementBlock = html.slice(html.indexOf('Rozliczenie'))
  assert(settlementBlock.includes('Pozostało'), 'remaining in finance')
  assert(
    data.timeline.filter((t) => t.time === '16:00').length === 1,
    'ceremony time once in PLAN DNIA',
  )
  assert(
    data.timeline.filter((t) => t.time === '18:00').length === 1,
    'reception time once in PLAN DNIA',
  )
  assert(countOccurrences(html, 'DJ Horizon') === 1, 'dj once')
  assert(countOccurrences(html, 'Chcemy pod salą') === 1, 'group photo once')
  assert(
    countOccurrences(html.toLowerCase(), 'nie bierze udziału') <= 2,
    'family note not triplicated',
  )
  assert(html.includes('Nie przegap'), 'critical section')
  assert(html.includes('Naturalne ujęcia rodziców'), 'photo priority once')
})

run('4. timeline does not duplicate full address strings in meta', () => {
  const data = buildComplete()
  for (const item of data.timeline) {
    if (item.placeName && item.shortAddress) {
      assert(
        item.placeName.toLowerCase() !== item.shortAddress.toLowerCase(),
        `distinct place/address for ${item.title}`,
      )
    }
  }
  const html = renderWeddingBriefHtml(data)
  // Same full address should not appear twice concatenated with ·
  assert(
    !/Lwowska 78[\s\S]{0,40}Lwowska 78/.test(html),
    'no doubled villa address',
  )
})

run('5. coverage audit — every operational answer has a destination', () => {
  const data = buildComplete()
  const answeredIds = Object.keys(COMPLETE_BRIEF_ANSWERS).filter((id) => {
    const q = DEFAULT_TEMPLATE_SCHEMA.sections
      .flatMap((s) => s.questions)
      .find((qq) => qq.id === id)
    return q && q.type !== 'information'
  })
  for (const id of answeredIds) {
    const q = DEFAULT_TEMPLATE_SCHEMA.sections
      .flatMap((s) => s.questions)
      .find((qq) => qq.id === id)!
    const rule = resolveBriefFieldRule({
      questionId: id,
      mapping: q.weddingDayMapping,
      questionType: q.type,
    })
    if (rule.classification === 'ADMIN_ONLY' || rule.destination === 'omit') {
      assert(
        data.coverageAudit.adminOnlyQuestionIds.includes(id),
        `admin ${id}`,
      )
      continue
    }
    assert(
      data.coverageAudit.mappedQuestionIds.includes(id) ||
        data.coverageAudit.additionalQuestionIds.includes(id),
      `operational ${id} must be mapped`,
    )
  }
  assert(data.coverageAudit.adminOnlyQuestionIds.includes('q28'), 'ack admin')
})

run('6. unmapped non-empty field lands in Dodatkowe informacje', () => {
  const schema = {
    ...DEFAULT_TEMPLATE_SCHEMA,
    sections: [
      ...DEFAULT_TEMPLATE_SCHEMA.sections,
      {
        id: 'sx',
        title: 'Extra',
        questions: [
          {
            id: 'q_new_ops',
            label: 'Nowa operacyjna uwaga bez mapowania',
            type: 'short_text' as const,
            required: false,
          },
        ],
      },
    ],
  }
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding({ notes: [] }),
    places,
    preWedding: {
      schema,
      answers: { ...COMPLETE_BRIEF_ANSWERS, q_new_ops: 'Parking tylko od tyłu sali' },
    },
  })
  assert(
    data.coverageAudit.unmappedNonEmptyQuestionIds.includes('q_new_ops'),
    'unmapped tracked',
  )
  assert(
    data.additionalOperational.some((a) =>
      a.value.includes('Parking tylko od tyłu'),
    ),
    'unmapped in additional',
  )
  const html = renderWeddingBriefHtml(data)
  assert(html.includes('Dodatkowe informacje'), 'additional section')
  assert(html.includes('Parking tylko od tyłu'), 'content kept')
})

run('7. partial wedding omits empties', () => {
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding({
      payments: [],
      notes: [],
      packageName: '',
      price: 0,
      depositAmount: 0,
      coverageEndTime: undefined,
    }),
    places: [],
    contacts: [],
    extras: [],
    preWedding: null,
  })
  assert(data.timeline.length === 0, 'no timeline')
  assert(data.contacts.length === 0, 'no contacts')
  assert(!data.settlement, 'no settlement')
  assert(data.criticalNotes.length === 0, 'no critical')
  assert(Boolean(data.missingOperational?.length), 'missing plan')
  const html = renderWeddingBriefHtml(data)
  assert(!html.includes('Kluczowe kontakty'), 'omit empty contacts')
  assert(!html.includes('Nie przegap'), 'omit empty critical')
  assert(!html.includes('Rozliczenie'), 'omit empty finance')
})

run('8. HTML hygiene + PDFShift path unchanged', () => {
  const data = buildComplete()
  const html = renderWeddingBriefHtml(data)
  const footer = renderWeddingBriefFooterHtml(data)
  assert(!/qr|history|activity|supabase|token/i.test(html), 'no secrets')
  assert(!html.includes('q12'), 'no raw question ids')
  assert(footer.includes('pageNumber'), 'footer page tokens')
  assert(buildWeddingBriefFilename(data).endsWith('.pdf'), 'filename')
  const convert = readFileSync(
    resolve('src/features/wedding-brief/convertWeddingBriefHtmlToPdf.ts'),
    'utf8',
  )
  assert(convert.includes('renderProductionHtmlToPdf'), 'PDFShift path')
  assert(!convert.includes('GOTENBERG'), 'no gotenberg in convert')
})

run('9. registry covers default template mappings', () => {
  for (const q of DEFAULT_TEMPLATE_SCHEMA.sections.flatMap((s) => s.questions)) {
    if (q.type === 'information' || q.type === 'acknowledgement') {
      const rule = resolveBriefFieldRule({
        questionId: q.id,
        mapping: q.weddingDayMapping,
        questionType: q.type,
      })
      assert(rule.destination === 'omit', `${q.id} admin omit`)
      continue
    }
    if (q.weddingDayMapping) {
      assert(
        Boolean(BRIEF_MAPPING_RULES[q.weddingDayMapping]),
        `mapping ${q.weddingDayMapping}`,
      )
    } else {
      assert(
        Boolean(BRIEF_QUESTION_RULES[q.id]),
        `question rule ${q.id}`,
      )
    }
  }
})

run('10. write HTML preview artifact', () => {
  const data = buildComplete()
  const outDir = resolve('tmp/wedding-brief-v2')
  mkdirSync(outDir, { recursive: true })
  const html = renderWeddingBriefHtml(data)
  writeFileSync(resolve(outDir, 'brief-preview.html'), html, 'utf8')
  writeFileSync(
    resolve(outDir, 'brief-view-model.json'),
    JSON.stringify(
      {
        contacts: data.contacts,
        timeline: data.timeline,
        locations: data.locations,
        criticalNotes: data.criticalNotes,
        operationalSections: data.operationalSections,
        vendors: data.vendors,
        settlement: data.settlement,
        additionalOperational: data.additionalOperational,
        coverageAudit: data.coverageAudit,
      },
      null,
      2,
    ),
    'utf8',
  )
  assert(existsSync(resolve(outDir, 'brief-preview.html')), 'preview written')
})

/** Real-world V2.1 fixture: named ceremony/reception + address-only prep answers. */
const V21_PLACES: WeddingPlace[] = [
  {
    id: 'pl-reception',
    weddingId: 'w',
    role: 'reception',
    label: 'Villa Love',
    placeId: 'ChIJvilla',
    formattedAddress: 'Lwowska 78, 34-144 Izdebnik',
    latitude: 49.825068,
    longitude: 19.752234,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'pl-ceremony',
    weddingId: 'w',
    role: 'ceremony',
    label: 'Zamek Królewski na Wawelu – Państwowe Zbiory Sztuki',
    placeId: 'ChIJwawel',
    formattedAddress: 'Wawel 5, 31-001 Kraków',
    latitude: 50.054,
    longitude: 19.935,
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'pl-bride',
    weddingId: 'w',
    role: 'bride_preparation',
    label: null,
    placeId: null,
    formattedAddress: 'ul. Lipowa 12, Kraków',
    latitude: 50.06,
    longitude: 19.94,
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'pl-groom',
    weddingId: 'w',
    role: 'groom_preparation',
    label: null,
    placeId: null,
    formattedAddress: 'ul. Dębowa 5, Kraków',
    latitude: 50.05,
    longitude: 19.93,
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

run('11. V2.1 place names + location dedupe + no-value cleanup', () => {
  const answers = {
    ...COMPLETE_BRIEF_ANSWERS,
    // Address-only answers (as if prefill collapsed) matching wedding places
    q4: 'ul. Lipowa 12, Kraków',
    q7: 'ul. Dębowa 5, Kraków',
    q11: 'Wawel 5, 31-001 Kraków',
    q16: 'Lwowska 78, 34-144 Izdebnik',
    q8: '13.00',
    q9: 'Tak, osobne błogosławieństwa',
    q24: 'brak',
    q25: 'brak',
    q26: 'dj willy',
    q21: 'Naturalne ujęcia rodziców i detale sukni.',
    q23: 'Ciepłe kolory, bez mocnego HDR.',
  }
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding({ notes: [] }),
    places: V21_PLACES,
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers,
      submittedAt: '2026-08-20T10:00:00.000Z',
    },
  })
  const html = renderWeddingBriefHtml(data)

  assert(data.locations.length === 4, `exactly 4 locations, got ${data.locations.length}`)
  assert(
    data.locations.some((l) => l.name === 'Villa Love'),
    'Villa Love in directory',
  )
  assert(
    data.locations.some((l) =>
      (l.name || '').includes('Zamek Królewski na Wawelu'),
    ),
    'Wawel name in directory',
  )
  assert(
    countOccurrences(html, 'Lokalizacje') === 1,
    'one location directory heading',
  )
  // No second plain-address role list repeating after cards
  const locIdx = html.indexOf('Lokalizacje')
  const afterLoc = html.slice(locIdx, locIdx + 2500)
  assert(
    !(
      afterLoc.includes('Przygotowania Panny Młodej') &&
      afterLoc.match(/Przygotowania Panny Młodej/g)!.length > 1
    ),
    'bride prep role not duplicated in locations block',
  )

  const ceremonyStop = data.timeline.find((t) => /ceremon/i.test(t.title))
  assert(Boolean(ceremonyStop?.placeName?.includes('Zamek')), 'timeline ceremony name')
  assert(
    Boolean(ceremonyStop?.shortAddress?.includes('Wawel 5')),
    'timeline ceremony address',
  )
  const receptionStop = data.timeline.find((t) => /przyję/i.test(t.title))
  assert(receptionStop?.placeName === 'Villa Love', 'timeline Villa Love')
  assert(
    Boolean(receptionStop?.shortAddress?.includes('Lwowska')),
    'timeline reception address',
  )

  assert(
    !data.criticalNotes.some((n) => /brak/i.test(n.content)),
    'no brak in nie przegap',
  )
  assert(
    !data.criticalNotes.some((n) => /rodzina/i.test(n.label) && /brak/i.test(n.content)),
    'family brak omitted',
  )
  assert(
    !data.vendors.some((v) => /^brak$/i.test(v.name)),
    'generic vendors brak omitted',
  )
  assert(
    data.vendors.some((v) => /dj willy/i.test(v.name)),
    'DJ Willy kept',
  )
  assert(
    data.timeline.some((t) => t.time === '13:00') ||
      data.operationalSections.some((s) =>
        s.items.some((i) => i.value.includes('13:00')),
      ),
    '13.00 normalized to 13:00',
  )
  assert(!html.includes('13.00'), 'no dotted 13.00 in html')

  const blessingInCritical = data.criticalNotes.some((n) =>
    /błogosław/i.test(n.label),
  )
  const blessingInOps = data.operationalSections.some((s) =>
    s.items.some(
      (i) =>
        /błogosław/i.test(i.label) &&
        /osobne błogosław/i.test(i.value),
    ),
  )
  assert(blessingInCritical, 'unusual blessing in nie przegap')
  assert(!blessingInOps, 'blessing not duplicated in logistics')

  const photoPriority = 'Naturalne ujęcia rodziców'
  assert(countOccurrences(html, photoPriority) === 1, 'photo priority once')
})

run('13. operational PLAN DNIA order and times (not chronological)', () => {
  const opsPlaces: WeddingPlace[] = [
    {
      ...V21_PLACES[2]!,
      id: 'pl-bride',
      role: 'bride_preparation',
      sortOrder: 1,
    },
    {
      ...V21_PLACES[3]!,
      id: 'pl-groom',
      role: 'groom_preparation',
      sortOrder: 2,
    },
    {
      ...V21_PLACES[1]!,
      id: 'pl-ceremony',
      role: 'ceremony',
      sortOrder: 3,
    },
    {
      ...V21_PLACES[0]!,
      id: 'pl-reception',
      role: 'reception',
      sortOrder: 4,
    },
  ]
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding({ notes: [] }),
    places: opsPlaces,
    operationalTimes: {
      'pl-bride': '10:45',
      'pl-groom': '12:00',
    },
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers: {
        ...COMPLETE_BRIEF_ANSWERS,
        q12: '14:00',
        q17: '17:00',
      },
    },
  })
  const titles = data.timeline.map((t) => t.title)
  const brideIdx = titles.findIndex((t) => /Panny Młodej/i.test(t))
  const groomIdx = titles.findIndex((t) => /Pana Młodego/i.test(t))
  const ceremonyIdx = titles.findIndex((t) => /Ceremonia/i.test(t))
  const receptionIdx = titles.findIndex((t) => /Przyjęcie/i.test(t))
  assert(brideIdx === 0, 'bride first in operational order')
  assert(groomIdx === 1, 'groom second')
  assert(ceremonyIdx === 2, 'ceremony third')
  assert(receptionIdx === 3, 'reception last')
  assert(data.timeline[0]?.time === '10:45', 'bride operational time')
  assert(data.timeline[1]?.time === '12:00', 'groom operational time')
  assert(data.timeline[2]?.time === '14:00', 'ceremony seeded')
  assert(data.timeline[3]?.time === '17:00', 'reception seeded')
  assert(
    Boolean(
      data.timeline[2]?.placeName?.includes('Zamek') ||
        data.timeline[2]?.placeName?.includes('Willa'),
    ),
    'ceremony place name',
  )
  const villa = data.timeline[receptionIdx!]
  assert(villa?.placeName === 'Villa Love', 'Villa Love name')
  assert(Boolean(villa?.shortAddress?.includes('Lwowska')), 'Villa Love address')
  assert(
    !data.timeline.some((t) => /Wyjazd/i.test(t.title)),
    'no questionnaire departure extras in operational plan',
  )
})

run('14. studio operational time wins over questionnaire seed', () => {
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding({ notes: [] }),
    places: [
      {
        ...V21_PLACES[1]!,
        id: 'pl-ceremony',
        role: 'ceremony',
        sortOrder: 20,
      },
    ],
    operationalTimes: { 'pl-ceremony': '15:30' },
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers: { ...COMPLETE_BRIEF_ANSWERS, q12: '14:00' },
    },
  })
  const ceremony = data.timeline.find((t) => /Ceremonia/i.test(t.title))
  assert(ceremony?.time === '15:30', 'override wins')
})

run('15. vendor semantic dedupe — dj willy once', () => {
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding({ notes: [] }),
    places: [],
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers: {
        ...COMPLETE_BRIEF_ANSWERS,
        q25: 'dj willy\nmakijaż beauty\nauto weselny klekot',
        q26: 'DJ Willy',
      },
    },
  })
  const html = renderWeddingBriefHtml(data)
  const djRows = data.vendors.filter((v) => /dj\s*willy/i.test(v.name))
  assert(djRows.length === 1, `dj once in model, got ${djRows.length}`)
  assert(countOccurrences(html.toLowerCase(), 'dj willy') === 1, 'dj once in html')
  assert(
    data.vendors.some((v) => /makijaż beauty/i.test(v.name)),
    'makeup kept',
  )
  assert(
    data.vendors.some((v) => /klekot/i.test(v.name)),
    'car kept',
  )
})

run('12. prefill preserves Villa Love + Wawel place names', () => {
  const prefill = buildPrefill(baseWedding(), V21_PLACES)
  const reception = prefill.receptionVenue
  const ceremony = prefill.ceremonyLocation
  assert(typeof reception === 'object' && reception !== null, 'reception geo')
  assert(
    typeof reception === 'object' &&
      reception !== null &&
      'label' in reception &&
      reception.label === 'Villa Love',
    'Villa Love prefill label',
  )
  assert(
    typeof ceremony === 'object' &&
      ceremony !== null &&
      'label' in ceremony &&
      String(ceremony.label).includes('Zamek Królewski'),
    'Wawel prefill label',
  )
})

if (!process.exitCode) {
  console.log('OK wedding-brief V2 acceptance')
}
