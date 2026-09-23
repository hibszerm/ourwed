import { requireAuthenticatedUser } from '../_shared/requireAuthenticatedUser.ts'
import { buildRestrictedCorsHeaders } from '../_shared/security/browserCors.ts'
import { handleSemanticMapRequest } from '../_shared/semanticMapRequestHandler.ts'

function env(name: string): string | undefined {
  return Deno.env.get(name)?.trim() || undefined
}

Deno.serve(async (request) => {
  const corsHeaders = buildRestrictedCorsHeaders(request, (name) => env(name) ?? null, 'POST, OPTIONS')
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const response = await handleSemanticMapRequest(request, {
    authenticate: async (req) => {
      const result = await requireAuthenticatedUser(req)
      return result.ok ? true : result.status === 500 ? 'configuration' : false
    },
    env,
    fetch,
  })
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value)
  return new Response(response.body, { status: response.status, headers })
})
