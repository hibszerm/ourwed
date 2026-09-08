import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

export type AuthenticatedUserResult =
  | { ok: true; userId: string; authHeader: string }
  | { ok: false; status: 401 | 500; message: string }

/**
 * Require a real Supabase Auth user session.
 * Public anon/publishable JWTs are valid gateway JWTs but fail getUser() — that is intentional.
 */
export async function requireAuthenticatedUser(
  req: Request,
): Promise<AuthenticatedUserResult> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return { ok: false, status: 401, message: 'Missing Authorization' }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, status: 500, message: 'Server misconfigured' }
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { ok: false, status: 401, message: 'Unauthorized' }
  }

  return { ok: true, userId: user.id, authHeader }
}
