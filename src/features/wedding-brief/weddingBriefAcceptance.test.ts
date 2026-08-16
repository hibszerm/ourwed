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
  isCompactQuestionnaireSection,
  renderWeddingBriefHtml,
  selectLocationsForBriefDirectory,
} from '@/features/wedding-brief/renderWeddingBriefHtml'
import { renderWeddingBriefFooterHtml } from '@/features/wedding-brief/renderWeddingBriefFooterHtml'
import { DEFAULT_TEMPLATE_SCHEMA } from '@/features/prewedding/defaultTemplate'
import { buildPrefill } from '@/lib/api/preweddingPrefill'
import { COMPLETE_BRIEF_NOTE_MARKER } from '@/lib/dev/completeWeddingBriefReference'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
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
    ceremonyTime: '16:00',
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
  assert(data.timeline.some((t) => t.time === '16:00'), 'ceremony 16:00 (canonical)')
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
  // Critical alerts are concise; full context remains in questionnaire detail.
  assert(countOccurrences(html, 'Chcemy pod salą') <= 2, 'group photo not dumped')
  assert(
    countOccurrences(html.toLowerCase(), 'nie bierze udziału') <= 2,
    'family note not triplicated',
  )
  assert(html.includes('Nie przegap'), 'critical section')
  // Photo priorities are questionnaire detail — not Nie przegap alerts.
  assert(html.includes('Naturalne ujęcia rodziców'), 'photo priority in detail')
  assert(
    !data.criticalNotes.some((n) => /Naturalne ujęcia/i.test(n.content)),
    'photo priority not elevated to Nie przegap',
  )
  assert(data.questionnaireSections.length > 0, 'dynamic questionnaire sections')
  assert(data.operationalSections.length === 0, 'hardcoded ops sections retired')
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
        data.coverageAudit.additionalQuestionIds.includes(id) ||
        data.coverageAudit.questionnaireDetailQuestionIds.includes(id),
      `operational ${id} must be mapped`,
    )
  }
  assert(data.coverageAudit.adminOnlyQuestionIds.includes('q28'), 'ack admin')
})

run('6. unmapped custom lands in original questionnaire section (not Additional)', () => {
  const schema = {
    ...DEFAULT_TEMPLATE_SCHEMA,
    sections: [
      ...DEFAULT_TEMPLATE_SCHEMA.sections,
      {
        id: 'sx',
        title: 'NASZE PRIORYTETY',
        questions: [
          {
            id: 'q_new_ops',
            label: 'Na czym najbardziej Wam zależy?',
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
    data.questionnaireSections.some(
      (s) =>
        s.title === 'NASZE PRIORYTETY' &&
        s.items.some((i) => i.questionId === 'q_new_ops'),
    ),
    'custom in original section',
  )
  assert(
    !data.additionalOperational.some((a) =>
      a.value.includes('Parking tylko od tyłu'),
    ),
    'not dumped into Additional',
  )
  const html = renderWeddingBriefHtml(data)
  assert(!html.includes('Dodatkowe informacje'), 'no Additional heading')
  assert(html.includes('NASZE PRIORYTETY'), 'section title')
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
      ceremonyTime: undefined,
      couple: {
        partner1: '',
        partner2: '',
        partner1FirstName: '',
        partner1LastName: '',
        partner2FirstName: '',
        partner2LastName: '',
        email: '',
        phone: '',
        venue: '',
        city: '',
      },
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
        questionnaireSections: data.questionnaireSections,
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
    countOccurrences(html, 'Lokalizacje') <= 1,
    'at most one location directory heading',
  )
  const filteredLocs = selectLocationsForBriefDirectory(
    data.locations,
    data.timeline,
  )
  assert(
    filteredLocs.length === 0 || html.includes('Dodatkowe lokalizacje'),
    'extra locations only when leftovers remain',
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
      data.questionnaireSections.some((s) =>
        s.items.some((i) => i.displayValue.includes('13:00')),
      ),
    '13.00 normalized to 13:00',
  )
  assert(!html.includes('13.00'), 'no dotted 13.00 in html')

  const blessingInCritical = data.criticalNotes.some((n) =>
    /błogosław/i.test(n.label),
  )
  assert(blessingInCritical, 'unusual blessing in nie przegap')
  // May also appear in dynamic questionnaire section (critical + detail).
  assert(
    data.questionnaireSections.some((s) =>
      s.items.some((i) => /osobne błogosław/i.test(i.displayValue)),
    ),
    'blessing kept in questionnaire detail',
  )

  const photoPriority = 'Naturalne ujęcia rodziców'
  assert(countOccurrences(html, photoPriority) === 1, 'photo priority once in detail')
  assert(
    !data.criticalNotes.some((n) => /Naturalne ujęcia/i.test(n.content)),
    'photo priority not in Nie przegap',
  )
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
    wedding: baseWedding({ notes: [], ceremonyTime: undefined }),
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

run('16. Dynamic Brief — snapshot section/question order + labels', () => {
  const schema = structuredClone(DEFAULT_TEMPLATE_SCHEMA)
  const sFilm = schema.sections.find((s) => s.id === 's8')!
  const sBless = schema.sections.find((s) => s.id === 's4')!
  schema.sections = [
    sFilm,
    sBless,
    ...schema.sections.filter((s) => s.id !== 's8' && s.id !== 's4'),
  ]
  sFilm.title = 'PRIORYTETY FILMOWE'
  sBless.title = 'CEREMONIA KOŚCIELNA'
  const q21 = schema.sections.flatMap((s) => s.questions).find((q) => q.id === 'q21')!
  q21.label = 'Na czym Wam zależy historycznie?'

  const data = buildWeddingBriefPdfData({
    wedding: baseWedding({ notes: [] }),
    places,
    preWedding: {
      schema,
      answers: COMPLETE_BRIEF_ANSWERS,
    },
  })
  const titles = data.questionnaireSections.map((s) => s.title)
  const filmIdx = titles.indexOf('PRIORYTETY FILMOWE')
  const blessIdx = titles.indexOf('CEREMONIA KOŚCIELNA')
  assert(filmIdx >= 0, 'renamed film section present')
  assert(blessIdx >= 0, 'renamed bless section present')
  assert(filmIdx < blessIdx, 'reordered sections preserved')
  assert(
    data.questionnaireSections.some((s) =>
      s.items.some(
        (i) =>
          i.questionId === 'q21' &&
          i.label === 'Na czym Wam zależy historycznie?',
      ),
    ),
    'renamed question label from snapshot',
  )
  assert(
    !data.questionnaireSections.some((s) =>
      s.items.some((i) => i.questionId === 'q12'),
    ),
    'ceremony time consumed by stable overview',
  )
})

run('17. Dynamic Brief — custom section, yes_no false, hidden/info/ack omit', () => {
  const schema = {
    sections: [
      {
        id: 'sa',
        title: 'FILM',
        questions: [
          {
            id: 'qc1',
            label: 'Na czym najbardziej Wam zależy?',
            type: 'long_text' as const,
            required: false,
          },
          {
            id: 'qc2',
            label: 'Czy chcecie dron?',
            type: 'yes_no' as const,
            required: false,
          },
          {
            id: 'qc_hidden',
            label: 'Ukryte',
            type: 'short_text' as const,
            required: false,
            hidden: true,
          },
          {
            id: 'qc_info',
            label: '',
            type: 'information' as const,
            required: false,
            helpText: 'Info',
          },
          {
            id: 'qc_ack',
            label: 'Potwierdzam',
            type: 'acknowledgement' as const,
            required: true,
          },
        ],
      },
      {
        id: 'sb',
        title: 'PUSTA',
        questions: [
          {
            id: 'qc_empty',
            label: 'Puste',
            type: 'short_text' as const,
            required: false,
          },
        ],
      },
    ],
  }
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding({ notes: [], payments: [], price: 0 }),
    places: [],
    preWedding: {
      schema,
      answers: {
        qc1: 'Naturalność i rodzina',
        qc2: false,
        qc_hidden: 'secret',
        qc_ack: true,
        qc_empty: '',
      },
    },
  })
  assert(data.questionnaireSections.length === 1, 'empty section omitted')
  assert(data.questionnaireSections[0]!.title === 'FILM', 'custom section')
  assert(
    data.questionnaireSections[0]!.items.some((i) => i.displayValue === 'Nie'),
    'yes_no false → Nie',
  )
  assert(
    !data.questionnaireSections[0]!.items.some((i) => i.questionId === 'qc_hidden'),
    'hidden omitted',
  )
  assert(
    !data.questionnaireSections[0]!.items.some((i) => i.questionId === 'qc_ack'),
    'ack omitted',
  )
  const html = renderWeddingBriefHtml(data)
  assert(html.includes('FILM'), 'section in html')
  assert(html.includes('Naturalność i rodzina'), 'long text')
  assert(html.includes('>Nie<') || html.includes('\nNie'), 'Nie visible')
  assert(!html.includes('secret'), 'hidden not rendered')
})

run('18. Dynamic Brief — orphan fallback + empty snapshot + generator freeze', () => {
  const orphanData = buildWeddingBriefPdfData({
    wedding: baseWedding({ notes: [] }),
    places: [],
    preWedding: {
      schema: { sections: [] },
      answers: { orphan_x: 'Tylko sierota' },
    },
  })
  assert(orphanData.questionnaireSections.length === 0, 'no sections')
  assert(
    orphanData.additionalOperational.some((a) => a.value.includes('sierota')),
    'orphan fallback',
  )
  const orphanHtml = renderWeddingBriefHtml(orphanData)
  assert(orphanHtml.includes('Pozostałe odpowiedzi'), 'fallback heading')

  const convert = readFileSync(
    resolve('src/features/wedding-brief/convertWeddingBriefHtmlToPdf.ts'),
    'utf8',
  )
  const download = readFileSync(
    resolve('src/features/wedding-brief/downloadWeddingBriefPdf.ts'),
    'utf8',
  )
  assert(convert.includes('renderProductionHtmlToPdf'), 'PDF path frozen')
  assert(download.includes('convertWeddingBriefHtmlToPdf'), 'download orchestration')
  assert(download.includes('downloadPdfBytes'), 'blob download')
})

run('19. Dynamic Brief — locations omit raw GPS; consumed contacts', () => {
  const data = buildComplete()
  const html = renderWeddingBriefHtml(data)
  assert(!html.includes('loc-coords'), 'no coord class')
  assert(!/\d+\.\d{4,},\s*\d+\.\d{4,}/.test(html), 'no raw lat/lng dump')
  assert(
    !data.questionnaireSections.some((s) =>
      s.items.some((i) => i.questionId === 'q3' || i.questionId === 'q2'),
    ),
    'contacts consumed from detail',
  )
  assert(html.includes('break-after: avoid'), 'section keep-with-next CSS')
  assert(html.includes('q-section-title'), 'questionnaire heading class')
})

run('20. Dynamic Brief — sensitive not duplicated in detail when in Nie przegap', () => {
  const data = buildComplete()
  assert(
    data.criticalNotes.some((n) => /ojciec/i.test(n.content)),
    'sensitive in critical',
  )
  assert(
    !data.questionnaireSections.some((s) =>
      s.items.some((i) => i.semanticMapping === 'sensitiveFamilyNotes'),
    ),
    'sensitive omitted from dynamic detail',
  )
})

run('21. Dynamic Brief — live template rename does not affect instance snapshot', () => {
  const instanceSchema = structuredClone(DEFAULT_TEMPLATE_SCHEMA)
  const q21 = instanceSchema.sections
    .flatMap((s) => s.questions)
    .find((q) => q.id === 'q21')!
  q21.label = 'Historyczny priorytet filmu'
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding({ notes: [] }),
    places: [],
    preWedding: {
      schema: instanceSchema,
      answers: COMPLETE_BRIEF_ANSWERS,
    },
  })
  assert(
    data.questionnaireSections.some((s) =>
      s.items.some((i) => i.label === 'Historyczny priorytet filmu'),
    ),
    'instance label used',
  )
})

run('22. V1.1 polish — question hierarchy, location dedupe, pagination CSS', () => {
  const data = buildComplete()
  const html = renderWeddingBriefHtml(data)

  // Dynamic labels must not be force-uppercased via CSS.
  assert(html.includes('.q-label'), 'q-label class')
  assert(html.includes('.q-value'), 'q-value class')
  const labelCss = html.slice(html.indexOf('.q-label'), html.indexOf('.q-value'))
  assert(!/text-transform:\s*uppercase/.test(labelCss), 'q-label not uppercase')
  assert(/text-transform:\s*none/.test(labelCss), 'q-label casing preserved')
  assert(html.includes('font-size: 10.5pt'), 'answer emphasis size')

  // Plan dnia places deduped from standalone directory
  const filtered = selectLocationsForBriefDirectory(data.locations, data.timeline)
  assert(filtered.length < data.locations.length, 'standard places filtered')
  assert(
    !html.includes('>Lokalizacje<') && !html.includes('Lokalizacje</h2>'),
    'full Locations dump removed when covered by Plan dnia',
  )

  // Vendors after questionnaire narrative
  const qIdx = html.indexOf('q-section')
  const vendorIdx = html.indexOf('Usługodawcy')
  assert(qIdx >= 0 && vendorIdx > qIdx, 'vendors after questionnaire')

  // Settlement present, no forced page break
  assert(html.includes('Rozliczenie'), 'settlement kept')
  const settleCss = html.slice(
    html.indexOf('.settlement-meta'),
    html.indexOf('.settlement {'),
  )
  assert(!/page-break-before:\s*always/.test(settleCss), 'no forced settlement page')
  assert(/page-break-before:\s*auto/.test(settleCss), 'settlement break-before auto')

  // Pagination protections
  assert(html.includes('page-break-after: avoid'), 'heading keep-with-next')
  assert(html.includes('.q-item.q-long'), 'long pairs may split')
  assert(html.includes('page-break-inside: avoid'), 'short pairs protected')

  assert(!html.includes('loc-coords'), 'no raw GPS')
  assert(!/\d+\.\d{4,},\s*\d+\.\d{4,}/.test(html), 'no lat/lng dump')

  // Divider noise reduced: q-section-title has no border
  const qTitleCss = html.slice(
    html.indexOf('.q-section-title'),
    html.indexOf('.q-item {'),
  )
  assert(!/border-bottom/.test(qTitleCss), 'q section title borderless')

  const convert = readFileSync(
    resolve('src/features/wedding-brief/convertWeddingBriefHtmlToPdf.ts'),
    'utf8',
  )
  assert(convert.includes('renderProductionHtmlToPdf'), 'generator frozen')
})

run('23. V1.1 — additional non-timeline location still rendered', () => {
  const data = buildComplete()
  const withExtra = {
    ...data,
    locations: [
      ...data.locations,
      {
        roles: ['Hotel'],
        name: 'Hotel Extra',
        address: 'ul. Noclegowa 1, Kraków',
        latitude: 50.1,
        longitude: 19.9,
      },
    ],
  }
  const filtered = selectLocationsForBriefDirectory(
    withExtra.locations,
    withExtra.timeline,
  )
  assert(
    filtered.some((l) => l.name === 'Hotel Extra'),
    'extra location kept',
  )
  const html = renderWeddingBriefHtml(withExtra)
  assert(html.includes('Dodatkowe lokalizacje'), 'extra heading')
  assert(html.includes('Hotel Extra'), 'extra name visible')
})

run('24. V1.1 — long custom question text preserved without transform', () => {
  const longLabel =
    'napiszcie nam proszę bardzo szczegółowo na czym Wam zależy podczas pierwszego tańca i wyjścia??? 🎬'
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding({ notes: [], payments: [], price: 0 }),
    places: [],
    preWedding: {
      schema: {
        sections: [
          {
            id: 'sx',
            title: 'nasza sekcja CUSTOM',
            questions: [
              {
                id: 'qlong',
                label: longLabel,
                type: 'long_text',
                required: false,
              },
            ],
          },
        ],
      },
      answers: { qlong: 'Emocje i bliskość.' },
    },
  })
  const html = renderWeddingBriefHtml(data)
  assert(html.includes(longLabel), 'exact long label preserved')
  assert(html.includes('nasza sekcja CUSTOM'), 'exact section title')
  assert(html.includes('overflow-wrap: anywhere'), 'wrap safety')
})

run('25. V1.2 — Nie przegap concise alerts; detail preserved; vendor/settlement polish', () => {
  const longCeremony =
    'Przysięga i wyjście pod konfetti. Dodatkowo prosimy o ujęcia rodziców podczas błogosławieństwa i detale pierścionków na ołtarzu.'
  const data = buildWeddingBriefPdfData({
    wedding: baseWedding(),
    places,
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers: { ...COMPLETE_BRIEF_ANSWERS, q13: longCeremony },
    },
  })
  const html = renderWeddingBriefHtml(data)

  const ceremonyAlert = data.criticalNotes.find((n) =>
    /ceremonia/i.test(n.label),
  )
  assert(Boolean(ceremonyAlert), 'ceremony alert present')
  assert(
    (ceremonyAlert?.content.length ?? 0) <= 110,
    'ceremony alert concise',
  )
  assert(
    data.questionnaireSections.some((s) =>
      s.items.some(
        (i) =>
          i.semanticMapping === 'ceremonyNotes' &&
          i.displayValue.includes('detale pierścionków'),
      ),
    ),
    'full ceremony notes still in questionnaire detail',
  )

  assert(
    !data.criticalNotes.some((n) => /Naturalne ujęcia/i.test(n.content)),
    'creative photo priority not in alerts',
  )
  assert(
    data.criticalNotes.filter((n) => !/rodzina|studia/i.test(n.label)).length <=
      4,
    'operational alert cap',
  )
  assert(
    data.criticalNotes.some((n) => /ojciec/i.test(n.content)),
    'sensitive preserved uncapped',
  )

  assert(html.includes('q-section-start'), 'heading+first pair protection')
  assert(html.includes('detail-layer'), 'detail layer marker')
  assert(!/q-section\s*\{[^}]*break-inside:\s*avoid/.test(html), 'section not wholly avoid')
  assert(html.includes('vendor-name'), 'vendor directory name class')
  assert(html.includes('vendor-role'), 'vendor role metadata')

  const vendorIdx = html.indexOf('Usługodawcy')
  const settleIdx = html.indexOf('Rozliczenie')
  const qIdx = html.indexOf('detail-layer')
  assert(qIdx >= 0 && vendorIdx > qIdx && settleIdx > vendorIdx, 'meta order')
  assert(html.includes('page-break-before: auto'), 'no forced settlement page')
  assert(data.settlement?.remainingToPay === 5000, 'finance unchanged')

  const convert = readFileSync(
    resolve('src/features/wedding-brief/convertWeddingBriefHtmlToPdf.ts'),
    'utf8',
  )
  assert(convert.includes('renderProductionHtmlToPdf'), 'converter frozen')
})

run('26. V1.3 — compact section keep-together; large remains splittable', () => {
  assert(
    isCompactQuestionnaireSection([
      { type: 'single_choice', displayValue: 'Chcemy pod kościołem' },
      { type: 'single_choice', displayValue: 'Życzenia odbędą się na sali' },
    ]),
    'two short items → compact',
  )
  assert(
    !isCompactQuestionnaireSection(
      Array.from({ length: 8 }, (_, i) => ({
        type: 'short_text',
        displayValue: `odpowiedź ${i}`,
      })),
    ),
    '8+ items → not compact',
  )
  assert(
    !isCompactQuestionnaireSection([
      { type: 'long_text', displayValue: 'krótko' },
      { type: 'short_text', displayValue: 'ok' },
    ]),
    'long_text type → not compact',
  )
  assert(
    !isCompactQuestionnaireSection([
      { type: 'short_text', displayValue: 'x'.repeat(200) },
    ]),
    'long display value → not compact',
  )

  const data = buildComplete()
  const html = renderWeddingBriefHtml(data)

  const poCer = data.questionnaireSections.find((s) =>
    /po ceremonii/i.test(s.title),
  )
  assert(Boolean(poCer), 'Po ceremonii section present')
  assert(
    isCompactQuestionnaireSection(poCer!.items),
    'Po ceremonii classified compact',
  )
  assert(
    poCer!.items.length >= 2,
    'Po ceremonii keeps both short Q/A children',
  )

  const compactIdx = html.indexOf('data-section-id="s6"')
  assert(compactIdx >= 0, 'Po ceremonii section markup')
  const compactSlice = html.slice(compactIdx, compactIdx + 900)
  assert(compactSlice.includes('q-section-compact'), 'compact class on small section')
  assert(compactSlice.includes('q-section-keep'), 'keep wrapper for whole section')
  assert(compactSlice.includes('data-compact="1"'), 'compact marker')
  assert(
    !compactSlice.includes('q-section-start'),
    'compact uses keep wrapper, not heading+first only',
  )
  assert(compactSlice.includes('q14') && compactSlice.includes('q15'), 'both children in keep block')

  assert(html.includes('.q-section-compact'), 'compact CSS present')
  assert(
    /\.q-section-compact\s*\{[^}]*break-inside:\s*avoid/.test(html),
    'compact break-inside avoid',
  )
  assert(
    !/\.q-section\s*\{[^}]*break-inside:\s*avoid/.test(html),
    'global q-section not avoid',
  )

  const longSec = data.questionnaireSections.find((s) =>
    s.items.some((i) => i.type === 'long_text' || i.displayValue.length > 180),
  )
  assert(Boolean(longSec), 'long-answer section exists')
  assert(
    !isCompactQuestionnaireSection(longSec!.items),
    'long-answer section not compact',
  )
  const longIdx = html.indexOf(`data-section-id="${longSec!.id}"`)
  const longSlice = html.slice(longIdx, longIdx + 600)
  assert(longSlice.includes('data-compact="0"'), 'large section splittable marker')
  assert(longSlice.includes('q-section-start'), 'large keeps heading+first protection')
  assert(html.includes('q-long'), 'long answers marked q-long')
  assert(
    !/page-break-before:\s*always/.test(
      html.slice(html.indexOf('.detail-layer'), html.indexOf('.detail-layer') + 400),
    ),
    'no forced questionnaire page break',
  )

  const custom = buildWeddingBriefPdfData({
    wedding: baseWedding({ notes: [], payments: [], price: 0 }),
    places: [],
    preWedding: {
      schema: {
        sections: [
          {
            id: 'sx',
            title: 'nasza sekcja CUSTOM',
            questions: [
              {
                id: 'qc1',
                label: 'A?',
                type: 'short_text',
                required: false,
              },
              {
                id: 'qc2',
                label: 'B?',
                type: 'short_text',
                required: false,
              },
            ],
          },
        ],
      },
      answers: { qc1: 'jeden', qc2: 'dwa' },
    },
  })
  const customHtml = renderWeddingBriefHtml(custom)
  assert(customHtml.includes('nasza sekcja CUSTOM'), 'custom section name preserved')
  assert(customHtml.includes('q-section-compact'), 'small custom section compact')
})

run('27. V1.3 — vendor structured vs unstructured; list remains splittable', () => {
  const structured = buildWeddingBriefPdfData({
    wedding: baseWedding(),
    places,
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers: {
        ...COMPLETE_BRIEF_ANSWERS,
        q25: 'Makijaż: beauty · Auto weselne: klekot',
        q26: 'dj willy',
      },
    },
  })
  const makijaz = structured.vendors.find((v) => /beauty/i.test(v.name))
  const auto = structured.vendors.find((v) => /klekot/i.test(v.name))
  const dj = structured.vendors.find((v) => /dj\s*willy/i.test(v.name))
  assert(makijaz?.role === 'Makijaż', 'structured role from colon split')
  assert(makijaz?.name === 'beauty', 'structured name')
  assert(auto?.role === 'Auto weselne', 'second structured role')
  assert(dj?.role === 'DJ / zespół', 'q26 structured role')
  const structuredHtml = renderWeddingBriefHtml(structured)
  assert(
    /vendor-role[^>]*>Makijaż<\/span>[\s\S]*?vendor-name[^>]*>beauty/.test(
      structuredHtml,
    ),
    'structured vendor hierarchy in HTML',
  )

  const unstructured = buildWeddingBriefPdfData({
    wedding: baseWedding(),
    places,
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers: {
        ...COMPLETE_BRIEF_ANSWERS,
        q25: 'makijaż beauty\nauto weselny klekot',
        q26: 'dj willy',
      },
    },
  })
  const rawMak = unstructured.vendors.find((v) =>
    /makijaż beauty/i.test(v.name),
  )
  const rawAuto = unstructured.vendors.find((v) =>
    /auto weselny klekot/i.test(v.name),
  )
  assert(Boolean(rawMak && !rawMak.role), 'unstructured not heuristic-parsed')
  assert(Boolean(rawAuto && !rawAuto.role), 'unstructured auto preserved whole')
  assert(
    unstructured.vendors.some(
      (v) => /dj\s*willy/i.test(v.name) && v.role === 'DJ / zespół',
    ),
    'q26 still structured',
  )
  const unstructuredHtml = renderWeddingBriefHtml(unstructured)
  const makSlice = unstructuredHtml.slice(
    unstructuredHtml.indexOf('makijaż beauty') - 80,
    unstructuredHtml.indexOf('makijaż beauty') + 40,
  )
  assert(
    !/vendor-role/.test(makSlice),
    'unstructured row has no fabricated role',
  )

  assert(
    /\.meta-block\s*\{[^}]*break-inside:\s*auto/.test(unstructuredHtml),
    'vendor block allows page split',
  )
  assert(
    /\.vendor-row\s*\{[^}]*break-inside:\s*avoid/.test(unstructuredHtml),
    'individual vendor rows keep together',
  )

  const convert = readFileSync(
    resolve('src/features/wedding-brief/convertWeddingBriefHtmlToPdf.ts'),
    'utf8',
  )
  const download = readFileSync(
    resolve('src/features/wedding-brief/downloadWeddingBriefPdf.ts'),
    'utf8',
  )
  assert(convert.includes('renderProductionHtmlToPdf'), 'converter frozen')
  assert(download.includes('downloadWeddingBriefPdf'), 'download helper frozen')
})

run('28. V1.4.1 — Brief settlement: Wartość / Wpłacono / Pozostało only', () => {
  const wedding = baseWedding({
    price: 12_200,
    travelFeeStatus: 'charged',
    travelFeeAmount: 800,
    finalPaymentDueDate: '2026-08-12',
    payments: [
      {
        id: 'p1',
        label: 'Zadatek',
        type: 'deposit',
        amount: 1000,
        paidAt: '2026-04-10',
        paid: true,
        method: 'transfer',
      },
    ],
  })
  const data = buildWeddingBriefPdfData({
    wedding,
    places,
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers: COMPLETE_BRIEF_ANSWERS,
    },
  })
  assert(data.settlement?.contractValue === 12_200, 'WARTOŚĆ present')
  assert(data.settlement?.totalPaid === 1000, 'Wpłacono present')
  assert(data.settlement?.remainingToPay === 11_200, 'Pozostało present')
  assert(
    !('travelFeeLabel' in (data.settlement ?? {})),
    'no travelFeeLabel on Brief DTO',
  )
  assert(
    !('dueLabel' in (data.settlement ?? {})),
    'no dueLabel on Brief DTO',
  )
  assert(
    wedding.finalPaymentDueDate === '2026-08-12',
    'underlying due date preserved on wedding',
  )

  const commercial = getWeddingCommercialSummary(wedding)
  assert(
    commercial.finalPaymentDueDate === '2026-08-12',
    'commercial due date semantics untouched',
  )
  assert(commercial.contractValue === 12_200, 'commercial contract value untouched')

  const html = renderWeddingBriefHtml(data)
  const settle = html.slice(html.indexOf('Rozliczenie'))
  assert(settle.includes('Wartość'), 'value row')
  assert(settle.includes('Wpłacono'), 'paid row')
  assert(settle.includes('Pozostało'), 'remaining row')
  assert(!settle.includes('Dojazd'), 'no Dojazd line in Brief')
  assert(!settle.includes('Termin'), 'no Termin line in Brief')
  assert(!settle.includes('12 sierpnia'), 'due date not rendered')
  assert(!settle.includes('800'), 'travel fee amount not shown')
})

run('29. V1.4 — Plan dnia travel connectors from cached segments only', () => {
  const routePlaces: WeddingPlace[] = [
    {
      id: 'groom',
      weddingId: 'w',
      role: 'groom_preparation',
      label: 'Chorzowska',
      placeId: 'test:groom',
      formattedAddress: 'Chorzowska, Katowice',
      latitude: 50.26,
      longitude: 19.02,
      sortOrder: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'bride',
      weddingId: 'w',
      role: 'bride_preparation',
      label: 'Grażyńskiego',
      placeId: 'test:bride',
      formattedAddress: 'Michała Grażyńskiego, Zabrze',
      latitude: 50.3,
      longitude: 18.78,
      sortOrder: 15,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'ceremony',
      weddingId: 'w',
      role: 'ceremony',
      label: 'Willa Słoneczna',
      placeId: 'test:ceremony',
      formattedAddress: 'Willa Słoneczna, ul. Parkowa 1',
      latitude: 50.1,
      longitude: 19.0,
      sortOrder: 20,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]

  const okSeg = (
    origin: string,
    dest: string,
    meters: number,
    seconds: number,
    seq: number,
  ) =>
    ({
      id: `seg-${seq}`,
      weddingId: 'w',
      sequence: seq,
      originKind: 'wedding_place' as const,
      originWeddingPlaceId: origin,
      destinationKind: 'wedding_place' as const,
      destinationWeddingPlaceId: dest,
      endpointsHash: `${origin}>${dest}`,
      distanceMeters: meters,
      distanceText: null,
      durationSeconds: seconds,
      durationText: null,
      travelMode: 'DRIVE' as const,
      provider: 'google',
      status: 'ok' as const,
      errorMessage: null,
      calculatedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

  const withRoute = buildWeddingBriefPdfData({
    wedding: baseWedding(),
    places: routePlaces,
    operationalTimes: {
      groom: '12:00',
      bride: '12:30',
      ceremony: '14:00',
    },
    travelSegments: [
      okSeg('groom', 'bride', 18_000, 24 * 60, 0),
      okSeg('bride', 'ceremony', 63_000, 52 * 60, 1),
    ],
  })
  const brideStop = withRoute.timeline.find((t) => /Panny Młodej/i.test(t.title))
  const ceremonyStop = withRoute.timeline.find((t) => /Ceremonia/i.test(t.title))
  assert(Boolean(brideStop?.travelFromPrevious), 'verified A→B connector')
  assert(
    brideStop!.travelFromPrevious!.distanceMeters === 18_000,
    'distance from cache',
  )
  assert(
    brideStop!.travelFromPrevious!.durationSeconds === 24 * 60,
    'duration from cache',
  )
  assert(Boolean(ceremonyStop?.travelFromPrevious), 'bride→ceremony connector')
  const html = renderWeddingBriefHtml(withRoute)
  assert(html.includes('timeline-travel'), 'travel connector class')
  assert(html.includes('18 km'), 'distance rendered')
  assert(html.includes('ok. 24 min'), 'duration rendered')
  assert(html.includes('63 km'), 'second leg distance')
  assert(html.includes('ok. 52 min'), 'second leg duration')
  assert(!html.includes('50.26'), 'no raw latitude')
  assert(!html.includes('19.02'), 'no raw longitude')

  const unverifiedBride: WeddingPlace = {
    ...routePlaces[1]!,
    latitude: null,
    longitude: null,
  }
  const unverifiedA = buildWeddingBriefPdfData({
    wedding: baseWedding(),
    places: [routePlaces[0]!, unverifiedBride, routePlaces[2]!],
    travelSegments: [
      okSeg('groom', 'bride', 18_000, 24 * 60, 0),
      okSeg('bride', 'ceremony', 63_000, 52 * 60, 1),
    ],
  })
  assert(
    !unverifiedA.timeline.some((t) => t.travelFromPrevious),
    'unverified side → no connectors on adjacent hops',
  )

  const noSegments = buildWeddingBriefPdfData({
    wedding: baseWedding(),
    places: routePlaces,
    travelSegments: [],
  })
  assert(
    !noSegments.timeline.some((t) => t.travelFromPrevious),
    'no route data → no connector',
  )

  const sameLoc: WeddingPlace[] = [
    routePlaces[0]!,
    {
      ...routePlaces[1]!,
      id: 'bride-same',
      placeId: 'test:groom',
      latitude: routePlaces[0]!.latitude,
      longitude: routePlaces[0]!.longitude,
      formattedAddress: routePlaces[0]!.formattedAddress,
    },
  ]
  const sameData = buildWeddingBriefPdfData({
    wedding: baseWedding(),
    places: sameLoc,
    travelSegments: [okSeg('groom', 'bride-same', 0, 0, 0)],
  })
  assert(
    !sameData.timeline.some((t) => t.travelFromPrevious),
    'same location / zero leg omitted',
  )

  assert(
    html.includes('q-section-compact') ||
      renderWeddingBriefHtml(buildComplete()).includes('q-section-compact'),
    'V1.3 compact pagination preserved',
  )
  assert(
    buildComplete().questionnaireSections.some((s) => s.title.length > 0),
    'questionnaire sections unchanged path',
  )

  const loadSrc = readFileSync(
    resolve('src/features/wedding-brief/loadWeddingBriefPdfData.ts'),
    'utf8',
  )
  const renderSrc = readFileSync(
    resolve('src/features/wedding-brief/renderWeddingBriefHtml.ts'),
    'utf8',
  )
  const convert = readFileSync(
    resolve('src/features/wedding-brief/convertWeddingBriefHtmlToPdf.ts'),
    'utf8',
  )
  assert(
    loadSrc.includes('listCachedSegments'),
    'loader uses cached segments only',
  )
  assert(!loadSrc.includes('getPlan'), 'loader does not call getPlan')
  assert(!loadSrc.includes('recalculate'), 'loader does not recalculate')
  assert(!renderSrc.includes('getRoute'), 'renderer has no route calls')
  assert(!renderSrc.includes('travelService'), 'renderer has no travel service')
  assert(convert.includes('renderProductionHtmlToPdf'), 'converter frozen')
})

run('30. Canonical operational precedence — time, contacts, locations', () => {
  // A: wedding.ceremonyTime wins over Q seed; ops override wins both
  const placesFull: WeddingPlace[] = [
    {
      id: 'groom',
      weddingId: 'w',
      role: 'groom_preparation',
      label: 'Groom Prep',
      placeId: 'test:groom',
      formattedAddress: 'Groom St 1',
      latitude: 50.1,
      longitude: 19.1,
      sortOrder: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'ceremony',
      weddingId: 'w',
      role: 'ceremony',
      label: 'Kościół B',
      placeId: 'test:ceremony-b',
      formattedAddress: 'Nowa 10, Kraków',
      latitude: 50.05,
      longitude: 19.94,
      sortOrder: 20,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'reception',
      weddingId: 'w',
      role: 'reception',
      label: 'Villa Love',
      placeId: 'test:villa',
      formattedAddress: 'Lwowska 78, 34-144 Izdebnik',
      latitude: 49.825068,
      longitude: 19.752234,
      sortOrder: 30,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]

  const answersA = {
    ...COMPLETE_BRIEF_ANSWERS,
    q12: '14:00',
    q3: '111 111 111',
    q11: {
      placeId: 'test:ceremony-a',
      formattedAddress: 'Stara 1, Kraków',
      latitude: 50.04,
      longitude: 19.95,
      label: 'Kościół A',
    },
  }

  const timeWin = buildWeddingBriefPdfData({
    wedding: baseWedding({ ceremonyTime: '14:30' }),
    places: placesFull,
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers: answersA,
    },
  })
  const ceremonyStop = timeWin.timeline.find((t) => /Ceremonia/i.test(t.title))
  assert(ceremonyStop?.time === '14:30', 'Brief Plan uses wedding.ceremonyTime')
  assert(
    !timeWin.timeline.some((t) => t.time === '14:00' && /Ceremonia/i.test(t.title)),
    'old Q ceremony time not operational',
  )

  const opsWin = buildWeddingBriefPdfData({
    wedding: baseWedding({ ceremonyTime: '14:30' }),
    places: placesFull,
    operationalTimes: { ceremony: '14:45' },
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers: answersA,
    },
  })
  assert(
    opsWin.timeline.find((t) => /Ceremonia/i.test(t.title))?.time === '14:45',
    'explicit ops ceremony time wins',
  )

  // B: current wedding phone wins; Q fallback when empty
  const contactWin = buildWeddingBriefPdfData({
    wedding: baseWedding({
      couple: {
        ...baseWedding().couple,
        partner1Phone: '999 888 777',
        phone: '999 888 777',
        partner2Phone: '666 555 444',
      },
    }),
    places: placesFull,
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers: answersA,
    },
  })
  const bride = contactWin.contacts.find((c) => c.role === 'Panna Młoda')
  const groom = contactWin.contacts.find((c) => c.role === 'Pan Młody')
  assert(bride?.phone === '999 888 777', 'Brief contact uses wedding phone')
  assert(groom?.phone === '666 555 444', 'groom wedding phone')
  assert(bride?.phone !== '111 111 111', 'old Q phone not operational')

  const contactFallback = buildWeddingBriefPdfData({
    wedding: baseWedding({
      couple: {
        ...baseWedding().couple,
        partner1Phone: '',
        phone: '',
        partner2Phone: '',
      },
    }),
    places: placesFull,
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers: answersA,
    },
  })
  assert(
    contactFallback.contacts.find((c) => c.role === 'Panna Młoda')?.phone ===
      '111 111 111',
    'Q phone fallback when wedding empty',
  )

  // C: WeddingPlace ceremony B wins; Dodatkowe must not reintroduce A for Ceremonia
  const locWin = buildWeddingBriefPdfData({
    wedding: baseWedding({ ceremonyTime: '14:30' }),
    places: placesFull,
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers: answersA,
    },
  })
  const planCeremony = locWin.timeline.find((t) => /Ceremonia/i.test(t.title))
  assert(
    Boolean(
      planCeremony?.placeName?.includes('Kościół B') ||
        planCeremony?.shortAddress?.includes('Nowa 10'),
    ),
    'Plan dnia uses place B',
  )
  const ceremonyDir = locWin.locations.filter((l) =>
    l.roles.some((r) => /ceremon/i.test(r)),
  )
  assert(
    ceremonyDir.every(
      (l) =>
        (l.name || '').includes('Kościół B') ||
        (l.address || '').includes('Nowa 10'),
    ),
    'directory ceremony is place B',
  )
  assert(
    !locWin.locations.some(
      (l) =>
        l.roles.some((r) => /ceremon/i.test(r)) &&
        ((l.name || '').includes('Kościół A') ||
          (l.address || '').includes('Stara 1')),
    ),
    'old Q ceremony A not in Dodatkowe as ceremony role',
  )

  // Historical Layer B: ceremony location consumed from detail (locations dest)
  // but ceremony notes / other Q detail remain available
  assert(
    locWin.questionnaireSections.some((s) =>
      s.items.some((i) => i.displayValue.includes('konfetti')),
    ),
    'questionnaire historical detail preserved',
  )

  // D: custom unmapped question does not override locations
  const custom = buildWeddingBriefPdfData({
    wedding: baseWedding({ ceremonyTime: '14:30' }),
    places: placesFull,
    preWedding: {
      schema: {
        sections: [
          {
            id: 'sx',
            title: 'Custom',
            questions: [
              {
                id: 'qc_meet',
                label: 'Gdzie dokładnie mamy się spotkać?',
                type: 'short_text',
                required: false,
              },
            ],
          },
        ],
      },
      answers: { qc_meet: 'Parking za kościołem A' },
    },
  })
  assert(
    custom.questionnaireSections.some((s) =>
      s.items.some((i) => i.displayValue.includes('Parking')),
    ),
    'custom stays in questionnaire detail',
  )
  assert(
    !custom.timeline.some((t) => (t.shortAddress || '').includes('Parking')),
    'custom does not override Plan dnia',
  )
  assert(
    !custom.locations.some((l) => (l.address || '').includes('Parking')),
    'custom does not invent operational location',
  )
})

if (!process.exitCode) {
  console.log('OK wedding-brief V2 acceptance')
}
