#!/usr/bin/env npx tsx
/**
 * One-time OurWed Admin owner creation.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run admin:create-owner
 *
 * Never prints the password. Never uses VITE_* service credentials.
 * Refuses if an enabled owner already exists.
 * Refuses to silently promote an existing Auth user.
 */
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output, stderr } from 'node:process'
import {
  assertNodeScriptContext,
  createSupabaseAdminClient,
} from './lib/supabaseAdminClient'

const MIN_PASSWORD_LENGTH = 16

function isStrongPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH
}

async function promptHidden(rl: readline.Interface, question: string): Promise<string> {
  // Best-effort mute (TTY). Falls back to visible input when not a TTY.
  if (input.isTTY && typeof (input as NodeJS.ReadStream).setRawMode === 'function') {
    return await new Promise((resolve, reject) => {
      const wasRaw = (input as NodeJS.ReadStream).isRaw
      const chunks: string[] = []
      output.write(question)
      ;(input as NodeJS.ReadStream).setRawMode(true)
      input.resume()
      const onData = (buf: Buffer) => {
        const s = buf.toString('utf8')
        for (const ch of s) {
          if (ch === '\n' || ch === '\r' || ch === '\u0004') {
            cleanup()
            output.write('\n')
            resolve(chunks.join(''))
            return
          }
          if (ch === '\u0003') {
            cleanup()
            reject(new Error('Interrupted'))
            return
          }
          if (ch === '\u007f' || ch === '\b') {
            chunks.pop()
            continue
          }
          chunks.push(ch)
          output.write('*')
        }
      }
      const cleanup = () => {
        input.off('data', onData)
        try {
          ;(input as NodeJS.ReadStream).setRawMode(wasRaw)
        } catch {
          /* ignore */
        }
      }
      input.on('data', onData)
    })
  }
  return rl.question(question)
}

async function main() {
  assertNodeScriptContext('createAdminOwner')
  const admin = createSupabaseAdminClient()

  const { count, error: countError } = await admin
    .from('admin_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('enabled', true)

  if (countError) {
    throw new Error(
      `Cannot inspect admin_members (apply migration first): ${countError.message}`,
    )
  }
  if ((count ?? 0) > 0) {
    console.error('An active administrator already exists. Aborting.')
    process.exit(1)
  }

  const rl = readline.createInterface({ input, output })
  try {
    const email = (await rl.question('Owner email: ')).trim().toLowerCase()
    if (!email || !email.includes('@')) {
      throw new Error('Valid email is required')
    }

    // Existing Auth user check — never silently promote customers.
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listed.error) {
      throw new Error(`Auth list failed: ${listed.error.message}`)
    }
    const existing = listed.data.users.find(
      (u) => (u.email ?? '').toLowerCase() === email,
    )
    if (existing) {
      const { data: membership } = await admin
        .from('admin_members')
        .select('user_id, enabled')
        .eq('user_id', existing.id)
        .maybeSingle()

      if (membership) {
        console.error(
          'Auth user already exists and already has an admin_members row. Aborting.',
        )
        process.exit(1)
      }

      console.error(
        [
          'An Auth user with this email already exists and is NOT an administrator.',
          'Refusing to silently promote a customer account.',
          'Use a dedicated recovery/migration process if this is intentional.',
        ].join('\n'),
      )
      process.exit(1)
    }

    const password = await promptHidden(rl, 'Owner password (min 16 chars): ')
    const confirm = await promptHidden(rl, 'Confirm password: ')

    if (password !== confirm) {
      throw new Error('Passwords do not match')
    }
    if (!isStrongPassword(password)) {
      throw new Error(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters. Prefer a password-manager-generated value.`,
      )
    }

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: 'OurWed Admin',
        platform: 'admin',
      },
      app_metadata: {
        // Informational only — authorization uses admin_members, not metadata.
        ourwed_admin_phase: '1',
      },
    })

    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? 'Failed to create Auth user')
    }

    const userId = created.data.user.id

    const { error: memberError } = await admin.from('admin_members').insert({
      user_id: userId,
      role: 'owner',
      enabled: true,
      created_by: userId,
    })

    if (memberError) {
      stderr.write(
        `Membership insert failed (${memberError.message}). Rolling back Auth user…\n`,
      )
      const del = await admin.auth.admin.deleteUser(userId)
      if (del.error) {
        stderr.write(
          `CRITICAL: Auth user ${userId} exists but membership failed, and delete also failed: ${del.error.message}\n`,
        )
      }
      process.exit(1)
    }

    await admin.from('admin_audit_log').insert({
      admin_user_id: userId,
      action: 'admin.owner_account_created',
      target_type: 'admin_members',
      target_id: userId,
      metadata: { source: 'createAdminOwner.ts' },
    })

    const loginUrl =
      process.env.ADMIN_PUBLIC_URL?.replace(/\/$/, '') ??
      'http://localhost:5173/admin/login'

    console.log('Owner created successfully.')
    console.log(`user_id: ${userId}`)
    console.log(`email: ${email}`)
    console.log(`next: ${loginUrl}`)
    console.log('Complete MFA setup on first login.')
  } finally {
    rl.close()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
