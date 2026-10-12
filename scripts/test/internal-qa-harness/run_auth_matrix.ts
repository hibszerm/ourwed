import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { dispatchEmailUnlessInternalQa } from '../../../supabase/functions/_shared/internalQaEmailGate.ts'

const envFile = process.argv[2]
if (!envFile) throw new Error('Usage: tsx run_auth_matrix.ts /private/tmp/.../local.env')
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const split = line.indexOf('=')
      return [line.slice(0, split), line.slice(split + 1).replace(/^"|"$/g, '')]
    }),
)
const apiUrl = env.API_URL as string
const serviceKey = env.SERVICE_ROLE_KEY as string
const anonKey = env.ANON_KEY as string
assert.equal(new URL(apiUrl).hostname, '127.0.0.1')
assert.ok(!Object.values(env).some((value) => value.includes('xyycwllsovpxlcustpcv')))
const service = createClient(apiUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const anon = createClient(apiUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
const dbContainer = 'supabase_db_ourwed-internal-qa-harness-20261012'
const testPassword = 'LocalOnly-48cZ!xv9Yq23'
let passed = 0

function check(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message)
  passed += 1
}
function email(label: string): string {
  return `qa-harness-${label}-${randomBytes(5).toString('hex')}@example.com`
}
function sql(statement: string): string {
  return execFileSync(
    'docker',
    ['exec', dbContainer, 'psql', '-X', '-A', '-t', '-q', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', statement],
    { encoding: 'utf8' },
  ).trim()
}
function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}
function hashNonce(nonce: string): string {
  return createHash('sha256').update(nonce).digest('hex')
}
async function signup(address: string, metadata: Record<string, unknown> = {}) {
  return anon.auth.signUp({
    email: address,
    password: testPassword,
    options: { data: metadata },
  })
}
async function adminCreate(
  address: string,
  metadata: Record<string, unknown> = {},
  appMetadata?: Record<string, unknown>,
  banDuration?: string,
) {
  return service.auth.admin.createUser({
    email: address,
    password: testPassword,
    email_confirm: true,
    user_metadata: metadata,
    ...(appMetadata ? { app_metadata: appMetadata } : {}),
    ...(banDuration ? { ban_duration: banDuration } : {}),
  })
}
async function authUser(address: string) {
  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 })
  assert.ifError(error)
  return data.users.find((user) => user.email === address)
}
async function counts(userId: string) {
  const results = await Promise.all([
    service.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId),
    service.from('users').select('id', { count: 'exact', head: true }).eq('id', userId),
    service.from('internal_qa_accounts').select('user_id', { count: 'exact', head: true }).eq('user_id', userId),
    service.from('user_legal_acceptances').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    service.from('billing_accounts').select('id', { count: 'exact', head: true }).eq('owner_user_id', userId),
    service.from('account_subscriptions').select('id,billing_accounts!inner(owner_user_id)', { count: 'exact', head: true }).eq('billing_accounts.owner_user_id', userId),
  ])
  for (const result of results) assert.ifError(result.error)
  return results.map((result) => result.count ?? 0)
}
async function newAuthorization(nonce: string, purpose: string) {
  const { data, error } = await service.rpc('create_internal_qa_provisioning_authorization', {
    p_nonce: nonce,
    p_provisioned_by: 'local harness runner',
    p_purpose: purpose,
  })
  assert.ifError(error)
  return data as { authorizationId: string; expiresAt: string }
}
const legal = {
  legal_registration_accepted: true,
  terms_version: '1.1',
  privacy_version: '1.1',
}

// The Auth Admin provisioner created both .test accounts before this runner.
const qaAEmail = 'qa-collab-a@ourwed.test'
const qaBEmail = 'qa-collab-b@ourwed.test'
const qaA = await authUser(qaAEmail)
const qaB = await authUser(qaBEmail)
check(!!qaA && !!qaB, '.test Auth Admin users were accepted by GoTrue')
const qaAId = qaA!.id
const qaBId = qaB!.id
for (const user of [qaA!, qaB!]) {
  check(!!user.email_confirmed_at, `${user.email} is confirmed locally`)
  check(!user.banned_until || Date.parse(user.banned_until) <= Date.now(), `${user.email} is activated after QA provisioning completes`)
  check(user.app_metadata.internal_qa !== true, `${user.email} has no persistent QA flag`)
  check(typeof user.app_metadata.internal_qa_bootstrap_nonce_hash !== 'string', `${user.email} has no persistent app nonce hash`)
  check(typeof user.user_metadata.internal_qa_bootstrap_nonce_hash !== 'string', `${user.email} has no persistent user nonce hash`)
  const state = await counts(user.id)
  check(state[0] === 1 && state[1] === 1 && state[2] === 1, `${user.email} has Auth/profile/public user/registry`)
  check(state[3] === 0 && state[4] === 0 && state[5] === 0, `${user.email} has no legal, billing, or trial rows`)
  for (const [table, column, owner] of [
    ['forms', 'user_id', user.id],
    ['packages', 'user_id', user.id],
    ['extra_services', 'user_id', user.id],
    ['questionnaire_templates', 'owner_id', user.id],
  ] as const) {
    const { count, error } = await service.from(table).select('*', { count: 'exact', head: true }).eq(column, owner)
    assert.ifError(error)
    check((count ?? 0) > 0, `${user.email} received ${table} defaults`)
  }
  const { count: packageItemCount, error: packageItemsError } = await service
    .from('package_items')
    .select('id,packages!inner(user_id)', { count: 'exact', head: true })
    .eq('packages.user_id', user.id)
  assert.ifError(packageItemsError)
  check((packageItemCount ?? 0) > 0, `${user.email} received package items`)
}

const qaCountsBeforeMaintenance = await counts(qaBId)
const qaMaintenance = await service.auth.admin.updateUserById(qaBId, {
  app_metadata: { internal_qa: null, internal_qa_bootstrap_nonce_hash: null, maintenance_marker: 'harness' },
})
assert.ifError(qaMaintenance.error)
check(JSON.stringify(await counts(qaBId)) === JSON.stringify(qaCountsBeforeMaintenance), 'unrelated service app-metadata update does not rerun QA bootstrap')

// Customer registration exercises the actual client signup endpoint.
const customerEmail = email('valid-customer')
const { data: customerSignup, error: customerSignupError } = await signup(customerEmail, {
  first_name: 'Matrix', last_name: 'Customer', ...legal,
})
assert.ifError(customerSignupError)
assert.ok(customerSignup.user)
const customerId = customerSignup.user.id
const customerState = await counts(customerId)
check(customerState[0] === 1 && customerState[1] === 1, 'normal signup creates profile and public user')
check(customerState[2] === 0 && customerState[3] === 1, 'valid customer has one legal row and no QA registry')
check(customerState[4] === 1 && customerState[5] === 1, 'valid customer has billing account and trial')
const { data: legalRows, error: legalError } = await service.from('user_legal_acceptances').select('terms_version,privacy_version,source').eq('user_id', customerId)
assert.ifError(legalError)
check(legalRows?.[0]?.terms_version === '1.1' && legalRows[0]?.privacy_version === '1.1' && legalRows[0]?.source === 'registration', 'customer legal versions and source are exact')

// Missing and stale consent must roll back Auth and all application state.
for (const [label, metadata] of [
  ['missing-consent', { first_name: 'Missing' }],
  ['wrong-legal-version', { ...legal, terms_version: '0.9' }],
] as const) {
  const address = email(label)
  const { data, error } = await signup(address, metadata)
  check(!!error && !data.user, `${label} is rejected by GoTrue`)
  check(!(await authUser(address)), `${label} leaves no Auth user`)
}

// User metadata can imitate QA fields but cannot set trusted app metadata.
const forgedWithoutConsent = email('forged-no-consent')
const rejectedForgery = await signup(forgedWithoutConsent, {
  internal_qa: true,
  internal_qa_bootstrap_nonce_hash: 'f'.repeat(64),
})
check(!!rejectedForgery.error && !rejectedForgery.data.user, 'user_metadata QA forgery without consent fails')
check(!(await authUser(forgedWithoutConsent)), 'failed user_metadata forgery leaves no Auth row')
const forgedWithConsentEmail = email('forged-with-consent')
const forgedWithConsent = await signup(forgedWithConsentEmail, {
  internal_qa: true,
  internal_qa_bootstrap_nonce_hash: 'f'.repeat(64),
  ...legal,
})
assert.ifError(forgedWithConsent.error)
assert.ok(forgedWithConsent.data.user)
const forgedCustomerState = await counts(forgedWithConsent.data.user.id)
check(forgedCustomerState[2] === 0 && forgedCustomerState[3] === 1, 'forged metadata with consent remains a customer')

// A valid authorization does not convert a user unless trusted app metadata is set.
const unusedNonce = randomBytes(32).toString('hex')
await newAuthorization(unusedNonce, 'authorized customer control')
const authorizedCustomerEmail = email('authorization-without-qa')
const authorizedCustomer = await adminCreate(authorizedCustomerEmail, {
  first_name: 'Authorized', last_name: 'Customer', ...legal,
})
assert.ifError(authorizedCustomer.error)
assert.ok(authorizedCustomer.data.user)
const authorizedState = await counts(authorizedCustomer.data.user.id)
check(authorizedState[2] === 0 && authorizedState[3] === 1 && authorizedState[4] === 1, 'authorization without QA app metadata follows customer flow')
const customerMaintenance = await service.auth.admin.updateUserById(authorizedCustomer.data.user.id, {
  app_metadata: { maintenance_marker: 'harness' },
})
assert.ifError(customerMaintenance.error)
check(JSON.stringify(await counts(authorizedCustomer.data.user.id)) === JSON.stringify(authorizedState), 'unrelated customer app-metadata update remains normal customer state')
const unusedHash = createHash('sha256').update(unusedNonce).digest('hex')
check(sql(`select consumed_at is null from public.internal_qa_provisioning_authorizations where nonce_hash=${quote(unusedHash)}`) === 't', 'authorization is not consumed without trusted QA app metadata')

// Invalid, missing, expired, and replayed grants cannot create application users.
const validNonceForReplay = randomBytes(32).toString('hex')
const validNonceHashForReplay = hashNonce(validNonceForReplay)
await newAuthorization(validNonceForReplay, 'replay test')
const replayOwnerEmail = email('replay-owner')
const replayOwner = await adminCreate(replayOwnerEmail, {
  first_name: 'Replay', last_name: 'Owner', internal_qa_bootstrap_nonce_hash: validNonceHashForReplay,
}, { internal_qa: true, internal_qa_bootstrap_nonce_hash: validNonceHashForReplay })
assert.ifError(replayOwner.error)
assert.ok(replayOwner.data.user)
const replayOwnerState = await counts(replayOwner.data.user.id)
check(replayOwnerState[0] === 1 && replayOwnerState[1] === 1 && replayOwnerState[2] === 1, 'valid one-time authorization bootstraps QA on GoTrue metadata update')
check(replayOwnerState[3] === 0 && replayOwnerState[4] === 0 && replayOwnerState[5] === 0, 'one-time QA success has no legal/billing/trial state')
const replayEmail = email('replay-attempt')
const replay = await adminCreate(replayEmail, {
  first_name: 'Replay', internal_qa_bootstrap_nonce_hash: validNonceHashForReplay, ...legal,
}, { internal_qa: true, internal_qa_bootstrap_nonce_hash: validNonceHashForReplay })
check(!!replay.error, 'replayed nonce is rejected')
check(!(await authUser(replayEmail)), 'replay leaves no Auth row')

const wrongGrantNonce = randomBytes(32).toString('hex')
await newAuthorization(wrongGrantNonce, 'wrong nonce test')
const wrongEmail = email('wrong-nonce')
const badNonce = randomBytes(32).toString('hex')
const badNonceHash = hashNonce(badNonce)
const wrongNonce = await adminCreate(wrongEmail, {
  internal_qa_bootstrap_nonce_hash: badNonceHash, ...legal,
}, { internal_qa: true, internal_qa_bootstrap_nonce_hash: badNonceHash })
check(!!wrongNonce.error, 'wrong nonce is rejected')
check(!(await authUser(wrongEmail)), 'wrong nonce leaves no Auth row')

// Production provisioner holds the account ban through GoTrue's multi-step
// createUser flow, then activates only after the QA bootstrap is complete.
const heldNonce = randomBytes(32).toString('hex')
const heldHash = hashNonce(heldNonce)
await newAuthorization(heldNonce, 'activation hold test')
const heldEmail = email('activation-hold')
const held = await adminCreate(heldEmail, {
  first_name: 'Held', internal_qa_bootstrap_nonce_hash: heldHash,
}, { internal_qa: true, internal_qa_bootstrap_nonce_hash: heldHash }, '876000h')
assert.ifError(held.error)
assert.ok(held.data.user)
check(!!held.data.user.banned_until && Date.parse(held.data.user.banned_until) > Date.now(), 'bootstrap hold keeps Auth row login-disabled')
const heldState = await counts(held.data.user.id)
check(heldState[0] === 1 && heldState[1] === 1 && heldState[2] === 1, 'held account has complete QA application bootstrap')
check(heldState[3] === 0 && heldState[4] === 0 && heldState[5] === 0, 'held account has no legal/billing/trial state')
const heldLoginClient = createClient(apiUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
const blockedLogin = await heldLoginClient.auth.signInWithPassword({ email: heldEmail, password: testPassword })
check(!!blockedLogin.error && !blockedLogin.data.session, 'held QA account cannot authenticate before activation')
const activated = await service.auth.admin.updateUserById(held.data.user.id, { ban_duration: 'none' })
assert.ifError(activated.error)
const activatedLogin = await heldLoginClient.auth.signInWithPassword({ email: heldEmail, password: testPassword })
assert.ifError(activatedLogin.error)
check(!!activatedLogin.data.session, 'completed QA account authenticates after activation')
const deleteHeld = await service.auth.admin.deleteUser(held.data.user.id)
assert.ifError(deleteHeld.error)

const missingNonceEmail = email('missing-nonce')
const missingNonce = await adminCreate(missingNonceEmail, {}, { internal_qa: true })
check(!!missingNonce.error, 'QA app metadata without nonce is rejected')
check(!(await authUser(missingNonceEmail)), 'missing nonce leaves no Auth row')

const expiredNonce = randomBytes(32).toString('hex')
await newAuthorization(expiredNonce, 'expired nonce test')
const expiredHash = hashNonce(expiredNonce)
sql(`update public.internal_qa_provisioning_authorizations set created_at=pg_catalog.now()-interval '1 hour', expires_at=pg_catalog.now()-interval '50 minutes' where nonce_hash=${quote(expiredHash)}`)
const expiredEmail = email('expired-nonce')
const expired = await adminCreate(expiredEmail, { internal_qa_bootstrap_nonce_hash: expiredHash, ...legal }, {
  internal_qa: true,
  internal_qa_bootstrap_nonce_hash: expiredHash,
})
check(!!expired.error, 'expired nonce is rejected')
check(!(await authUser(expiredEmail)), 'expired nonce leaves no Auth row')

// Actual authenticated customer token: metadata and exposed-table attempts cannot grant QA.
const customerClient = createClient(apiUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
const { data: customerSession, error: customerLoginError } = await customerClient.auth.signInWithPassword({ email: customerEmail, password: testPassword })
assert.ifError(customerLoginError)
assert.ok(customerSession.user)
assert.ok(customerSession.session?.access_token)
check((await customerClient.auth.updateUser({ data: { internal_qa: true, internal_qa_bootstrap_nonce_hash: 'a'.repeat(64) } })).error === null, 'updateUser can set user metadata only')
const forgedAppUpdate = await customerClient.auth.updateUser({ app_metadata: { internal_qa: true } } as never)
check(!!forgedAppUpdate.error, 'ordinary updateUser cannot set app metadata')
const markerUpdate = await customerClient.from('users').update({ internal_qa: true } as never).eq('id', customerId)
check(!!markerUpdate.error, 'public.users has no writable QA marker')
const profileMarkerUpdate = await customerClient.from('profiles').update({ internal_qa: true } as never).eq('id', customerId)
check(!!profileMarkerUpdate.error, 'profiles has no writable QA marker')
const markerRead = await customerClient.from('internal_qa_accounts').select('*')
check(!!markerRead.error, 'authenticated user cannot read QA registry')
for (const [label, client] of [['anon', anon], ['authenticated', customerClient]] as const) {
  for (const table of ['internal_qa_accounts', 'internal_qa_provisioning_authorizations'] as const) {
    const select = await client.from(table).select('*')
    const insert = await client.from(table).insert({ user_id: customerId, provisioned_by: 'forge', purpose: 'forge', nonce_hash: '0'.repeat(64), expires_at: new Date(Date.now()+60_000).toISOString() } as never)
    const update = await client.from(table).update({ purpose: 'forge' } as never)
    const remove = await client.from(table).delete()
    check(!!select.error && !!insert.error && !!update.error && !!remove.error, `${label} cannot read/write ${table}`)
  }
}
const authenticatedAuthzCall = await customerClient.rpc('create_internal_qa_provisioning_authorization', {
  p_nonce: randomBytes(32).toString('hex'), p_provisioned_by: 'forge', p_purpose: 'forge',
})
check(!!authenticatedAuthzCall.error, 'authenticated user cannot call the authorization helper')
const anonRegistryRead = await anon.from('internal_qa_accounts').select('*')
check(!!anonRegistryRead.error, 'anon cannot read QA registry')
const serviceRegistryRead = await service.from('internal_qa_accounts').select('user_id').eq('user_id', qaAId).maybeSingle()
assert.ifError(serviceRegistryRead.error)
check(!!serviceRegistryRead.data, 'trusted service role reads registry membership')
const serviceAuthorizationRead = await service.from('internal_qa_provisioning_authorizations').select('*')
check(!!serviceAuthorizationRead.error, 'service role cannot enumerate authorization hashes')

// Repeated actual authenticated entitlement RPCs must remain virtual for QA.
async function setPasswordAndLogin(userId: string, address: string) {
  const { error } = await service.auth.admin.updateUserById(userId, { password: testPassword })
  assert.ifError(error)
  const client = createClient(apiUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const login = await client.auth.signInWithPassword({ email: address, password: testPassword })
  assert.ifError(login.error)
  return client
}
const qaClient = await setPasswordAndLogin(qaBId, qaBEmail)
const beforeQaRpc = await counts(qaBId)
const { data: qaEntitlementOne, error: qaEntitlementErrorOne } = await qaClient.rpc('get_my_subscription_summary')
assert.ifError(qaEntitlementErrorOne)
const { data: qaEntitlementTwo, error: qaEntitlementErrorTwo } = await qaClient.rpc('get_my_subscription_summary')
assert.ifError(qaEntitlementErrorTwo)
check(qaEntitlementOne.entitlement.source === 'internal_qa' && qaEntitlementOne.entitlement.accessLevel === 'pro' && qaEntitlementOne.entitlement.canUseProFeatures === true, 'QA RPC returns virtual Pro entitlement')
check(qaEntitlementOne.entitlement.billingAccountId === null && qaEntitlementOne.entitlement.subscriptionId === null, 'QA entitlement has no billing identifiers')
check(qaEntitlementOne.entitlement.trialStartedAt === null && qaEntitlementOne.entitlement.trialEndsAt === null && qaEntitlementOne.entitlement.currentPeriodEndsAt === null, 'QA entitlement has no trial or billing-period dates')
check(JSON.stringify(qaEntitlementTwo) === JSON.stringify(qaEntitlementOne), 'repeated QA entitlement RPC is stable')
check(JSON.stringify(await counts(qaBId)) === JSON.stringify(beforeQaRpc), 'repeated QA RPC creates no commercial state')

const customerClientForRpc = await setPasswordAndLogin(customerId, customerEmail)
const { data: customerEntitlement, error: customerEntitlementError } = await customerClientForRpc.rpc('get_my_subscription_summary')
assert.ifError(customerEntitlementError)
check(customerEntitlement.entitlement.source === 'trial' && customerEntitlement.entitlement.accessLevel === 'pro', 'customer RPC preserves trial Pro behavior')
check(!!customerEntitlement.entitlement.billingAccountId && !!customerEntitlement.entitlement.subscriptionId && !!customerEntitlement.entitlement.trialEndsAt, 'customer RPC includes billing/trial identifiers and dates')
check((await counts(customerId))[4] === 1 && (await counts(customerId))[5] === 1, 'customer entitlement RPC preserves billing and trial rows')

// Email suppression uses the actual registry lookup; provider calls are local counters only.
let providerCalls = 0
let suppressionCalls = 0
for (const [userId, expected] of [[qaBId, 'suppressed'], [customerId, 'sent']] as const) {
  const lookup = await service.from('internal_qa_accounts').select('user_id').eq('user_id', userId).maybeSingle()
  assert.ifError(lookup.error)
  const result = await dispatchEmailUnlessInternalQa({
    isInternalQa: !!lookup.data,
    onSuppressed: async () => { suppressionCalls += 1 },
    send: async () => { providerCalls += 1; return 'mock-provider' },
  })
  check(result.status === expected, `database-integrated email gate returns ${expected}`)
}
check(providerCalls === 1 && suppressionCalls === 1, 'QA recipient never invokes provider; customer path invokes mock once')

// Admin metrics: temporarily give QA an adversarial commercial row, then roll it back.
const adminEmail = email('metrics-admin')
const adminCreateResult = await adminCreate(adminEmail, { first_name: 'Harness', last_name: 'Admin', ...legal })
assert.ifError(adminCreateResult.error)
assert.ok(adminCreateResult.data.user)
const adminId = adminCreateResult.data.user.id
sql(`insert into public.admin_members(user_id,enabled,role) values (${quote(adminId)}::uuid,true,'owner')`)
sql(`insert into public.billing_accounts(owner_user_id) values (${quote(qaBId)}::uuid)`)
sql(`insert into public.account_subscriptions(billing_account_id,status,trial_ends_at) select id,'trialing',pg_catalog.now()+interval '30 days' from public.billing_accounts where owner_user_id=${quote(qaBId)}::uuid`)
const metricsSql = `begin; set local role authenticated; select pg_catalog.set_config('request.jwt.claims', ${quote(JSON.stringify({ sub: adminId, role: 'authenticated', aal: 'aal2' }))}, true); select public.admin_get_subscription_metrics(); select public.admin_list_subscriptions(100,0,null); rollback;`
const metricLines = sql(metricsSql).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
const metrics = JSON.parse(metricLines.find((line) => line.startsWith('{') && line.includes('"trialActive"')) ?? 'null') as Record<string, number>
const subscriptionList = JSON.parse(metricLines.find((line) => line.startsWith('{') && line.includes('"items"')) ?? 'null') as unknown
check(!!metrics && metrics.trialActive === Number(sql("select count(*) from public.account_subscriptions s join public.billing_accounts b on b.id=s.billing_account_id where s.status='trialing' and s.trial_ends_at>now() and b.owner_user_id not in (select user_id from public.internal_qa_accounts)")), 'subscription metrics exclude QA and include customer trials')
check(!!subscriptionList && !JSON.stringify(subscriptionList).includes(qaBId) && JSON.stringify(subscriptionList).includes(customerId), 'admin subscription list excludes QA and includes customer')
sql(`delete from public.billing_accounts where owner_user_id=${quote(qaBId)}::uuid`)
check((await counts(qaBId))[4] === 0 && (await counts(qaBId))[5] === 0, 'temporary QA metrics fixture removed')

// Role ACL and trigger ACL checks from the actual local catalogs.
const acl = JSON.parse(sql(`select json_build_object(
  'registry_client', has_table_privilege('anon','public.internal_qa_accounts','SELECT') or has_table_privilege('authenticated','public.internal_qa_accounts','SELECT') or has_table_privilege('anon','public.internal_qa_accounts','INSERT') or has_table_privilege('authenticated','public.internal_qa_accounts','INSERT') or has_table_privilege('anon','public.internal_qa_accounts','UPDATE') or has_table_privilege('authenticated','public.internal_qa_accounts','UPDATE') or has_table_privilege('anon','public.internal_qa_accounts','DELETE') or has_table_privilege('authenticated','public.internal_qa_accounts','DELETE'),
  'authz_client', has_table_privilege('anon','public.internal_qa_provisioning_authorizations','SELECT') or has_table_privilege('authenticated','public.internal_qa_provisioning_authorizations','SELECT') or has_table_privilege('anon','public.internal_qa_provisioning_authorizations','INSERT') or has_table_privilege('authenticated','public.internal_qa_provisioning_authorizations','INSERT') or has_table_privilege('anon','public.internal_qa_provisioning_authorizations','UPDATE') or has_table_privilege('authenticated','public.internal_qa_provisioning_authorizations','UPDATE') or has_table_privilege('anon','public.internal_qa_provisioning_authorizations','DELETE') or has_table_privilege('authenticated','public.internal_qa_provisioning_authorizations','DELETE'),
  'service_registry_select', has_table_privilege('service_role','public.internal_qa_accounts','SELECT'),
  'service_authz_select', has_table_privilege('service_role','public.internal_qa_provisioning_authorizations','SELECT'),
  'service_authz_insert', has_table_privilege('service_role','public.internal_qa_provisioning_authorizations','INSERT'),
  'helper_anon', has_function_privilege('anon','public.create_internal_qa_provisioning_authorization(text,text,text)','EXECUTE'),
  'helper_authenticated', has_function_privilege('authenticated','public.create_internal_qa_provisioning_authorization(text,text,text)','EXECUTE'),
  'helper_service', has_function_privilege('service_role','public.create_internal_qa_provisioning_authorization(text,text,text)','EXECUTE'),
  'handle_anon', has_function_privilege('anon','public.handle_new_user()','EXECUTE'),
  'handle_auth', has_function_privilege('authenticated','public.handle_new_user()','EXECUTE'),
  'billing_anon', has_function_privilege('anon','public.on_public_user_created_init_billing()','EXECUTE'),
  'billing_auth', has_function_privilege('authenticated','public.on_public_user_created_init_billing()','EXECUTE'),
  'preset_anon', has_function_privilege('anon','public.provision_official_pre_wedding_presets(uuid)','EXECUTE'),
  'preset_auth', has_function_privilege('authenticated','public.provision_official_pre_wedding_presets(uuid)','EXECUTE')
)::text`)) as Record<string, boolean>
check(acl.registry_client === false && acl.authz_client === false, 'anon/authenticated lack all table privileges')
check(acl.service_registry_select && !acl.service_authz_select && !acl.service_authz_insert, 'service role reads registry only and uses authorization RPC')
check(!acl.helper_anon && !acl.helper_authenticated && acl.helper_service, 'authorization helper is service-role only')
check(!acl.handle_anon && !acl.handle_auth && !acl.billing_anon && !acl.billing_auth && !acl.preset_anon && !acl.preset_auth, 'trigger routines cannot be executed directly by clients')
const anonAuthzRpc = await anon.rpc('create_internal_qa_provisioning_authorization', { p_nonce: randomBytes(32).toString('hex'), p_provisioned_by: 'anon', p_purpose: 'denied' })
check(!!anonAuthzRpc.error, 'anon authorization RPC is denied')

// Released Collaboration 1B deletion seam: the other account and snapshots survive.
const pairLow = qaAId < qaBId ? qaAId : qaBId
const pairHigh = qaAId < qaBId ? qaBId : qaAId
const connectionId = sql(`insert into public.collaboration_connections(participant_low_id,participant_high_id,participant_low_name_snapshot,participant_high_name_snapshot,status) values (${quote(pairLow)}::uuid,${quote(pairHigh)}::uuid,'QA snapshot A','QA snapshot B','active') returning id`)
const eventId = sql(`insert into public.collaboration_events(connection_id,actor_user_id,actor_name_snapshot,event_type,metadata) values (${quote(connectionId)}::uuid,${quote(qaAId)}::uuid,'QA snapshot A','collaboration_started','{"harness":true}'::jsonb) returning id`)
const deleteQaA = await service.auth.admin.deleteUser(qaAId)
assert.ifError(deleteQaA.error)
const collaborationAfterDelete = JSON.parse(sql(`select json_build_object(
 'connection_status',(select status from public.collaboration_connections where id=${quote(connectionId)}::uuid),
 'low_id',(select participant_low_id from public.collaboration_connections where id=${quote(connectionId)}::uuid),
 'high_id',(select participant_high_id from public.collaboration_connections where id=${quote(connectionId)}::uuid),
 'event_exists',exists(select 1 from public.collaboration_events where id=${quote(eventId)}::uuid),
 'event_actor',(select actor_user_id from public.collaboration_events where id=${quote(eventId)}::uuid),
 'registry_deleted',not exists(select 1 from public.internal_qa_accounts where user_id=${quote(qaAId)}::uuid),
 'other_auth_exists',exists(select 1 from auth.users where id=${quote(qaBId)}::uuid)
)::text`)) as Record<string, unknown>
check(collaborationAfterDelete.connection_status === 'ended', 'deleting QA-A ends the Collaboration 1B connection')
check(collaborationAfterDelete.event_exists && collaborationAfterDelete.event_actor === null, 'minimal Collaboration event snapshot remains with actor FK nulled')
check(collaborationAfterDelete.registry_deleted && collaborationAfterDelete.other_auth_exists, 'QA registry cascades and QA-B remains')
check(collaborationAfterDelete.low_id === null || collaborationAfterDelete.high_id === null, 'deleted participant FK is nulled without ownership transfer')
const deletedQaState = await counts(qaAId)
check(deletedQaState[0] === 0 && deletedQaState[1] === 0 && deletedQaState[2] === 0 && deletedQaState[3] === 0 && deletedQaState[4] === 0 && deletedQaState[5] === 0, 'QA-A profile/user/registry/legal/billing state is cleaned')
check((await counts(qaBId))[0] === 1 && (await counts(qaBId))[2] === 1, 'QA-B profile and registry are preserved')
const deleteReplayOwner = await service.auth.admin.deleteUser(replayOwner.data.user.id)
assert.ifError(deleteReplayOwner.error)
check(!(await authUser(replayOwnerEmail)), 'replay test QA account is removed after the one-time test')

console.log(`Auth integration: PASS ${passed} checks`)
console.log(`QA emails: ${qaAEmail}=ACCEPTED, ${qaBEmail}=ACCEPTED`)
console.log(`QA IDs: QA-A deleted after Collaboration check; QA-B remains ${qaBId}`)
console.log(`Metrics: ${JSON.stringify(metrics)}`)
