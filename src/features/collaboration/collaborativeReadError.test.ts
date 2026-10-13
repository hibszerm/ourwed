import { supabase } from '@/lib/supabase'
import { collaborativeOperationalService } from './collaborativeOperationalService'
import { collaborativeWeddingService } from './collaborativeWeddingService'
import {
  CollaborativeReadError,
  collaborativeReadError,
} from './collaborativeReadError'

let passed = 0
function check(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL collaboration read error contract — ${message}`)
  passed += 1
}

check(collaborativeReadError({ code: 'P0001', message: 'UNAVAILABLE' }, true).kind === 'UNAVAILABLE',
  'exact edit-state domain signal is authoritative unavailable')
check(collaborativeReadError({ code: 'P0001', message: 'UNAVAILABLE' }).kind !== 'UNAVAILABLE',
  'detail RPC error is not authoritative because its contract signals unavailable with null')
check(collaborativeReadError({ status: 503, message: 'upstream failure' }).kind === 'TRANSIENT',
  'server failure is retryable and non-authoritative')
check(collaborativeReadError(new TypeError('Failed to fetch')).kind === 'TRANSIENT',
  'transport exception is retryable and non-authoritative')
check(collaborativeReadError({ status: 400, code: 'PGRST116', message: 'unexpected' }).kind === 'UNKNOWN',
  'unexpected structured error remains non-authoritative')

const originalRpc = Object.getOwnPropertyDescriptor(supabase, 'rpc')
const rpc = (name: string) => Object.defineProperty(supabase, 'rpc', {
  configurable: true,
  value: async (requested: string) => {
    if (requested !== name) throw new Error(`unexpected RPC: ${requested}`)
    return { data: null, error: null }
  },
})

try {
  rpc('get_collaborative_wedding_detail')
  check(await collaborativeWeddingService.getCollaborativeWeddingDetail('21000000-0000-4000-8000-000000000001') === null,
    'successful detail null remains the authoritative unavailable result')

  Object.defineProperty(supabase, 'rpc', {
    configurable: true,
    value: async () => ({ data: undefined, error: null }),
  })
  try {
    await collaborativeWeddingService.getCollaborativeWeddingDetail('21000000-0000-4000-8000-000000000001')
    check(false, 'undefined detail response rejects')
  } catch (error) {
    check(error instanceof CollaborativeReadError && error.kind === 'UNKNOWN',
      'only successful null, not undefined, signals unavailable')
  }

  Object.defineProperty(supabase, 'rpc', {
    configurable: true,
    value: async () => ({ data: null, error: { status: 503, message: 'private upstream detail' } }),
  })
  try {
    await collaborativeWeddingService.getCollaborativeWeddingDetail('21000000-0000-4000-8000-000000000001')
    check(false, 'detail server failure rejects')
  } catch (error) {
    check(error instanceof CollaborativeReadError && error.kind === 'TRANSIENT',
      'detail server failure is typed transient without exposing raw message')
    check(error instanceof Error && error.message === 'TRANSIENT', 'detail server message is not surfaced')
  }

  Object.defineProperty(supabase, 'rpc', {
    configurable: true,
    value: async () => ({ data: null, error: null }),
  })
  try {
    await collaborativeOperationalService.getEditState('21000000-0000-4000-8000-000000000001')
    check(false, 'malformed edit-state DTO rejects')
  } catch (error) {
    check(error instanceof CollaborativeReadError && error.kind === 'UNKNOWN',
      'malformed successful response is unknown and non-authoritative')
  }

  Object.defineProperty(supabase, 'rpc', {
    configurable: true,
    value: async () => ({ data: null, error: { code: 'P0001', message: 'UNAVAILABLE', status: 400 } }),
  })
  try {
    await collaborativeOperationalService.getEditState('21000000-0000-4000-8000-000000000001')
    check(false, 'edit-state unavailable rejects')
  } catch (error) {
    check(error instanceof CollaborativeReadError && error.kind === 'UNAVAILABLE',
      'edit-state exact domain error remains authoritative unavailable')
  }

  Object.defineProperty(supabase, 'rpc', {
    configurable: true,
    value: async () => { throw new TypeError('private transport detail') },
  })
  try {
    await collaborativeOperationalService.getEditState('21000000-0000-4000-8000-000000000001')
    check(false, 'edit-state transport failure rejects')
  } catch (error) {
    check(error instanceof CollaborativeReadError && error.kind === 'TRANSIENT',
      'edit-state transport failure stays retryable')
    check(error instanceof Error && error.message === 'TRANSIENT', 'transport details are not surfaced')
  }
} finally {
  if (originalRpc) Object.defineProperty(supabase, 'rpc', originalRpc)
  else delete (supabase as unknown as { rpc?: unknown }).rpc
}

console.log(`PASS collaboration read error contract (${passed} assertions)`)
