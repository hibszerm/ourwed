/**
 * Mobile Story phone-app demo fixture.
 * Derived from Landing V2 SoT (juliaMaksymilian + HERO_MODERN_DEMO). Marketing-local only.
 */

import { juliaMaksymilian } from '@/features/landing-v2/narrative'
import { HERO_MODERN_DEMO } from '@/features/landing-v2/hero/heroModernDemoData'

const j = juliaMaksymilian
const w = j.wedding
const ceremony = w.places.ceremony
const reception = w.places.reception
const juliaPrep = w.places.juliaPrep

/** Smallest coherent additions for Wedding Day / Brief — not inventing a new wedding. */
export const mobileOurWedDemo = {
  studio: j.studio,
  greeting: {
    salutation: HERO_MODERN_DEMO.greeting,
    name: j.studio.ownerFirstName,
  },
  dashboard: {
    nearest: {
      /** Mobile V3 hero: type chip (eyebrow hidden). */
      typeLabel: HERO_MODERN_DEMO.nearest.typeLabel,
      coupleName: w.coupleName,
      day: w.date.day,
      month: w.date.month,
      weekday: w.date.weekday,
      time: ceremony.time,
      location: `${juliaPrep.place}, ${juliaPrep.city}`,
      packageName: w.packageName,
      countdownValue: w.countdown.value,
      countdownUnit: w.countdown.unit,
      countdownCaption: w.countdown.caption,
      /** Production dashboardAssignmentRelativeLabel casing; fixture days stay narrative 28. */
      countdownRelative: `Za ${w.countdown.value} dni`,
    },
    tasksLabel: 'Dzisiaj',
    upcomingLabel: 'Kolejne zlecenia',
    inquiriesLabel: 'Nowe zgłoszenia',
    inquiriesSubtitle: '2 oczekuje na zatwierdzenie',
    inquiriesAllLabel: 'Wszystkie',
    deadlinesLabel: 'Terminy oddania',
    notificationsLabel: 'Powiadomienia',
    notificationsSubtitle: '2 nieprzeczytane',
    /** Production DashboardV3InquiriesPanel fields only (no venue). */
    inquiries: [
      {
        id: 'inq-1',
        coupleName: 'Aleksandra i Michał',
        weddingDateLabel: '18 wrz',
        packageName: 'Reportaż Premium',
        submittedLabel: 'Wysłano 12 maj',
      },
      {
        id: 'inq-2',
        coupleName: 'Zuzanna i Filip',
        weddingDateLabel: '7 sie',
        packageName: 'Reportaż',
        submittedLabel: 'Wysłano 14 maj',
      },
    ],
    /**
     * Production DashboardV3DeadlinePanel fields: date marker, title, dueLabel, contextLabel.
     * Relative copy fixed to narrative today ≈ 2027-05-15 (Julia − 28 dni).
     * No deliverable-type line — production row does not show it.
     */
    deadlines: [
      {
        id: 'dl-1',
        coupleName: 'Anna i Michał',
        day: '4',
        month: 'wrz',
        dueLabel: '4 wrz',
        contextLabel: 'za 112 dni',
        state: 'upcoming' as const,
      },
      {
        id: 'dl-2',
        coupleName: 'Karolina i Jan',
        day: '11',
        month: 'wrz',
        dueLabel: '11 wrz',
        contextLabel: 'za 119 dni',
        state: 'upcoming' as const,
      },
      {
        id: 'dl-3',
        coupleName: 'Kasia i Tomek',
        day: '18',
        month: 'wrz',
        dueLabel: '18 wrz',
        contextLabel: 'za 126 dni',
        state: 'upcoming' as const,
      },
    ],
    tasks: HERO_MODERN_DEMO.tasks.slice(0, 2).map((t) => ({
      id: t.id,
      title: t.title,
      meta: t.meta,
      due: t.due,
    })),
    upcoming: HERO_MODERN_DEMO.upcoming.slice(0, 3).map((u) => ({
      id: u.id,
      typeLabel: u.typeLabel,
      coupleName: u.coupleName,
      day: u.day,
      month: u.month,
      time: u.time,
      location: u.location,
      relative: u.relative.startsWith('za ')
        ? `Za ${u.relative.slice(3)}`
        : u.relative,
    })),
    notifications: HERO_MODERN_DEMO.notifications.slice(0, 2).map((n) => ({
      id: n.id,
      title: n.title,
      body: n.message,
      time: n.date,
      unread: n.unread,
    })),
  },
  weddingDay: {
    coupleName: w.coupleName,
    dateLabel: w.longDateShort,
    packageName: w.packageName,
    backLabel: '← Wróć do zlecenia',
    /** Production Cockpit eyebrow — not landing "Teraz". */
    nowLabel: 'Następny punkt',
    nextLabel: 'Następnie',
    now: {
      time: ceremony.time,
      role: ceremony.label,
      place: ceremony.place,
      city: ceremony.city,
      address: `${ceremony.place}, ${ceremony.city}`,
      leg: j.routeLegs[1],
    },
    next: {
      time: reception.time,
      role: reception.label,
      place: reception.place,
      city: reception.city,
      leg: j.routeLegs[2],
    },
    schedule: j.schedule,
    routeLegs: j.routeLegs,
    /** Landing-approved CTA; styled as Cockpit primary (Jedź). */
    navCta: 'Nawiguj',
    planLabel: 'Plan dnia',
    contactsLabel: 'Kontakty',
    /** Minimal couple phones — marketing fixture only (no live tel: wiring). */
    contacts: [
      { name: 'Julia', phone: '+48 512 340 118' },
      { name: 'Maksymilian', phone: '+48 603 771 245' },
    ],
    criticalLabel: 'Nie przegap',
    criticalNotes: [
      { label: 'Zdjęcie grupowe', content: 'Chcemy pod kościołem' },
      { label: 'Ważne podczas ceremonii', content: 'Czytania bliskich' },
      { label: 'Błogosławieństwo', content: 'U Panny Młodej' },
    ],
    briefTitle: 'Wedding Brief',
    briefLabel: 'Brief PDF offline',
    briefSupport: 'Dostępny offline',
    briefOpen: 'Otwórz',
  },
  navigation: {
    backLabel: '← Wróć',
    title: 'Nawigacja',
    /**
     * Destination MUST match the active Wedding Day “Nawiguj” point (Ceremonia),
     * not the later reception (Villa Love).
     * Travel meta = incoming leg to ceremony (routeLegs[1]).
     */
    destination: {
      role: ceremony.label,
      label: ceremony.place,
      city: ceremony.city,
    },
    eta: j.routeLegs[1].duration,
    distance: j.routeLegs[1].distance,
    arrivedLabel: 'Na miejscu',
  },
  brief: {
    /** App chrome title — Polish product copy. */
    appTitle: 'Brief',
    offline: 'Dostępny offline',
    pageIndicator: '1 / 1',
    brand: 'OURWED',
    coupleName: w.coupleName,
    date: w.longDate,
    packageName: w.packageName,
    /** Schedule from Julia/Maksymilian SoT — brief-local place trim for call-sheet width. */
    schedule: j.schedule.map((row) =>
      row.role === 'Ceremonia'
        ? { ...row, place: 'Kościół Piotra i Pawła · Kraków' }
        : row,
    ),
    /** Compact key facts — SoT questionnaire + coverageEnd. */
    facts: [
      { label: 'Goście', value: '120' },
      { label: 'Taniec', value: '19:30' },
      { label: 'First look', value: 'Tak' },
      { label: 'Koniec', value: j.coverageEnd.time },
    ],
    /** Same critical notes as Wedding Day — offline continuity. */
    criticalLabel: 'NIE PRZEGAP',
    criticalNotes: [
      { label: 'Zdjęcie grupowe', content: 'Chcemy pod kościołem' },
      { label: 'Ważne podczas ceremonii', content: 'Czytania bliskich' },
      { label: 'Błogosławieństwo', content: 'U Panny Młodej' },
    ],
    /** Phase 6H.1 — call-sheet contacts (landing demo fixture). */
    contacts: [
      { role: 'Julia', phone: '+48 512 340 118' },
      { role: 'Maksymilian', phone: '+48 603 771 245' },
    ],
    /** Phase 6H.1 — wedding party reference contacts. */
    keyPeople: [
      { role: 'Świadkowa', name: 'Aleksandra Nowak', phone: '+48 502 418 921' },
      { role: 'Świadek', name: 'Michał Kowalski', phone: '+48 608 214 337' },
    ],
    /** Phase 6H.1 — production logistics rows. */
    logistics: [
      { label: 'Parking kościół', value: 'od ul. Grodzkiej' },
      { label: 'Parking sala', value: 'główne wejście' },
      { label: 'Obiad dla ekipy', value: '18:30' },
    ],
    crewNoteLabel: 'UWAGA DLA EKIPY',
    /**
     * Phase 6H.3 — two-line closing note for call-sheet readability (no extra fixture domains).
     */
    crewNoteLines: ['Naturalny reportaż', 'Bez ustawiania podczas ceremonii'] as const,
    /** @deprecated prefer crewNoteLines */
    crewNote: 'Naturalny reportaż · bez ustawiania podczas ceremonii',
    /**
     * @deprecated Phase 6H — legacy Uwagi slot; use crewNote (6H.1).
     */
    notesLabel: 'UWAGI',
    note: '',
    /** @deprecated Phase 6H — removed duplicate “BRIEF PDF OFFLINE” meta. */
    fileLabel: '',
    /** @deprecated Phase 6H — removed duplicate “BRIEF ŚLUBNY” document title. */
    docTitle: '',
    /** @deprecated legacy shape — prefer schedule / facts. */
    title: 'Brief PDF',
    places: [
      {
        label: juliaPrep.label,
        value: `${juliaPrep.place}, ${juliaPrep.city}`,
        time: juliaPrep.time,
      },
      {
        label: w.places.maksPrep.label,
        value: `${w.places.maksPrep.place}, ${w.places.maksPrep.city}`,
        time: w.places.maksPrep.time,
      },
      {
        label: ceremony.label,
        value: `${ceremony.place}, ${ceremony.city}`,
        time: ceremony.time,
      },
      {
        label: reception.label,
        value: `${reception.place}, ${reception.city}`,
        time: reception.time,
      },
    ],
    moments: j.questionnaire.summary,
    coverageEnd: j.coverageEnd,
  },
} as const

export type MobileOurWedDemo = typeof mobileOurWedDemo
