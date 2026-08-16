/**
 * Dev-only idempotent seeder: one complete reference Wedding for Wedding Brief PDF QA.
 * Uses existing packages / extra services / questionnaire templates only.
 * Triggered from Packages page (DEV) or npm run seed:wedding-brief (browser session required via app).
 */

import { contactService } from '@/lib/api/contactService'
import { extraServiceService } from '@/lib/api/extraServiceService'
import { noteService } from '@/lib/api/noteService'
import { packageService } from '@/lib/api/packageService'
import { paymentService } from '@/lib/api/paymentService'
import {
  publicPreWeddingService,
  questionnaireTemplateService,
  weddingQuestionnaireService,
} from '@/lib/api/preweddingQuestionnaireService'
import { sessionService } from '@/lib/api/sessionService'
import { resolveStudioUserId } from '@/lib/api/studioUser'
import { taskService } from '@/lib/api/taskService'
import { weddingExtraServiceService } from '@/lib/api/weddingExtraServiceService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingService } from '@/lib/api/weddingService'
import {
  COMPLETE_BRIEF_CONTRACT_VALUE,
  COMPLETE_BRIEF_DEPOSIT,
  COMPLETE_BRIEF_FICTIONAL,
  COMPLETE_BRIEF_GROOM_NAME,
  COMPLETE_BRIEF_INSTALLMENT,
  COMPLETE_BRIEF_NOTE_MARKER,
  COMPLETE_BRIEF_BRIDE_NAME,
  COMPLETE_BRIEF_WEDDING_DATE,
} from '@/lib/dev/completeWeddingBriefReference'
import { persistWeddingContractAnswerFields } from '@/lib/forms/persistWeddingContractAnswers'
import {
  buildCreateWeddingCommercialFromPackage,
  snapshotPackageItemsFromStudioPackage,
} from '@/lib/utils/commercial'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import { validateWeddingCorrespondenceEntries } from '@/features/weddings/correspondence/weddingCorrespondence'
import type { StudioPackage, ExtraService } from '@/types/package'
import type { PreWeddingAnswerValue } from '@/types/preweddingQuestionnaire'
import type { GeoPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import { devWarnArgs } from '@/lib/debug/devConsole'

function geo(
  label: string,
  formattedAddress: string,
  lat: number,
  lng: number,
  placeId: string,
): GeoPlace {
  return {
    placeId,
    formattedAddress,
    latitude: lat,
    longitude: lng,
    label,
    provider: 'google',
  }
}

const LOCATIONS = {
  bridePrep: geo(
    'Dom Aleksandry',
    'ul. Lipowa 12, 30-001 Kraków',
    50.06143,
    19.93658,
    'test:bride-prep-aleksandra',
  ),
  groomPrep: geo(
    'Dom Michała',
    'ul. Dębowa 5, 30-002 Kraków',
    50.0548,
    19.9452,
    'test:groom-prep-michal',
  ),
  ceremony: geo(
    'Kościół pw. św. Józefa',
    'ul. Zamoyskiego 2, 30-519 Kraków',
    50.0465,
    19.9551,
    'test:ceremony-jozef',
  ),
  reception: geo(
    'Villa Love',
    'Lwowska 78, 34-144 Izdebnik',
    49.825068,
    19.752234,
    'test:villa-love-izdebnik',
  ),
  outdoor: geo(
    'Park przy Villa Love',
    'Lwowska 78, 34-144 Izdebnik',
    49.8255,
    19.7518,
    'test:villa-love-park',
  ),
} as const

async function findBriefWeddingId(userId: string): Promise<string | null> {
  const { data: notes, error } = await supabase
    .from('notes')
    .select('wedding_id, content')
    .eq('content', COMPLETE_BRIEF_NOTE_MARKER)
  throwOnError(error)

  const fromMarker = (notes ?? []).find((n) => n.wedding_id)?.wedding_id as
    | string
    | undefined
  if (fromMarker) {
    const { data: owned } = await supabase
      .from('weddings')
      .select('id')
      .eq('id', fromMarker)
      .eq('user_id', userId)
      .maybeSingle()
    if (owned?.id) return owned.id as string
  }

  const { data, error: wErr } = await supabase
    .from('weddings')
    .select('id')
    .eq('user_id', userId)
    .eq('bride_name', COMPLETE_BRIEF_BRIDE_NAME)
    .eq('groom_name', COMPLETE_BRIEF_GROOM_NAME)
    .eq('wedding_date', COMPLETE_BRIEF_WEDDING_DATE)
    .order('created_at', { ascending: true })
    .limit(1)
  throwOnError(wErr)
  return ((data ?? []) as Array<{ id: string }>)[0]?.id ?? null
}

/** Prefer the most complete active catalog package (items × price). */
export async function selectBestExistingPackage(): Promise<StudioPackage> {
  const all = await packageService.list({ activeOnly: true })
  if (all.length === 0) {
    throw new Error(
      'Brak aktywnych pakietów w studio — dodaj pakiet przed seedem briefu.',
    )
  }
  const scored = [...all].sort((a, b) => {
    const score = (p: StudioPackage) =>
      (p.items?.filter((i) => i.enabled).length ?? 0) * 1000 + p.price
    return score(b) - score(a)
  })
  return scored[0]!
}

async function ensureMarkerNote(weddingId: string): Promise<void> {
  const notes = await noteService.listByWeddingId(weddingId)
  if (notes.some((n) => n.content.includes(COMPLETE_BRIEF_NOTE_MARKER))) return
  await noteService.create({
    weddingId,
    content: COMPLETE_BRIEF_NOTE_MARKER,
    author: 'System',
    pinned: false,
  })
}

async function ensureOperationalNotes(weddingId: string): Promise<void> {
  const notes = await noteService.listByWeddingId(weddingId)
  const wanted = [
    {
      pinned: true,
      content:
        'WAŻNE: Ojciec Panny Młodej nie bierze udziału w uroczystości. Nie organizować wspólnych zdjęć rodzinnych bez wcześniejszego potwierdzenia.',
    },
    {
      pinned: false,
      content:
        'Para szczególnie chce naturalne ujęcia rodziców i dziadków oraz dużo materiału z parkietu.',
    },
    {
      pinned: false,
      content:
        'Przy sali dostępny jest mały parking techniczny od tylnego wejścia. Kontakt przed wjazdem z managerem sali.',
    },
    {
      pinned: false,
      content:
        'Teaser w spokojnym, filmowym stylu. Bez przypadkowych wypowiedzi gości po północy.',
    },
  ]
  for (const item of wanted) {
    if (notes.some((n) => n.content === item.content)) continue
    await noteService.create({
      weddingId,
      content: item.content,
      author: 'Studio',
      pinned: item.pinned,
    })
  }
}

async function ensureContacts(weddingId: string): Promise<void> {
  const existing = await contactService.listByWeddingId(weddingId)
  const wanted = [
    {
      name: COMPLETE_BRIEF_BRIDE_NAME,
      role: 'Panna Młoda',
      phone: COMPLETE_BRIEF_FICTIONAL.bridePhone,
      email: COMPLETE_BRIEF_FICTIONAL.brideEmail,
    },
    {
      name: COMPLETE_BRIEF_GROOM_NAME,
      role: 'Pan Młody',
      phone: COMPLETE_BRIEF_FICTIONAL.groomPhone,
      email: COMPLETE_BRIEF_FICTIONAL.groomEmail,
    },
    {
      name: 'Katarzyna Wiśniewska',
      role: 'Świadkowa',
      phone: '500 111 222',
      email: 'swiadkowa@example.test',
    },
    {
      name: 'Tomasz Zieliński',
      role: 'Świadek',
      phone: '500 222 333',
      email: 'swiadek@example.test',
    },
    {
      name: 'Anna Nowak',
      role: 'Kontakt awaryjny (matka PM)',
      phone: '500 444 555',
      email: 'anna.parent@example.test',
    },
    {
      name: 'Magdalena Koordynacja',
      role: 'Wedding planner',
      phone: COMPLETE_BRIEF_FICTIONAL.plannerPhone,
      email: 'planner@example.test',
    },
    {
      name: 'Manager Villa Love',
      role: 'Kontakt sala',
      phone: COMPLETE_BRIEF_FICTIONAL.venuePhone,
      email: 'venue@example.test',
    },
    {
      name: 'DJ Horizon',
      role: 'DJ / oprawa muzyczna',
      phone: COMPLETE_BRIEF_FICTIONAL.djPhone,
      email: 'dj@example.test',
    },
  ]
  for (const c of wanted) {
    if (existing.some((e) => e.name === c.name && e.role === c.role)) continue
    await contactService.create({ weddingId, ...c })
  }
}

async function ensurePlaces(weddingId: string): Promise<void> {
  await weddingPlaceService.upsert({
    weddingId,
    role: 'bride_preparation',
    addressText: LOCATIONS.bridePrep.formattedAddress,
    place: LOCATIONS.bridePrep,
    resolve: false,
  })
  await weddingPlaceService.upsert({
    weddingId,
    role: 'groom_preparation',
    addressText: LOCATIONS.groomPrep.formattedAddress,
    place: LOCATIONS.groomPrep,
    resolve: false,
  })
  await weddingPlaceService.upsert({
    weddingId,
    role: 'ceremony',
    addressText: LOCATIONS.ceremony.formattedAddress,
    place: LOCATIONS.ceremony,
    resolve: false,
  })
  await weddingPlaceService.upsert({
    weddingId,
    role: 'reception',
    addressText: LOCATIONS.reception.formattedAddress,
    place: LOCATIONS.reception,
    resolve: false,
  })
  await weddingPlaceService.upsert({
    weddingId,
    role: 'other',
    addressText: LOCATIONS.outdoor.formattedAddress,
    place: LOCATIONS.outdoor,
    resolve: false,
  })
}

async function ensureExtras(
  weddingId: string,
  catalog: ExtraService[],
): Promise<ExtraService[]> {
  const linked = await weddingExtraServiceService.listByWeddingId(weddingId)
  const pick = catalog.slice(0, Math.min(4, catalog.length))
  for (const svc of pick) {
    if (linked.some((e) => e.extraServiceId === svc.id)) continue
    await weddingExtraServiceService.add({
      weddingId,
      extraServiceId: svc.id,
      quantity: 1,
    })
  }
  return pick
}

async function ensurePayments(weddingId: string): Promise<void> {
  const wedding = await weddingService.getById(weddingId)
  if (!wedding) return
  const payments = wedding.payments ?? []
  const hasDeposit = payments.some(
    (p) => p.type === 'deposit' && p.paid && p.amount >= COMPLETE_BRIEF_DEPOSIT,
  )
  const hasInstallment = payments.some(
    (p) =>
      p.type === 'installment' &&
      p.paid &&
      p.amount >= COMPLETE_BRIEF_INSTALLMENT,
  )
  if (!hasDeposit) {
    await paymentService.create({
      weddingId,
      type: 'deposit',
      amount: COMPLETE_BRIEF_DEPOSIT,
      paymentDate: '2026-04-10',
      method: 'transfer',
      note: 'Zadatek — brief demo',
    })
  }
  if (!hasInstallment) {
    await paymentService.create({
      weddingId,
      type: 'installment',
      amount: COMPLETE_BRIEF_INSTALLMENT,
      paymentDate: '2026-07-01',
      method: 'transfer',
      note: 'Druga rata — brief demo',
    })
  }
}

async function ensureTasks(weddingId: string): Promise<void> {
  const existing = await taskService.listByWeddingId(weddingId)
  const titles = new Set(existing.map((t) => t.title))
  const wanted: Array<{
    title: string
    status: 'todo' | 'done'
    dueDate?: string
    description?: string
  }> = [
    { title: 'Umowa wysłana', status: 'done', dueDate: '2026-03-15' },
    { title: 'Zadatek potwierdzony', status: 'done', dueDate: '2026-04-10' },
    {
      title: 'Ankieta przedślubna złożona',
      status: 'done',
      dueDate: '2026-08-20',
    },
    { title: 'Harmonogram potwierdzony', status: 'done', dueDate: '2026-09-01' },
    {
      title: 'Naładować baterie',
      status: 'todo',
      dueDate: '2026-09-11',
      description: 'Przed wyjazdem na ślub',
    },
    {
      title: 'Sformatować karty pamięci',
      status: 'todo',
      dueDate: '2026-09-11',
    },
    { title: 'Spakować sprzęt', status: 'todo', dueDate: '2026-09-11' },
    {
      title: 'Potwierdzić godzinę wjazdu z salą',
      status: 'todo',
      dueDate: '2026-09-10',
    },
    {
      title: 'Pobrać mapy offline',
      status: 'todo',
      dueDate: '2026-09-11',
    },
    {
      title: 'Wygenerować Wedding Brief PDF',
      status: 'todo',
      dueDate: '2026-09-11',
    },
  ]
  for (const t of wanted) {
    if (titles.has(t.title)) continue
    await taskService.create({
      weddingId,
      title: t.title,
      description: t.description,
      dueDate: t.dueDate,
      status: t.status,
    })
  }
}

async function ensureSessions(weddingId: string): Promise<void> {
  try {
    const existing = await sessionService.listByWeddingId(weddingId)
    if (!existing.some((s) => s.sessionType === 'engagement')) {
      await sessionService.create({
        sessionType: 'engagement',
        date: '2026-06-14',
        startTime: '17:00',
        endTime: '19:00',
        primaryPerson: { firstName: 'Aleksandra', lastName: 'Nowak' },
        secondaryPerson: { firstName: 'Michał', lastName: 'Kowalski' },
        totalPrice: 900,
        depositAmount: 200,
        linkedWeddingId: weddingId,
        notes: 'Sesja narzeczeńska — park miejski',
        location: {
          name: 'Park Jordana',
          formattedAddress: 'al. 3 Maja, Kraków',
        },
      })
    }
    if (
      !existing.some(
        (s) =>
          s.sessionType === 'other' &&
          (s.customSessionType?.includes('ślub') ||
            s.notes?.includes('Dzień ślubu')),
      )
    ) {
      await sessionService.create({
        sessionType: 'other',
        customSessionType: 'Dzień ślubu',
        date: COMPLETE_BRIEF_WEDDING_DATE,
        startTime: '09:00',
        // DB check: end_time >= start_time (same calendar day) — overnight end stored as null
        endTime: undefined,
        primaryPerson: { firstName: 'Aleksandra', lastName: 'Nowak' },
        secondaryPerson: { firstName: 'Michał', lastName: 'Kowalski' },
        totalPrice: COMPLETE_BRIEF_CONTRACT_VALUE,
        depositAmount: COMPLETE_BRIEF_DEPOSIT,
        linkedWeddingId: weddingId,
        notes: 'Dzień ślubu — coverage do 00:30',
        location: {
          name: LOCATIONS.reception.label!,
          formattedAddress: LOCATIONS.reception.formattedAddress,
        },
      })
    }
  } catch (err) {
    devWarnArgs(
      '[brief-demo] sessions seed skipped:',
      err instanceof Error ? err.message : err,
    )
  }
}

function buildPreWeddingAnswers(): Record<string, PreWeddingAnswerValue> {
  return {
    q1: COMPLETE_BRIEF_WEDDING_DATE,
    q2: COMPLETE_BRIEF_BRIDE_NAME,
    q3: COMPLETE_BRIEF_FICTIONAL.bridePhone,
    q5: COMPLETE_BRIEF_GROOM_NAME,
    q6: COMPLETE_BRIEF_FICTIONAL.groomPhone,
    q4: LOCATIONS.bridePrep,
    q7: LOCATIONS.groomPrep,
    q8: '12:45 — wyjazd do Aleksandry',
    q9: 'Tak, jedno wspólne u Panny Młodej',
    q10: '13:45',
    q11: LOCATIONS.ceremony,
    q12: '14:30',
    q13:
      'Zależy nam na ujęciach wejścia do kościoła, przysiędze na wprost i wyjściu pod konfetti. Prosimy nie filmować gości w ławkach podczas czytań.',
    q14: 'Chcemy pod kościołem',
    q15: 'Przed kościołem/USC - bezpośrednio po ceremonii',
    q16: LOCATIONS.reception,
    q17: '17:15',
    q18: '95',
    q19: true,
    q20:
      '08:30 przygotowanie sprzętu · 09:30 przygotowania PM · 11:00 przygotowania Panny · 12:30 detale · 13:15 błogosławieństwo · 13:45 wyjazd · 14:30 ceremonia · 15:30 zdjęcie grupowe · 16:00 życzenia · 16:45 wyjazd na salę · 17:15 powitanie · 18:00 obiad · 19:30 zdjęcia rodzinne · 20:15 sesja plenerowa · 21:00 pierwszy taniec · 21:15 zabawa · 22:30 tort · 23:30 zimne ognie · 00:30 koniec coverage',
    q21:
      'Naturalne ujęcia rodziców i dziadków, dużo parkietu, spokojny teaser filmowy. Sesja plenerowa przy Villa Love około 20:15.',
    q22: 'Zdajemy się na Ciebie!',
    q23:
      'Lubimy ciepłe kolory i czarno-białe kadry emocji. Unikamy mocno rozmazanych ujęć gości.',
    q24:
      'Ojciec Panny Młodej nie bierze udziału. Nie organizować wspólnych zdjęć rodzinnych bez potwierdzenia ze świadkową.',
    q25:
      'Suknia: Atelier Flora · Makijaż: Beauty by Ola · Dekoracje: Zielony Stół · Fryzura: Salon Frame',
    q26: 'DJ Horizon — kontakt 500 900 100',
    q28: true,
  }
}

async function ensurePreWeddingQuestionnaire(wedding: Wedding): Promise<void> {
  const template = await questionnaireTemplateService.getOrSeedDefault()
  let q = await weddingQuestionnaireService.getByWeddingId(wedding.id)
  if (!q) {
    q = await weddingQuestionnaireService.prepare(wedding, template)
  }

  const existing = await weddingQuestionnaireService.getResponse(q.id)
  if (existing?.submittedAt) {
    return
  }

  const answers = buildPreWeddingAnswers()
  const { token } = await weddingQuestionnaireService.ensureShareLink(
    q.id,
    wedding.id,
  )
  await publicPreWeddingService.submit(token, answers, 26, 26)
}

async function ensureCorrespondence(wedding: Wedding): Promise<Wedding> {
  const validated = validateWeddingCorrespondenceEntries([
    {
      id: crypto.randomUUID(),
      channel: 'email',
      value: COMPLETE_BRIEF_FICTIONAL.brideEmail,
    },
    {
      id: crypto.randomUUID(),
      channel: 'instagram',
      value: '@ola_i_michal_demo',
    },
  ])
  if (!validated.ok) return wedding
  return weddingService.update({
    ...wedding,
    correspondence: validated.normalized,
  })
}

/**
 * Create or refresh the complete Wedding Brief reference wedding.
 * Safe to call repeatedly — never duplicates the marker wedding.
 */
export async function ensureCompleteWeddingBriefReference(): Promise<{
  wedding: Wedding
  package: StudioPackage
  extras: ExtraService[]
}> {
  const userId = await resolveStudioUserId()
  const pkg = await selectBestExistingPackage()
  const catalogExtras = await extraServiceService.list({ activeOnly: true })

  const commercial = buildCreateWeddingCommercialFromPackage({
    weddingDate: COMPLETE_BRIEF_WEDDING_DATE,
    pkg,
    extrasTotal: 0,
    overrides: {
      price: COMPLETE_BRIEF_CONTRACT_VALUE,
      depositAmount: COMPLETE_BRIEF_DEPOSIT,
    },
  })

  const packageItems =
    commercial.packageItems.length > 0
      ? commercial.packageItems
      : snapshotPackageItemsFromStudioPackage(pkg)

  let weddingId = await findBriefWeddingId(userId)
  let wedding: Wedding

  if (weddingId) {
    const current = await weddingService.getById(weddingId)
    if (!current) throw new Error('Nie znaleziono ślubu brief demo.')
    wedding = await weddingService.update({
      ...current,
      couple: {
        ...current.couple,
        partner1: COMPLETE_BRIEF_BRIDE_NAME,
        partner2: COMPLETE_BRIEF_GROOM_NAME,
        partner1FirstName: 'Aleksandra',
        partner1LastName: 'Nowak',
        partner2FirstName: 'Michał',
        partner2LastName: 'Kowalski',
        partner1Phone: COMPLETE_BRIEF_FICTIONAL.bridePhone,
        partner2Phone: COMPLETE_BRIEF_FICTIONAL.groomPhone,
        partner1Email: COMPLETE_BRIEF_FICTIONAL.brideEmail,
        partner2Email: COMPLETE_BRIEF_FICTIONAL.groomEmail,
        phone: COMPLETE_BRIEF_FICTIONAL.bridePhone,
        email: COMPLETE_BRIEF_FICTIONAL.brideEmail,
        partner1Address: 'ul. Lipowa 12',
        partner1PostalCode: '30-001',
        partner1City: 'Kraków',
        partner2Address: 'ul. Dębowa 5',
        partner2PostalCode: '30-002',
        partner2City: 'Kraków',
        venue: 'Villa Love',
        city: 'Izdebnik',
      },
      date: COMPLETE_BRIEF_WEDDING_DATE,
      ceremonyTime: '14:30',
      packageId: pkg.id,
      packageName: pkg.name,
      price: COMPLETE_BRIEF_CONTRACT_VALUE,
      depositAmount: COMPLETE_BRIEF_DEPOSIT,
      currency: 'PLN',
      accentColor: pkg.color || current.accentColor,
      packageItems,
      coverageHours: commercial.coverageHours ?? pkg.coverageHours ?? 12,
      coverageEndTime:
        commercial.coverageEndTime ?? pkg.coverageEndTime ?? '00:30',
      overtimeRate: commercial.overtimeRate ?? pkg.overtimeRate,
      deliveryMonths: commercial.deliveryMonths ?? pkg.deliveryMonths,
      deliveryDays: commercial.deliveryDays ?? pkg.deliveryDays,
      finalPaymentTerms:
        commercial.finalPaymentTerms ??
        pkg.finalPaymentTerms ??
        ({ mode: 'wedding_day' } as const),
      finalPaymentDueDate:
        commercial.finalPaymentDueDate ?? COMPLETE_BRIEF_WEDDING_DATE,
      bridePreparationLocation: LOCATIONS.bridePrep.formattedAddress,
      groomPreparationLocation: LOCATIONS.groomPrep.formattedAddress,
      ceremonyLocation: LOCATIONS.ceremony.formattedAddress,
      receptionLocation: LOCATIONS.reception.formattedAddress,
      preparationLocation: LOCATIONS.bridePrep.formattedAddress,
      workflowStage: 'preparation',
      status: 'active',
    })
  } else {
    wedding = await weddingService.create({
      partner1: COMPLETE_BRIEF_BRIDE_NAME,
      partner2: COMPLETE_BRIEF_GROOM_NAME,
      date: COMPLETE_BRIEF_WEDDING_DATE,
      ceremonyLocation: LOCATIONS.ceremony.formattedAddress,
      receptionLocation: LOCATIONS.reception.formattedAddress,
      packageId: pkg.id,
      packageName: pkg.name,
      price: COMPLETE_BRIEF_CONTRACT_VALUE,
      depositPaid: false,
      depositAmount: COMPLETE_BRIEF_DEPOSIT,
      currency: 'PLN',
      accentColor: pkg.color ?? '#0a0a0a',
      packageItems,
      coverageHours: commercial.coverageHours ?? pkg.coverageHours ?? 12,
      coverageEndTime:
        commercial.coverageEndTime ?? pkg.coverageEndTime ?? '00:30',
      overtimeRate: commercial.overtimeRate ?? pkg.overtimeRate,
      deliveryMonths: commercial.deliveryMonths ?? pkg.deliveryMonths,
      deliveryDays: commercial.deliveryDays ?? pkg.deliveryDays,
      finalPaymentTerms:
        commercial.finalPaymentTerms ??
        pkg.finalPaymentTerms ??
        ({ mode: 'wedding_day' } as const),
      finalPaymentDueDate:
        commercial.finalPaymentDueDate ?? COMPLETE_BRIEF_WEDDING_DATE,
      phone: COMPLETE_BRIEF_FICTIONAL.bridePhone,
      email: COMPLETE_BRIEF_FICTIONAL.brideEmail,
      creationOptions: { preserveImportedPrice: true },
    })
    wedding = await weddingService.update({
      ...wedding,
      couple: {
        ...wedding.couple,
        partner1: COMPLETE_BRIEF_BRIDE_NAME,
        partner2: COMPLETE_BRIEF_GROOM_NAME,
        partner1FirstName: 'Aleksandra',
        partner1LastName: 'Nowak',
        partner2FirstName: 'Michał',
        partner2LastName: 'Kowalski',
        partner1Phone: COMPLETE_BRIEF_FICTIONAL.bridePhone,
        partner2Phone: COMPLETE_BRIEF_FICTIONAL.groomPhone,
        partner1Email: COMPLETE_BRIEF_FICTIONAL.brideEmail,
        partner2Email: COMPLETE_BRIEF_FICTIONAL.groomEmail,
        phone: COMPLETE_BRIEF_FICTIONAL.bridePhone,
        email: COMPLETE_BRIEF_FICTIONAL.brideEmail,
        partner1Address: 'ul. Lipowa 12',
        partner1PostalCode: '30-001',
        partner1City: 'Kraków',
        partner2Address: 'ul. Dębowa 5',
        partner2PostalCode: '30-002',
        partner2City: 'Kraków',
        venue: 'Villa Love',
        city: 'Izdebnik',
      },
      ceremonyTime: '14:30',
      bridePreparationLocation: LOCATIONS.bridePrep.formattedAddress,
      groomPreparationLocation: LOCATIONS.groomPrep.formattedAddress,
      ceremonyLocation: LOCATIONS.ceremony.formattedAddress,
      receptionLocation: LOCATIONS.reception.formattedAddress,
      preparationLocation: LOCATIONS.bridePrep.formattedAddress,
      workflowStage: 'preparation',
    })
    weddingId = wedding.id
  }

  await ensureMarkerNote(wedding.id)
  await ensureOperationalNotes(wedding.id)
  await ensureContacts(wedding.id)
  await ensurePlaces(wedding.id)
  const extras = await ensureExtras(wedding.id, catalogExtras)
  await ensurePayments(wedding.id)
  await ensureTasks(wedding.id)
  await ensureSessions(wedding.id)
  wedding = await ensureCorrespondence(wedding)
  await ensurePreWeddingQuestionnaire(wedding)

  const refreshed = await weddingService.getById(wedding.id)
  if (!refreshed) throw new Error('Nie udało się odświeżyć ślubu brief demo.')
  await persistWeddingContractAnswerFields(refreshed)
  const finalWedding = (await weddingService.getById(wedding.id)) ?? refreshed

  return { wedding: finalWedding, package: pkg, extras }
}
