/**
 * Contract Questionnaire location fields must use the shared GeoPlace UX
 * (same as Pre-Wedding): LocationSearchField → SelectedLocationCard.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  answerToGeoPlace,
  formatLocationAnswerDisplay,
  geoPlaceToAnswer,
  isManualLocationAnswer,
} from '@/features/prewedding/preweddingLocation'
import {
  buildContractAnswerList,
  buildContractAnswerSections,
} from '@/features/questionnaires/contractAnswerSummary'
import { formatLocationAnswer } from '@/lib/forms/contractQuestionnaireSnapshot'
import { formEngine } from '@/lib/forms/formEngine'
import {
  normalizeLocationAnswer,
  mergeLocationAnswerWithExisting,
  getWeddingLocationDisplay,
} from '@/features/travel/weddingLocationModel'
import { ensureQuestionnaireBlocks } from '@/lib/forms/questionnaireBlocks'
import { defaultContractQuestionnaireConfig } from '@/types/contractQuestionnaire'
import type { FormAnswerJson } from '@/types/formEngine'
import type { FormInstanceOptionsSnapshot } from '@/types/contractQuestionnaire'
import type { FormTemplate } from '@/types/form'
import type { GeoPlace } from '@/types/travel'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
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

const VILLA: GeoPlace = {
  placeId: 'ChIJ_villa_love',
  formattedAddress: 'Lwowska 78, 34-144 Izdebnik',
  latitude: 49.8123,
  longitude: 19.7456,
  label: 'Villa Love',
  provider: 'google',
}

function snapshotWithLocations(): FormInstanceOptionsSnapshot {
  const config = ensureQuestionnaireBlocks(defaultContractQuestionnaireConfig())
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    packageOptions: [],
    additionalServiceOptions: [],
    config,
  }
}

run('1. QuestionField wires QuestionnaireLocationField (not AddressField)', () => {
  const qf = readFileSync(
    resolve(process.cwd(), 'src/features/forms/QuestionField.tsx'),
    'utf8',
  )
  assert(qf.includes('QuestionnaireLocationField'), 'shared field')
  assert(!qf.includes('AddressField'), 'no AddressField')
  assert(qf.includes("question.type === 'location'"), 'location type')
})

run('2. QuestionnaireLocationField uses search + SelectedLocationCard', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/QuestionnaireLocationField.tsx'),
    'utf8',
  )
  assert(src.includes('LocationSearchField'), 'search')
  assert(src.includes('SelectedLocationCard'), 'card')
  assert(src.includes('geoPlaceToAnswer'), 'persist GeoPlace')
  assert(src.includes('shouldShowCard'), 'card replaces search')
})

run('3. Selecting a venue preserves name + address + coordinates (GeoPlace)', () => {
  const stored = geoPlaceToAnswer(VILLA)
  assert(typeof stored !== 'string', 'object')
  if (typeof stored === 'string') return
  assertEq(stored.label, 'Villa Love', 'venue name')
  assertEq(stored.formattedAddress, 'Lwowska 78, 34-144 Izdebnik', 'address')
  assertEq(stored.placeId, 'ChIJ_villa_love', 'placeId')
  assertEq(stored.latitude, 49.8123, 'lat')
  assertEq(stored.longitude, 19.7456, 'lng')
  const display = getWeddingLocationDisplay(stored)
  assertEq(display.primary, 'Villa Love', 'primary name')
  assert(
    Boolean(display.secondary?.includes('Lwowska')),
    'secondary address',
  )
})

run('4. formatLocationAnswer keeps venue name (not street-only)', () => {
  const text = formatLocationAnswer(VILLA)
  assert(text.includes('Villa Love'), 'name kept')
  assert(text.includes('Lwowska'), 'address kept')
  assertEq(
    formatLocationAnswerDisplay(VILLA),
    'Villa Love — Lwowska 78, 34-144 Izdebnik',
    'display',
  )
})

run('5. Wedding places sync receives full GeoPlace (name not overwritten)', () => {
  const incoming = normalizeLocationAnswer(geoPlaceToAnswer(VILLA))
  assertEq(incoming.name, 'Villa Love', 'name')
  assertEq(incoming.formattedAddress, 'Lwowska 78, 34-144 Izdebnik', 'address')
  assertEq(incoming.placeId, 'ChIJ_villa_love', 'placeId')
  assertEq(incoming.latitude, 49.8123, 'lat')

  const merged = mergeLocationAnswerWithExisting(incoming, null)
  assertEq(merged.label, 'Villa Love', 'merged label')
  assertEq(merged.formattedAddress, 'Lwowska 78, 34-144 Izdebnik', 'merged addr')
})

run('6. Answer fields keep structured GeoPlace for wedding import', () => {
  // answersToFieldMap / submit stores GeoPlace under field keys — not flattened text.
  const stored = geoPlaceToAnswer(VILLA)
  const fields: Record<string, unknown> = {
    receptionLocation: stored,
    ceremonyLocation: 'ul. Ręczna 1, Kraków',
  }
  const reception = fields.receptionLocation
  assert(typeof reception === 'object' && reception != null, 'structured')
  const geo = answerToGeoPlace(reception)
  assertEq(geo?.label, 'Villa Love', 'import name')
  assertEq(geo?.formattedAddress, 'Lwowska 78, 34-144 Izdebnik', 'import addr')
  assertEq(geo?.latitude, 49.8123, 'import lat')
  // Scalar format for wedding columns keeps name — places sync gets the object.
  assert(formatLocationAnswer(reception).includes('Villa Love'), 'scalar has name')
  assertEq(
    normalizeLocationAnswer(reception).name,
    'Villa Love',
    'places sync name',
  )
})

run('7. Contract answer summary renders location kind with raw GeoPlace', () => {
  const snapshot = snapshotWithLocations()
  const receptionBlock = (snapshot.config?.blocks ?? []).find(
    (b) => b.type === 'location' && b.locationRole === 'reception',
  )
  assert(Boolean(receptionBlock), 'reception block')
  const answerJson: FormAnswerJson = {
    fields: {
      receptionLocation: geoPlaceToAnswer(VILLA),
    },
    values: receptionBlock
      ? { [receptionBlock.id]: geoPlaceToAnswer(VILLA) }
      : undefined,
  }
  const items = buildContractAnswerList(answerJson, snapshot)
  const reception = items.find((i) => i.fieldKey === 'receptionLocation')
  assert(Boolean(reception), 'item')
  assertEq(reception?.kind, 'location', 'kind')
  assert(reception?.value.includes('Villa Love') ?? false, 'value has name')
  const geo = answerToGeoPlace(reception?.locationRaw)
  assertEq(geo?.label, 'Villa Love', 'raw label')
  assert(!isManualLocationAnswer(reception?.locationRaw), 'google place')
})

run('8. Historical text-only answers still render gracefully', () => {
  const snapshot = snapshotWithLocations()
  const ceremonyBlock = (snapshot.config?.blocks ?? []).find(
    (b) => b.type === 'location' && b.locationRole === 'ceremony',
  )
  const answerJson: FormAnswerJson = {
    fields: {
      ceremonyLocation: 'Kościół pw. św. Anny, Kraków',
    },
    values: ceremonyBlock
      ? { [ceremonyBlock.id]: 'Kościół pw. św. Anny, Kraków' }
      : undefined,
  }
  const items = buildContractAnswerList(answerJson, snapshot)
  const ceremony = items.find((i) => i.fieldKey === 'ceremonyLocation')
  assert(Boolean(ceremony), 'ceremony item')
  assertEq(ceremony?.kind, 'location', 'kind')
  assert(
    ceremony?.value.includes('Kościół') ?? false,
    'plain text display',
  )
  const geo = answerToGeoPlace(ceremony?.locationRaw)
  assert(Boolean(geo?.formattedAddress), 'geo from string')
  assert(isManualLocationAnswer(ceremony?.locationRaw), 'manual')
})

run('9. Wedding Details answers component uses SelectedLocationCard', () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingContractQuestionnaireAnswers.tsx',
    ),
    'utf8',
  )
  assert(src.includes('SelectedLocationCard'), 'card')
  assert(src.includes("item.kind === 'location'"), 'location branch')
  assert(src.includes('answerToGeoPlace'), 'geo helper')
})

run('10. Required location validation accepts GeoPlace with label+address', () => {
  const template: FormTemplate = {
    id: 't',
    type: 'contract_questionnaire',
    title: 'T',
    description: '',
    questions: [
      {
        id: 'loc1',
        type: 'location',
        label: 'Sala',
        required: true,
        fieldKey: 'receptionLocation',
      },
    ],
    successTitle: '',
    successDescription: '',
    submitLabel: 'Wyślij',
  }
  const ok = formEngine.validateAnswers(template, {
    loc1: geoPlaceToAnswer(VILLA) as never,
  })
  assertEq(Object.keys(ok).length, 0, 'geo ok')

  const empty = formEngine.validateAnswers(template, { loc1: '' })
  assertEq(empty.loc1, 'Wymagane', 'empty required')

  const legacyNorm = formEngine.validateAnswers(template, {
    loc1: {
      formattedAddress: 'ul. Testowa 1',
      name: 'Sala',
      provider: 'google',
      placeId: 'x',
    } as never,
  })
  assertEq(Object.keys(legacyNorm).length, 0, 'NormalizedAddress ok')
})

run('11. Answer sections keep locationRaw for card rendering', () => {
  const snapshot = snapshotWithLocations()
  const answerJson: FormAnswerJson = {
    fields: {
      receptionLocation: geoPlaceToAnswer(VILLA),
      ceremonyLocation: 'ul. Stara 1',
    },
  }
  const sections = buildContractAnswerSections(answerJson, snapshot)
  const flat = sections.flatMap((s) => s.items).filter((i) => i.kind === 'location')
  assert(flat.length >= 1, 'has location items')
  for (const item of flat) {
    assert(item.locationRaw !== undefined, `raw for ${item.fieldKey}`)
  }
})

console.log('\nContract location GeoPlace acceptance done.')
