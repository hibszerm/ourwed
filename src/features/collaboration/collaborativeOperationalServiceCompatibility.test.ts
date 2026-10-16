import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { supabase } from '@/lib/supabase'
import { collaborativeOperationalService } from './collaborativeOperationalService'
import { CollaborativeReadError } from './collaborativeReadError'

const root = join(fileURLToPath(new URL('../../../', import.meta.url)))
const legacyPage = readFileSync(join(root, 'src/features/collaboration/CollaborativeWeddingPages.tsx'), 'utf8')
const roles = ['bride_preparation', 'groom_preparation', 'ceremony', 'reception'] as const
const basePlace = (role: typeof roles[number]) => ({
  role,
  formatted_address: 'Test address',
  address_version: '1',
  operational_time_override: null,
  effective_operational_time: null,
  time_source: 'none',
  time_version: null,
})
let passed = 0
function check(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL collaborative operational response compatibility — ${message}`)
  passed += 1
}

const originalRpc = Object.getOwnPropertyDescriptor(supabase, 'rpc')
async function parse(data: unknown) {
  Object.defineProperty(supabase, 'rpc', {
    configurable: true,
    value: async (requested: string) => {
      if (requested !== 'get_collaborative_wedding_operational_edit_state') throw new Error(`unexpected RPC: ${requested}`)
      return { data, error: null }
    },
  })
  return collaborativeOperationalService.getEditState('21000000-0000-4000-8000-000000000001')
}

try {
  const oldShape = { wedding_id: '21000000-0000-4000-8000-000000000001', places: roles.map(basePlace) }
  const oldParsed = await parse(oldShape)
  check(oldParsed.places.length === 4 && oldParsed.places[0].name === null && oldParsed.places[0].name_version === null,
    'previously valid H1 place response remains supported')

  const currentShape = {
    wedding_id: oldShape.wedding_id,
    places: roles.map((role) => ({ ...basePlace(role), name: 'Ceremony', name_version: '3' })),
  }
  const currentParsed = await parse(currentShape)
  check(currentParsed.places[0].name === 'Ceremony' && currentParsed.places[0].name_version === '3',
    'frozen current H1 name fields parse as typed values')

  for (const invalid of [
    { ...oldShape, places: roles.map((role) => ({ ...basePlace(role), formatted_address: 42 })) },
    { ...currentShape, places: roles.map((role) => ({ ...basePlace(role), name: 42, name_version: '3' })) },
    { ...currentShape, places: roles.map((role) => ({ ...basePlace(role), name: 'Ceremony' })) },
    { ...oldShape, places: roles.map((role) => ({ ...basePlace(role), unexpected_sensitive_field: 'private' })) },
  ]) {
    try {
      await parse(invalid)
      check(false, 'malformed or unexpected response must reject')
    } catch (error) {
      check(error instanceof CollaborativeReadError && error.kind === 'UNKNOWN',
        'malformed required fields and non-contract keys remain rejected')
    }
  }

  check(!/name[-_ ]?(?:input|edit)|(?:input|edit)[-_ ]?name/i.test(legacyPage),
    'legacy page adds no collaborative name editor')
  check(legacyPage.includes('Nie udało się odświeżyć danych edycji. Spróbuj ponownie.')
    && legacyPage.includes('editState.refetch()'), 'existing edit-state retry behavior remains in place')

  Object.defineProperty(supabase, 'rpc', {
    configurable: true,
    value: async () => ({ data: null, error: { code: 'P0001', message: 'UNAVAILABLE', status: 400 } }),
  })
  try {
    await collaborativeOperationalService.getEditState('21000000-0000-4000-8000-000000000001')
    check(false, 'authoritative access loss must reject')
  } catch (error) {
    check(error instanceof CollaborativeReadError && error.kind === 'UNAVAILABLE',
      'authoritative access-loss handling remains unchanged')
  }
} finally {
  if (originalRpc) Object.defineProperty(supabase, 'rpc', originalRpc)
  else delete (supabase as unknown as { rpc?: unknown }).rpc
}

console.log(`PASS collaborative operational response compatibility (${passed} assertions)`)
