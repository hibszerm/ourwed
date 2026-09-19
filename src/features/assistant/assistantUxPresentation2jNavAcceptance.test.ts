/**
 * Phase 2J — Assistant navigation parity with wedding Logistics Nawiguj.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildGoogleMapsNavigationUrl,
  resolveNavigationDestinationAddress,
} from '@/services/googleMapsLinks'
import { navigateToStopUrl, type TravelStop } from '@/features/travel/travelUi'
import { executeAssistantAction } from './v7/presentation/executeAssistantAction'
import { projectV7PresentationTurn } from './v7/presentation/projectV7Presentation'
import { V7ResourceSetStore } from './v7/resourceSet/store'
import type { V7TurnResult } from './v7/agent/loop'
import type { V7SessionBinding } from './v7/resourceSet/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../../..')
const WEDDING_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function src(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8')
}

function destinationFromHref(href: string): string | null {
  try {
    const u = new URL(href)
    return u.searchParams.get('destination')
  } catch {
    return null
  }
}

function emptyLatency(): V7TurnResult['latency'] {
  return {
    firstModelMs: null,
    toolExecutionMs: [],
    subsequentModelMs: [],
    finalResponseMs: null,
    totalMs: 1,
  }
}

function baseResult(
  overrides: Partial<V7TurnResult> & { toolCalls: V7TurnResult['toolCalls'] },
): V7TurnResult {
  return {
    ok: true,
    userText: 'adres',
    toolCallCount: overrides.toolCalls.length,
    stoppedReason: 'final',
    latency: emptyLatency(),
    model: 'gpt-5.6-terra',
    ...overrides,
  }
}

function makeStore(ids: string[]) {
  const binding: V7SessionBinding = {
    sessionId: 'v7-nav-2j',
    tenantKey: 'tenant-test',
  }
  const store = new V7ResourceSetStore(binding)
  const created = store.create({
    resourceType: 'wedding',
    memberIds: ids,
    description: 'nav',
  })
  return { store, handle: created.handle, binding }
}

describe('Assistant UX 2J navigation parity', () => {
  it('NAV TEST 1 — display label is NOT part of map destination', () => {
    const address = 'Poznańska 1A, 62-060 Trzebaw'
    // Even if a role label is wrongly supplied, executor strips it.
    const r = executeAssistantAction(
      {
        type: 'navigate_address',
        address,
        label: 'Przygotowania pana młodego',
      },
      { apply: false },
    )
    expect(r.ok).toBe(true)
    if (!r.ok || r.mode !== 'external') throw new Error('expected external')
    const dest = destinationFromHref(r.href)
    expect(dest).toBe(address)
    expect(dest!).not.toContain('Przygotowania pana młodego')
    expect(r.href).toContain('/maps/dir/')
    expect(r.href).toContain('dir_action=navigate')
  })

  it('NAV TEST 1b — projected groom prep omits role label from action', () => {
    const { store, handle, binding } = makeStore([WEDDING_A])
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'inspect_resource',
            args: {
              handle,
              ordinal: 1,
              concepts: ['PLACE.GROOM_PREP_ADDRESS'],
            },
            result: {
              ok: true,
              handle,
              ordinal: 1,
              display_name: 'Martyna i Damian',
              fields: [
                {
                  concept: 'PLACE.GROOM_PREP_ADDRESS',
                  value: 'Poznańska 1A, 62-060 Trzebaw',
                  display_text: 'Poznańska 1A, 62-060 Trzebaw',
                  filled: true,
                  privacy: 'PII',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'A jego adres przygotowań?',
    })
    const addrRefs = (p.references ?? []).filter((r) => r.kind === 'address')
    expect(addrRefs).toHaveLength(1)
    expect(addrRefs[0]!.label).toBe('Przygotowania pana młodego')
    const action = addrRefs[0]!.actions[0]!
    expect(action.type).toBe('navigate_address')
    if (action.type !== 'navigate_address') throw new Error('nav')
    expect(action.address).toBe('Poznańska 1A, 62-060 Trzebaw')
    expect(action.label).toBeUndefined()

    const exec = executeAssistantAction(action, { apply: false })
    expect(exec.ok).toBe(true)
    if (!exec.ok || exec.mode !== 'external') throw new Error('external')
    const dest = destinationFromHref(exec.href)
    expect(dest).toBe('Poznańska 1A, 62-060 Trzebaw')
    expect(dest!).not.toContain('Przygotowania')
    expect(exec.href).toContain('/maps/dir/')
    expect(exec.href).toContain('dir_action=navigate')
  })

  it('NAV TEST 2 — Assistant and Logistics use the same navigation primitive', () => {
    const execSrc = src(
      'src/features/assistant/v7/presentation/executeAssistantAction.ts',
    )
    expect(execSrc).toContain('buildGoogleMapsNavigationUrl')
    expect(execSrc).not.toContain('googleMapsPlaceUrl')
    const travel = src('src/features/travel/travelUi.ts')
    expect(travel).toContain('buildGoogleMapsNavigationUrl')
    const shared = src('src/services/googleMapsLinks.ts')
    expect(shared).toContain('export function buildGoogleMapsNavigationUrl')
  })

  it('NAV TEST 3 — coordinates/address priority identical to Logistics', () => {
    const dest = {
      formattedAddress: 'Poznańska 1A, 62-060 Trzebaw',
      label: 'Villa Love',
      placeId: 'ChIJtest',
      latitude: 52.2,
      longitude: 16.9,
    }
    const logistics = buildGoogleMapsNavigationUrl(dest)
    const assistant = executeAssistantAction(
      {
        type: 'navigate_address',
        address: dest.formattedAddress,
        label: dest.label,
      },
      { apply: false },
    )
    expect(logistics).toBeTruthy()
    expect(assistant.ok).toBe(true)
    if (!assistant.ok || assistant.mode !== 'external') throw new Error('ext')
    expect(destinationFromHref(assistant.href)).toBe(
      destinationFromHref(logistics!),
    )
    expect(
      buildGoogleMapsNavigationUrl({
        latitude: 52.2,
        longitude: 16.9,
      }),
    ).toBeNull()
    expect(
      resolveNavigationDestinationAddress({
        latitude: 52.2,
        longitude: 16.9,
      }),
    ).toBeNull()
  })

  it('NAV TEST 4 — two Navigate actions map to two correct destinations', () => {
    const { store, handle, binding } = makeStore([WEDDING_A])
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'inspect_resource',
            args: { handle, ordinal: 1 },
            result: {
              ok: true,
              handle,
              ordinal: 1,
              display_name: 'X',
              fields: [
                {
                  concept: 'PLACE.BRIDE_PREP_ADDRESS',
                  value: 'ul. A 1, Kraków',
                  filled: true,
                  privacy: 'PII',
                },
                {
                  concept: 'PLACE.GROOM_PREP_ADDRESS',
                  value: 'Poznańska 1A, 62-060 Trzebaw',
                  filled: true,
                  privacy: 'PII',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'adresy',
    })
    const navs = (p.references ?? [])
      .filter((r) => r.kind === 'address')
      .map((r) => r.actions.find((a) => a.type === 'navigate_address'))
      .filter(Boolean)
    expect(navs).toHaveLength(2)
    const hrefs = navs.map((a) => {
      const r = executeAssistantAction(a!, { apply: false })
      expect(r.ok).toBe(true)
      if (!r.ok || r.mode !== 'external') throw new Error('ext')
      return destinationFromHref(r.href)
    })
    expect(hrefs.sort()).toEqual(
      ['Poznańska 1A, 62-060 Trzebaw', 'ul. A 1, Kraków'].sort(),
    )
    for (const h of hrefs) {
      expect(h!).not.toMatch(/Przygotowania/)
    }
  })

  it('NAV TEST 5 — no action invented from assistant prose', () => {
    const { store, binding } = makeStore([WEDDING_A])
    const p = projectV7PresentationTurn({
      result: baseResult({
        finalText:
          'Adres przygotowań Damiana: Poznańska 1A, 62-060 Trzebaw. Nawiguj tam.',
        toolCalls: [],
      }),
      store,
      binding,
      utterance: 'adres',
    })
    const navs = (p.references ?? []).flatMap((r) =>
      r.actions.filter((a) => a.type === 'navigate_address'),
    )
    expect(navs).toHaveLength(0)
  })

  it('NAV TEST 6 — existing wedding logistics behavior unchanged', () => {
    const stop: TravelStop = {
      key: 'groom_prep',
      title: 'Przygotowania pana młodego',
      label: 'Villa Love',
      address: 'Poznańska 1A, 62-060 Trzebaw',
      placeId: 'ChIJtest',
      latitude: 52.2,
      longitude: 16.9,
      kind: 'wedding_place',
      navigateLabel: 'Nawiguj do Villa Love',
    }
    const url = navigateToStopUrl(stop)
    expect(url).toBeTruthy()
    expect(destinationFromHref(url!)).toBe(
      'Villa Love, Poznańska 1A, 62-060 Trzebaw',
    )
    expect(url!).toContain('dir_action=navigate')
    expect(destinationFromHref(url!)!).toContain('Villa Love')
  })

  it('NAV ceremony / reception — clean destination only', () => {
    const { store, handle, binding } = makeStore([WEDDING_A])
    for (const [concept, displayLabel, address] of [
      [
        'PLACE.CEREMONY_ADDRESS',
        'Adres ceremonii',
        'Kościół św. Jana, Kraków',
      ],
      [
        'PLACE.RECEPTION_ADDRESS',
        'Adres przyjęcia',
        'Sala Bankietowa, Kraków',
      ],
    ] as const) {
      const p = projectV7PresentationTurn({
        result: baseResult({
          toolCalls: [
            {
              name: 'inspect_resource',
              args: { handle, ordinal: 1 },
              result: {
                ok: true,
                handle,
                ordinal: 1,
                display_name: 'X',
                fields: [
                  {
                    concept,
                    value: address,
                    filled: true,
                    privacy: 'PII',
                  },
                ],
              },
            },
          ],
        }),
        store,
        binding,
        utterance: 'adres',
      })
      const ref = (p.references ?? []).find((r) => r.kind === 'address')
      expect(ref?.label).toBe(displayLabel)
      const action = ref?.actions[0]
      expect(action?.type).toBe('navigate_address')
      if (!action || action.type !== 'navigate_address') throw new Error('nav')
      expect(action.label).toBeUndefined()
      const exec = executeAssistantAction(action, { apply: false })
      if (!exec.ok || exec.mode !== 'external') throw new Error('ext')
      expect(destinationFromHref(exec.href)).toBe(address)
    }
  })
})
