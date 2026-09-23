import assert from 'node:assert/strict'
import { buildRestrictedCorsHeaders, resolveAllowedCorsOrigins } from './browserCors.ts'

const env = (values: Record<string, string> = {}) =>
  (name: string) => values[name] ?? null

function optionsHeaders(origin: string, getEnv = env()) {
  return buildRestrictedCorsHeaders(
    new Request('https://edge.example.test', {
      method: 'OPTIONS',
      headers: { Origin: origin },
    }),
    getEnv,
    'POST, OPTIONS',
  )
}

const productionOrigin = 'https://www.ourwed.pl'
const currentPreviewOrigin = 'https://ourwed-lqiggz2wp-our-wed.vercel.app'
const anotherPreviewOrigin = 'https://ourwed-abc123xyz-our-wed.vercel.app'

assert.equal(
  optionsHeaders(productionOrigin)['Access-Control-Allow-Origin'],
  productionOrigin,
  'production origin remains allowed',
)
assert.equal(
  optionsHeaders(currentPreviewOrigin)['Access-Control-Allow-Origin'],
  currentPreviewOrigin,
  'current OurWed Preview deployment is allowed',
)
assert.equal(
  optionsHeaders(anotherPreviewOrigin)['Access-Control-Allow-Origin'],
  anotherPreviewOrigin,
  'another canonical OurWed Preview deployment is allowed',
)

const devEnv = env({ ALLOW_DEV_CORS: '1' })
assert.equal(
  optionsHeaders('http://localhost:5173', devEnv)['Access-Control-Allow-Origin'],
  'http://localhost:5173',
  'explicitly enabled development origin remains allowed',
)
assert.ok(
  resolveAllowedCorsOrigins(env()).includes(productionOrigin),
  'default production origin remains in the configured allowlist',
)
assert.ok(
  !resolveAllowedCorsOrigins(env()).includes('http://localhost:5173'),
  'development origins remain disabled unless configured',
)

for (const rejectedOrigin of [
  'https://evil.vercel.app',
  'https://our-wed.vercel.app',
  'https://ourwed-abc123xyz-our-wed.vercel.app.attacker.com',
  'https://attacker-our-wed.vercel.app',
  'http://ourwed-abc123xyz-our-wed.vercel.app',
  'https://ourwed-abc123xyz-our-wed.vercel.app:443',
  'https://ourwed-abc123xyz-our-wed.vercel.app/',
  'not an origin',
  'null',
]) {
  assert.equal(
    optionsHeaders(rejectedOrigin)['Access-Control-Allow-Origin'],
    undefined,
    `unapproved origin is rejected: ${rejectedOrigin}`,
  )
}

console.log('PASS restricted browser CORS: production, OurWed Preview, dev opt-in, spoof rejection, and OPTIONS headers')
