import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  buildSessionCanonical,
  buildWeddingCanonical,
} from '../_shared/calendar/canonical.ts'
import {
  buildAppleIcsDocument,
  logCalendar,
  sha256Hex,
} from '../_shared/calendar/cryptoDates.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, if-none-match, if-modified-since',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function notFound(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function extractToken(url: URL): string | null {
  // Paths:
  // /functions/v1/apple-calendar-feed/{token}/ourwed.ics
  // /apple-calendar-feed/{token}/ourwed.ics
  // ?token=
  const fromQuery = url.searchParams.get('token')
  if (fromQuery && fromQuery.length >= 32) return fromQuery

  const parts = url.pathname.split('/').filter(Boolean)
  const feedIdx = parts.findIndex((p) => p === 'apple-calendar-feed')
  if (feedIdx >= 0 && parts[feedIdx + 1]) {
    const token = parts[feedIdx + 1]
    if (token.length >= 32 && token !== 'ourwed.ics') return token
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'GET') {
    return notFound()
  }

  const url = new URL(req.url)
  const rawToken = extractToken(url)
  if (!rawToken) {
    return notFound()
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const tokenHash = await sha256Hex(rawToken)
  const { data: integration, error } = await service
    .from('calendar_integrations')
    .select('*')
    .eq('provider', 'apple')
    .eq('enabled', true)
    .eq('apple_token_hash', tokenHash)
    .maybeSingle()

  if (error || !integration) {
    logCalendar('info', 'apple_feed_not_found', {
      provider: 'apple',
      operation: 'feed',
      errorCategory: 'auth',
    })
    return notFound()
  }

  const etag =
    (integration.apple_feed_etag as string) ||
    `W/"${integration.updated_at}"`
  const ifNoneMatch = req.headers.get('If-None-Match')
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ...corsHeaders,
        ETag: etag,
        'Cache-Control': 'private, max-age=300',
      },
    })
  }

  const settings = {
    syncWeddings: Boolean(integration.sync_weddings),
    syncSessions: Boolean(integration.sync_sessions),
    backfillMode: (integration.backfill_mode as 'future' | 'all_active') ??
      'future',
  }

  const userId = integration.user_id as string
  const events = []

  if (settings.syncWeddings) {
    const { data: weddings } = await service
      .from('weddings')
      .select(
        'id, wedding_date, status, display_name, bride_name, groom_name',
      )
      .eq('user_id', userId)
    for (const w of weddings ?? []) {
      events.push(buildWeddingCanonical(w, settings))
    }
  }

  if (settings.syncSessions) {
    const { data: sessions } = await service
      .from('sessions')
      .select(
        'id, session_date, custom_name, primary_first_name, primary_last_name, secondary_first_name, secondary_last_name, session_type, custom_session_type',
      )
      .eq('user_id', userId)
    for (const s of sessions ?? []) {
      events.push(buildSessionCanonical(s, settings))
    }
  }

  const ics = buildAppleIcsDocument(events)

  logCalendar('info', 'apple_feed_served', {
    provider: 'apple',
    operation: 'feed',
    integrationId: integration.id,
    eventCount: events.filter((e) => e.eligible).length,
  })

  return new Response(ics, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="ourwed.ics"',
      'Cache-Control': 'private, max-age=300',
      ETag: etag,
      'Last-Modified': new Date(
        integration.updated_at as string,
      ).toUTCString(),
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
