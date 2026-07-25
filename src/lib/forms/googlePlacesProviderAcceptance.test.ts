/**
 * Google Places provider acceptance (post Geoapify removal).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type {
  AddressAutocompleteProvider,
  NormalizedAddress,
} from '@/services/addressAutocompleteProvider'
import {
  createDefaultAddressAutocompleteProvider,
  readAddressProviderId,
  resolveAddressAutocompleteProvider,
} from '@/services/addressProviderResolver'
import { createGooglePlacesAddressProvider } from '@/services/googlePlacesAddressProvider'
import {
  GOOGLE_PLACES_MIN_QUERY_LENGTH,
  GOOGLE_USER_ERROR_PL,
  mapGooglePlaceToNormalized,
  mapGoogleSuggestionsToAddressSuggestions,
  stripRawGoogleFields,
} from '@/services/googlePlacesNormalize'
import { formatLocationAnswer } from '@/lib/forms/contractQuestionnaireSnapshot'

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

function run(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => console.log(`PASS  ${name}`))
    .catch((err) => {
      console.error(`FAIL  ${name}`)
      console.error(err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
}

const polishPlace = {
  id: 'ChIJtestWarsaw',
  formattedAddress: 'ul. Marszałkowska 1, 00-001 Warszawa, Polska',
  addressComponents: [
    { longText: 'Marszałkowska', shortText: 'Marszałkowska', types: ['route'] },
    { longText: '1', shortText: '1', types: ['street_number'] },
    { longText: '12', shortText: '12', types: ['subpremise'] },
    { longText: '00-001', shortText: '00-001', types: ['postal_code'] },
    { longText: 'Warszawa', shortText: 'Warszawa', types: ['locality', 'political'] },
    {
      longText: 'mazowieckie',
      shortText: 'MZ',
      types: ['administrative_area_level_1', 'political'],
    },
    { longText: 'Polska', shortText: 'PL', types: ['country', 'political'] },
  ],
  location: { latitude: 52.2297, longitude: 21.0122 },
}

async function main() {
  await run('1. Google provider implements AddressAutocompleteProvider', () => {
    const provider: AddressAutocompleteProvider =
      createGooglePlacesAddressProvider({
        invoke: async () => ({ ok: true, operation: 'autocomplete', suggestions: [] }),
      })
    assert(typeof provider.search === 'function', 'search')
    assert(typeof provider.resolve === 'function', 'resolve')
    assertEq(provider.kind, 'google', 'kind')
  })

  await run('2. Autocomplete maps to AddressSuggestion', () => {
    const suggestions = mapGoogleSuggestionsToAddressSuggestions(
      [
        {
          placePrediction: {
            placeId: 'ChIJ1',
            structuredFormat: {
              mainText: { text: 'Rynek Główny' },
              secondaryText: { text: 'Kraków, Polska' },
            },
          },
        },
      ],
      8,
    )
    assertEq(suggestions[0].id, 'google:ChIJ1', 'id')
    assertEq(suggestions[0].label, 'Rynek Główny', 'label')
  })

  await run('3–4. Place resolution + Polish components', () => {
    const addr = mapGooglePlaceToNormalized(polishPlace)
    assertEq(addr.city, 'Warszawa', 'city')
    assertEq(addr.street, 'Marszałkowska', 'street')
    assertEq(addr.provider, 'google', 'provider')
  })

  await run('5. Raw Google data stripped', () => {
    const raw = {
      ...mapGooglePlaceToNormalized(polishPlace),
      addressComponents: polishPlace.addressComponents,
    } as NormalizedAddress & Record<string, unknown>
    const clean = stripRawGoogleFields(raw)
    assert(!('addressComponents' in clean), 'stripped')
  })

  await run('6–7. Session token lifecycle', async () => {
    const calls: Array<Record<string, unknown>> = []
    const provider = createGooglePlacesAddressProvider({
      invoke: async (body) => {
        calls.push(body)
        if (body.operation === 'autocomplete') {
          return {
            ok: true,
            operation: 'autocomplete',
            suggestions: [{ id: 'google:ChIJ1', label: 'Test' }],
          }
        }
        return {
          ok: true,
          operation: 'resolve',
          address: mapGooglePlaceToNormalized(polishPlace),
        }
      },
    })
    const t1 = provider.beginSession!()
    await provider.search('Warszawa centrum', { sessionToken: t1 })
    await provider.resolve('google:ChIJ1', { sessionToken: t1 })
    assertEq(calls[0].sessionToken, t1, 'same token')
    assertEq(calls[1].sessionToken, t1, 'resolve token')
    const t2 = provider.beginSession!()
    assert(t2 !== t1, 'new session')
  })

  await run('8. Browser never receives GOOGLE_MAPS_API_KEY', () => {
    for (const rel of [
      'src/services/googlePlacesAddressProvider.ts',
      'src/services/travelProvider.ts',
      'src/features/forms/AddressField.tsx',
      '.env.example',
    ]) {
      const src = readFileSync(resolve(process.cwd(), rel), 'utf8')
      assert(!/GOOGLE_MAPS_API_KEY\s*=\s*['"]?AIza/.test(src), rel)
      if (rel.startsWith('src/')) {
        assert(!src.includes('import.meta.env.VITE_GOOGLE'), rel)
      }
    }
  })

  await run('9. Proxy rejects unsupported ops', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'supabase/functions/places-proxy/index.ts'),
      'utf8',
    )
    assert(src.includes('unsupported_operation'), 'reject')
    assert(src.includes("'geocode'"), 'geocode op')
  })

  await run('10–11. Abort + min query', () => {
    assertEq(GOOGLE_PLACES_MIN_QUERY_LENGTH, 3, 'min 3')
    const field = readFileSync(
      resolve(process.cwd(), 'src/features/forms/AddressField.tsx'),
      'utf8',
    )
    assert(field.includes('AbortController'), 'abort')
  })

  await run('12. Manual fallback message', () => {
    assert(GOOGLE_USER_ERROR_PL.includes('ręcznie'), 'pl message')
    assertEq(
      formatLocationAnswer('ul. Testowa 1'),
      'ul. Testowa 1',
      'manual',
    )
  })

  await run('13–14. Desktop/mobile UX preserved', () => {
    const field = readFileSync(
      resolve(process.cwd(), 'src/features/forms/AddressField.tsx'),
      'utf8',
    )
    assert(field.includes('ResponsiveFieldOverlay'), 'desktop')
    assert(field.includes('MobileFieldDialog'), 'mobile')
  })

  await run('resolver always Google', () => {
    assertEq(readAddressProviderId({}), 'google', 'default')
    assertEq(
      readAddressProviderId({ VITE_ADDRESS_PROVIDER: 'geoapify' }),
      'google',
      'deprecated maps to google',
    )
    assertEq(resolveAddressAutocompleteProvider().kind, 'google', 'kind')
    assertEq(createDefaultAddressAutocompleteProvider().kind, 'google', 'factory')
  })

  console.log('\ngoogle places provider acceptance: done')
}

main()
