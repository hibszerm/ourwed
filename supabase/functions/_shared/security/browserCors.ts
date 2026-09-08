/**
 * Origin-restricted CORS for authenticated browser Edge Functions.
 */

const DEFAULT_PRODUCTION_ORIGINS = ['https://www.ourwed.pl'] as const
const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
] as const

export type EnvGet = (name: string) => string | null

function parseOriginList(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function resolveAllowedCorsOrigins(env: EnvGet): string[] {
  const fromEnv = parseOriginList(env('ALLOWED_BROWSER_ORIGINS'))
  const app = (env('APP_PUBLIC_URL') || env('SITE_URL') || '').replace(/\/$/, '')
  const origins = new Set<string>([
    ...DEFAULT_PRODUCTION_ORIGINS,
    ...fromEnv,
  ])
  if (app.startsWith('http://') || app.startsWith('https://')) {
    origins.add(app)
  }
  const runtime = (env('OURWED_RUNTIME') || env('OURWED_ENV') || '')
    .trim()
    .toLowerCase()
  const allowDev =
    runtime === 'local' ||
    runtime === 'development' ||
    runtime === 'dev' ||
    /localhost|127\.0\.0\.1/i.test(app) ||
    env('ALLOW_DEV_CORS') === '1'
  if (allowDev) {
    for (const o of DEFAULT_DEV_ORIGINS) origins.add(o)
  }
  return [...origins]
}

export function buildRestrictedCorsHeaders(
  req: Request,
  env: EnvGet,
  methods: string,
): Record<string, string> {
  const allowed = new Set(resolveAllowedCorsOrigins(env))
  const origin = req.headers.get('Origin')
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': methods,
    Vary: 'Origin',
  }
  if (origin && allowed.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  // Disallowed / missing Origin: do not emit permissive ACAO.
  return headers
}
