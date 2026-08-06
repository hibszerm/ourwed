/**
 * Single source of truth for MobileWeddingDaySection demo content.
 * Itinerary, assignment next-stop, navigation leg, and brief all derive from this.
 */

export type MobileDemoStopId =
  | 'start'
  | 'groom-preparations'
  | 'bride-preparations'
  | 'ceremony'
  | 'reception'

export type MobileDemoTravelLeg = {
  durationMinutes: number
  distanceKm: number
}

export type MobileDemoStop = {
  id: MobileDemoStopId
  time: string
  title: string
  location: string
  /** Travel from the previous stop into this stop. */
  inboundTravel: MobileDemoTravelLeg | null
  /** Highlighted as the current / next focus in the itinerary. */
  current: boolean
}

export type MobileDemoContact = {
  name: string
  role: string
}

export const mobileWeddingDayDemo = {
  couple: 'Julia i Adrian',
  date: '12 czerwca 2027',
  /** Wedding reception venue — not the navigation destination. */
  receptionVenue: 'Folwark Wąsowo',
  stops: [
    {
      id: 'start' as const,
      time: '09:00',
      title: 'Start',
      location: 'Studio, Poznań',
      inboundTravel: null,
      current: false,
    },
    {
      id: 'groom-preparations' as const,
      time: '09:30',
      title: 'Przygotowania Pana Młodego',
      location: 'Apartamenty Stary Rynek',
      inboundTravel: { durationMinutes: 18, distanceKm: 12 },
      current: false,
    },
    {
      id: 'bride-preparations' as const,
      time: '10:30',
      title: 'Przygotowania Panny Młodej',
      location: 'Hotel Liberté',
      inboundTravel: { durationMinutes: 21, distanceKm: 16 },
      current: true,
    },
    {
      id: 'ceremony' as const,
      time: '14:00',
      title: 'Ceremonia',
      location: 'Kościół św. Anny',
      inboundTravel: { durationMinutes: 24, distanceKm: 18 },
      current: false,
    },
    {
      id: 'reception' as const,
      time: '16:00',
      title: 'Przyjęcie weselne',
      location: 'Folwark Wąsowo',
      inboundTravel: { durationMinutes: 17, distanceKm: 11 },
      current: false,
    },
  ] satisfies MobileDemoStop[],
  /** Navigation opens the leg into the current next stop. */
  navigationDestinationStopId: 'bride-preparations' as const,
  contacts: [
    { name: 'Julia', role: 'Panna Młoda' },
    { name: 'Adrian', role: 'Pan Młody' },
    { name: 'Marta', role: 'Świadkowa' },
  ] satisfies MobileDemoContact[],
  shotList: [
    'First look',
    'Życzenia po ceremonii',
    'Zdjęcie z rodzicami',
    'Zimne ognie',
  ] as const,
  firstDance: {
    label: 'Pierwszy taniec',
    time: '20:15',
  },
  brief: {
    eyebrow: 'Brief dnia',
    status: 'Wszystko, co najważniejsze',
    footer: 'Brief zawsze pod ręką',
  },
  navigation: {
    mapLabel: 'Podgląd trasy',
    openingStatus: 'Otwieranie w Google Maps…',
    openedStatus: 'Nawigacja otwarta',
  },
} as const

export type MobileWeddingDayDemo = typeof mobileWeddingDayDemo

function formatTravel(leg: MobileDemoTravelLeg): string {
  return `${leg.durationMinutes} min · ${leg.distanceKm} km`
}

function stopById(id: MobileDemoStopId): MobileDemoStop {
  const stop = mobileWeddingDayDemo.stops.find((s) => s.id === id)
  if (!stop) throw new Error(`Missing mobile demo stop: ${id}`)
  return stop
}

function previousStop(id: MobileDemoStopId): MobileDemoStop {
  const index = mobileWeddingDayDemo.stops.findIndex((s) => s.id === id)
  if (index <= 0) throw new Error(`No previous stop for: ${id}`)
  return mobileWeddingDayDemo.stops[index - 1]!
}

/** Next highlighted stop on the assignment screen. */
export function getMobileNextStop() {
  const stop = stopById(mobileWeddingDayDemo.navigationDestinationStopId)
  return {
    time: stop.time,
    title: stop.title,
    location: stop.location,
  }
}

/**
 * Active navigation leg: previous itinerary location → next stop.
 * Apartamenty Stary Rynek → Hotel Liberté.
 */
export function getMobileNavigationLeg() {
  const destination = stopById(
    mobileWeddingDayDemo.navigationDestinationStopId,
  )
  const origin = previousStop(destination.id)
  const travel = destination.inboundTravel
  if (!travel) {
    throw new Error('Navigation destination is missing inbound travel')
  }

  return {
    from: origin.location,
    to: destination.location,
    fromLabel: 'z Apartamentów Stary Rynek',
    duration: `${travel.durationMinutes} min`,
    distance: `${travel.distanceKm} km`,
    durationMinutes: travel.durationMinutes,
    distanceKm: travel.distanceKm,
    summaryLine: `${origin.location} → ${destination.location}`,
    metricsLine: formatTravel(travel),
    mapLabel: mobileWeddingDayDemo.navigation.mapLabel,
    openingStatus: mobileWeddingDayDemo.navigation.openingStatus,
    openedStatus: mobileWeddingDayDemo.navigation.openedStatus,
  }
}

/** Itinerary rows for the secondary phone. */
export function getMobileItineraryRows() {
  return mobileWeddingDayDemo.stops.map((stop) => ({
    id: stop.id,
    time: stop.time,
    title: stop.title,
    place: stop.location,
    travel: stop.inboundTravel ? formatTravel(stop.inboundTravel) : null,
    current: stop.current,
  }))
}

/** Brief content derived from the same demo object. */
export function getMobileBriefContent() {
  const next = getMobileNextStop()
  const leg = getMobileNavigationLeg()
  const demo = mobileWeddingDayDemo

  return {
    eyebrow: demo.brief.eyebrow,
    title: demo.couple,
    meta: demo.date,
    status: demo.brief.status,
    nextStop: next,
    routeSummary: {
      line: leg.summaryLine,
      metrics: leg.metricsLine,
    },
    contacts: demo.contacts,
    shotList: demo.shotList,
    firstDance: demo.firstDance,
    footer: demo.brief.footer,
  }
}
