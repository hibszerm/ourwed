/**
 * MFA setup pipeline unit tests — stale unverified factor cleanup.
 */
import {
  MFA_SETUP_USER_ERROR,
  partitionTotpFactors,
  prepareTotpSetup,
  resetTotpSetupInFlightForTests,
  type MfaClient,
  type TotpFactorSummary,
} from './adminMfaSetupCore'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  admin-mfa-setup — ${msg}`)
}

function makeClient(state: {
  factors: TotpFactorSummary[]
  enrollId?: string
}): MfaClient & {
  calls: { list: number; unenroll: string[]; enroll: number }
} {
  const calls = { list: 0, unenroll: [] as string[], enroll: 0 }
  return {
    calls,
    async listFactors() {
      calls.list += 1
      return { data: { totp: [...state.factors], all: [...state.factors] }, error: null }
    },
    async unenroll({ factorId }) {
      calls.unenroll.push(factorId)
      const target = state.factors.find((f) => f.id === factorId)
      assert(target?.status !== 'verified', 'must never unenroll verified')
      state.factors = state.factors.filter((f) => f.id !== factorId)
      return { error: null }
    },
    async enroll() {
      calls.enroll += 1
      const id = state.enrollId ?? `factor-new-${calls.enroll}`
      state.factors.push({
        id,
        status: 'unverified',
        factor_type: 'totp',
        friendly_name: 'OurWed Admin',
      })
      return {
        data: {
          id,
          totp: {
            qr_code: '<svg>qr</svg>',
            secret: 'SECRETVALUE',
            uri: 'otpauth://totp/test',
          },
        },
        error: null,
      }
    },
  }
}

async function run() {
  // partition
  {
    const { verified, unverified } = partitionTotpFactors([
      { id: 'v1', status: 'verified', factorType: 'totp' },
      { id: 'u1', status: 'unverified', factorType: 'totp' },
      { id: 'u2', status: 'unverified', factorType: 'totp' },
    ])
    assert(verified.length === 1 && verified[0]!.id === 'v1', 'verified partitioned')
    assert(unverified.length === 2, 'unverified partitioned')
  }

  // CASE C — no factors → exactly one enroll
  {
    resetTotpSetupInFlightForTests()
    const client = makeClient({ factors: [] })
    const result = await prepareTotpSetup({ client })
    assert(result.kind === 'enrolled', 'no factors → enrolled')
    assert(client.calls.enroll === 1, 'exactly one enroll')
    assert(client.calls.unenroll.length === 0, 'no unenroll when empty')
    if (result.kind === 'enrolled') {
      assert(result.enrollment.qrCode.includes('svg'), 'qr present')
      assert(result.enrollment.secret === 'SECRETVALUE', 'secret present')
    }
  }

  // CASE B — stale unverified → unenroll once, enroll once
  {
    resetTotpSetupInFlightForTests()
    const client = makeClient({
      factors: [
        {
          id: 'stale-1',
          status: 'unverified',
          factorType: 'totp',
          friendlyName: 'OurWed Admin',
        },
      ],
    })
    const result = await prepareTotpSetup({ client })
    assert(result.kind === 'enrolled', 'stale → enrolled')
    assert(client.calls.unenroll.length === 1, 'unenroll once')
    assert(client.calls.unenroll[0] === 'stale-1', 'unenroll stale id')
    assert(client.calls.enroll === 1, 'enroll once after cleanup')
  }

  // CASE A — verified → redirect, no enroll, no unenroll
  {
    resetTotpSetupInFlightForTests()
    const client = makeClient({
      factors: [
        {
          id: 'verified-1',
          status: 'verified',
          factorType: 'totp',
          friendlyName: 'OurWed Admin',
        },
        {
          id: 'stale-ignored-when-verified-present',
          status: 'unverified',
          factorType: 'totp',
        },
      ],
    })
    const result = await prepareTotpSetup({ client })
    assert(result.kind === 'redirect_verify', 'verified → redirect')
    if (result.kind === 'redirect_verify') {
      assert(result.verifiedFactorId === 'verified-1', 'uses verified id')
    }
    assert(client.calls.enroll === 0, 'no enroll when verified')
    assert(client.calls.unenroll.length === 0, 'never remove verified / skip cleanup')
  }

  // StrictMode double effect → one effective pipeline
  {
    resetTotpSetupInFlightForTests()
    const client = makeClient({
      factors: [
        {
          id: 'stale-2',
          status: 'unverified',
          factorType: 'totp',
          friendlyName: 'OurWed Admin',
        },
      ],
    })
    const p1 = prepareTotpSetup({ client })
    const p2 = prepareTotpSetup({ client })
    const [r1, r2] = await Promise.all([p1, p2])
    assert(r1.kind === 'enrolled' && r2.kind === 'enrolled', 'both resolve enrolled')
    assert(client.calls.list === 1, 'shared in-flight: one list')
    assert(client.calls.enroll === 1, 'shared in-flight: one enroll')
    assert(client.calls.unenroll.length === 1, 'shared in-flight: one unenroll')
  }

  // Remount with session cache → no second enroll
  {
    resetTotpSetupInFlightForTests()
    const client = makeClient({ factors: [], enrollId: 'cached-factor' })
    const first = await prepareTotpSetup({ client })
    assert(first.kind === 'enrolled', 'first enroll')
    assert(client.calls.enroll === 1, 'first enroll count')
    const second = await prepareTotpSetup({ client })
    assert(second.kind === 'enrolled', 'second uses cache')
    assert(client.calls.enroll === 1, 'no re-enroll on remount')
    assert(client.calls.unenroll.length === 0, 'cache skip does not unenroll')
  }

  // User-facing error constant (no English SDK string)
  assert(
    MFA_SETUP_USER_ERROR.includes('dwuskładnikowego'),
    'Polish user error',
  )
  assert(
    !MFA_SETUP_USER_ERROR.toLowerCase().includes('friendly name'),
    'no English SDK wording',
  )

  // Setup page must not surface raw English enroll error
  {
    const setupPage = await import('node:fs').then((fs) =>
      fs.readFileSync(
        new URL('../pages/AdminMfaSetupPage.tsx', import.meta.url),
        'utf8',
      ),
    )
    assert(setupPage.includes('MFA_SETUP_USER_ERROR'), 'uses generic Polish error')
    assert(
      !setupPage.includes('err.message'),
      'does not render err.message to UI',
    )
    assert(setupPage.includes('Sprawdzanie konfiguracji'), 'checking label')
    assert(
      setupPage.includes('Usuwanie niedokończonej konfiguracji'),
      'cleaning label',
    )
    assert(setupPage.includes('Przygotowywanie kodu QR'), 'enrolling label')
    assert(setupPage.includes('prepareTotpSetup'), 'uses prepare pipeline')
  }

  console.log('PASS  admin-mfa-setup')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
