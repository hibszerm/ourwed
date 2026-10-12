import { createHash, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const accounts = {
  'QA-A': 'qa-collab-a@ourwed.test',
  'QA-B': 'qa-collab-b@ourwed.test',
} as const
type QaAccount = keyof typeof accounts

const accountArgument = process.argv[2]
if (accountArgument !== 'QA-A' && accountArgument !== 'QA-B') {
  throw new Error('Usage: tsx scripts/internal-qa/provision.ts QA-A|QA-B [--production]')
}
const account: QaAccount = accountArgument
const productionMode = process.argv.includes('--production')

const supabaseUrl = process.env.SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const provisionedBy = process.env.INTERNAL_QA_OPERATOR?.trim()
if (!supabaseUrl || !serviceRoleKey || !provisionedBy) {
  throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and INTERNAL_QA_OPERATOR.')
}

const parsedUrl = new URL(supabaseUrl)
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname)
const expectedProductionHost = 'xyycwllsovpxlcustpcv.supabase.co'
const skipKeychain = process.env.INTERNAL_QA_SKIP_KEYCHAIN === '1'
if (!productionMode && !isLocal) throw new Error('Refusing non-local target without --production.')
if (productionMode && parsedUrl.hostname !== expectedProductionHost) {
  throw new Error('Production mode only permits the approved OurWed Supabase project.')
}
if (skipKeychain && !isLocal) throw new Error('Keychain can only be skipped for a local test target.')
if (productionMode) {
  process.stderr.write(`Type CREATE PRODUCTION QA ACCOUNT ${account} to continue: `)
  const confirmation = await new Promise<string>((resolve) => {
    let value = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk: string) => {
      value += chunk
      if (value.includes('\n')) resolve(value.trim())
    })
  })
  if (confirmation !== `CREATE PRODUCTION QA ACCOUNT ${account}`) {
    throw new Error('Production confirmation did not match.')
  }
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})
const email = accounts[account]
const password = randomBytes(32).toString('base64url')
const nonce = randomBytes(32).toString('hex')
const nonceHash = createHash('sha256').update(nonce).digest('hex')
const purpose = 'Collaboration 1B cross-account E2E and product regression'
let createdUserId: string | null = null

function assertNoError(error: { message: string } | null, label: string): void {
  if (error) throw new Error(`${label}: ${error.message}`)
}

function saveCredentialToKeychain(userId: string): void {
  const helper = fileURLToPath(new URL('./keychain.swift', import.meta.url))
  const result = spawnSync(
    'swift',
    [helper, 'store', account, `${account} | ${email} | ${userId}`],
    { input: password, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  )
  if (result.status !== 0) throw new Error('Could not save QA credential to macOS Keychain.')
}

function deleteCredentialFromKeychain(): void {
  if (skipKeychain) return
  const helper = fileURLToPath(new URL('./keychain.swift', import.meta.url))
  const result = spawnSync('swift', [helper, 'delete', account, account], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    process.stderr.write('Warning: could not remove the partial QA credential from macOS Keychain.\n')
  }
}

async function findAttemptUser() {
  const perPage = 1000
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error('Could not search Auth users for this provisioning attempt.')
    const user = data.users.find((candidate) =>
      candidate.email === email && candidate.user_metadata?.internal_qa_bootstrap_nonce_hash === nonceHash,
    )
    if (user) return user
    if (data.users.length < perPage) return undefined
  }
}

try {
  const { error: authorizationError } = await supabase.rpc(
    'create_internal_qa_provisioning_authorization',
    { p_nonce: nonce, p_provisioned_by: provisionedBy, p_purpose: purpose },
  )
  assertNoError(authorizationError, 'provisioning authorization')

  const { data, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // GoTrue inserts auth.users before applying app_metadata. Keep this row
    // unable to authenticate until trusted QA bootstrap, checks, and credential
    // persistence have all completed.
    ban_duration: '876000h',
    user_metadata: {
      first_name: 'Internal QA',
      last_name: account,
      profession: 'Photography',
      internal_qa_bootstrap_nonce_hash: nonceHash,
    },
    app_metadata: {
      internal_qa: true,
      internal_qa_bootstrap_nonce_hash: nonceHash,
    },
  })
  assertNoError(createError, 'Auth Admin createUser')
  if (!data.user) throw new Error('Auth Admin did not return the created user.')
  createdUserId = data.user.id

  const cleanedAppMetadata = { ...data.user.app_metadata }
  cleanedAppMetadata.internal_qa = null
  cleanedAppMetadata.internal_qa_bootstrap_nonce_hash = null
  const cleanedUserMetadata = { ...data.user.user_metadata }
  cleanedUserMetadata.internal_qa_bootstrap_nonce_hash = null
  const { error: cleanupError } = await supabase.auth.admin.updateUserById(
    createdUserId,
    { app_metadata: cleanedAppMetadata, user_metadata: cleanedUserMetadata },
  )
  assertNoError(cleanupError, 'transient metadata cleanup')

  const checks = await Promise.all([
    supabase.from('internal_qa_accounts').select('user_id').eq('user_id', createdUserId).maybeSingle(),
    supabase.from('profiles').select('id').eq('id', createdUserId).maybeSingle(),
    supabase.from('users').select('id').eq('id', createdUserId).maybeSingle(),
    supabase.from('user_legal_acceptances').select('id', { count: 'exact', head: true }).eq('user_id', createdUserId),
    supabase.from('billing_accounts').select('id', { count: 'exact', head: true }).eq('owner_user_id', createdUserId),
    supabase.from('account_subscriptions')
      .select('id, billing_accounts!inner(owner_user_id)', { count: 'exact', head: true })
      .eq('billing_accounts.owner_user_id', createdUserId),
    supabase.from('forms').select('id', { count: 'exact', head: true })
      .eq('user_id', createdUserId).eq('is_system_template', false),
    supabase.from('forms').select('id', { count: 'exact', head: true })
      .eq('is_system_template', true).eq('is_active', true),
    supabase.from('packages').select('id', { count: 'exact', head: true })
      .eq('user_id', createdUserId).eq('is_system_template', false),
    supabase.from('packages').select('id', { count: 'exact', head: true })
      .eq('is_system_template', true).eq('is_active', true),
    supabase.from('extra_services').select('id', { count: 'exact', head: true })
      .eq('user_id', createdUserId).eq('is_system_template', false),
    supabase.from('extra_services').select('id', { count: 'exact', head: true })
      .eq('is_system_template', true).eq('is_active', true),
    supabase.from('questionnaire_templates').select('id', { count: 'exact', head: true })
      .eq('owner_id', createdUserId)
      .in('source_key', ['pre_wedding_video_v1', 'pre_wedding_photo_v1', 'pre_wedding_photo_video_v1']),
    supabase.auth.admin.getUserById(createdUserId),
  ])
  for (const check of checks.slice(0, 13)) assertNoError(check.error, 'bootstrap verification')
  assertNoError(checks[13].error, 'Auth verification')
  if (!checks[0].data || !checks[1].data || !checks[2].data) {
    throw new Error('QA registry/profile/public user bootstrap is incomplete.')
  }
  if (checks[3].count !== 0 || checks[4].count !== 0 || checks[5].count !== 0) {
    throw new Error('QA account unexpectedly has legal acceptance, billing, or trial state.')
  }
  const defaults = [
    { label: 'forms', actual: checks[6].count, expected: checks[7].count },
    { label: 'packages', actual: checks[8].count, expected: checks[9].count },
    { label: 'extra services', actual: checks[10].count, expected: checks[11].count },
  ]
  for (const item of defaults) {
    if ((item.actual ?? 0) < (item.expected ?? 0)) {
      throw new Error(`QA account is missing copied ${item.label} defaults.`)
    }
  }
  if ((checks[12].count ?? 0) !== 3) {
    throw new Error('QA account is missing official pre-wedding presets.')
  }
  if (!checks[13].data.user?.email_confirmed_at) {
    throw new Error('QA Auth email is not confirmed.')
  }
  const cleanedMetadata = checks[13].data.user.app_metadata ?? {}
  if (cleanedMetadata.internal_qa === true || typeof cleanedMetadata.internal_qa_bootstrap_nonce_hash === 'string') {
    throw new Error('Transient QA bootstrap metadata was not removed.')
  }

  if (skipKeychain) {
    // The disposable harness intentionally skips credential persistence.
  } else {
    saveCredentialToKeychain(createdUserId)
  }

  const { error: unbanError } = await supabase.auth.admin.updateUserById(createdUserId, {
    ban_duration: 'none',
  })
  assertNoError(unbanError, 'final account activation')
  console.log(skipKeychain
    ? `Created ${account} (${createdUserId}); local harness credential persistence skipped.`
    : `Created ${account} (${createdUserId}); credential saved in macOS Keychain.`)
} catch (error) {
  if (createdUserId) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(createdUserId)
    if (deleteError) {
      process.stderr.write('Warning: QA account cleanup could not be confirmed; the account remains login-disabled.\n')
    }
    deleteCredentialFromKeychain()
  } else {
    // GoTrue applies Admin app_metadata in a follow-up UPDATE. If that update
    // fails, createUser can return an error after the INSERT has committed.
    // Find only this attempt's pending Auth row by its high-entropy handoff
    // nonce so a failed local/provisioning attempt cannot leave an orphan.
    try {
      const pendingUser = await findAttemptUser()
      if (pendingUser) {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(pendingUser.id)
        if (deleteError) {
          process.stderr.write('Warning: partial QA account cleanup could not be confirmed; the account remains login-disabled.\n')
        }
      }
    } catch {
      process.stderr.write('Warning: partial QA account cleanup could not be verified; any partial account remains login-disabled.\n')
    }
  }
  throw error
}
