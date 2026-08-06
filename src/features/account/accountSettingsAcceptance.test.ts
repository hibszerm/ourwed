/**
 * Account settings acceptance — profile name edit against public.profiles.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { accountProfileSchema } from '@/features/account/accountProfileSchema'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  account-settings — ${msg}`)
}

const page = readFileSync(join(ROOT, 'src/pages/AccountSettingsPage.tsx'), 'utf8')
const service = readFileSync(
  join(ROOT, 'src/features/account/profileService.ts'),
  'utf8',
)
const schemaSrc = readFileSync(
  join(ROOT, 'src/features/account/accountProfileSchema.ts'),
  'utf8',
)
const studioUser = readFileSync(join(ROOT, 'src/lib/api/studioUser.ts'), 'utf8')
const settings = readFileSync(join(ROOT, 'src/pages/SettingsPage.tsx'), 'utf8')
const router = readFileSync(join(ROOT, 'src/routes/router.tsx'), 'utf8')
const rls = readFileSync(
  join(ROOT, 'supabase/migrations/20260722140000_auth_profiles.sql'),
  'utf8',
)
const adminIdentity = readFileSync(
  join(ROOT, 'supabase/migrations/20260806200000_admin_user_identity_fields.sql'),
  'utf8',
)

assert(existsSync(join(ROOT, 'src/pages/AccountSettingsPage.tsx')), 'page exists')
assert(router.includes("/ustawienia/konto"), 'route registered')
assert(router.includes('AccountSettingsPage'), 'page imported')
assert(settings.includes("to: '/ustawienia/konto'"), 'settings hub link')
assert(settings.includes("title: 'Konto'"), 'konto title')
assert(settings.includes("Imię, nazwisko i dane konta."), 'konto description')

// Customer account module must not ship service_role
for (const file of [
  'src/features/account/profileService.ts',
  'src/features/account/useAccountProfile.ts',
  'src/pages/AccountSettingsPage.tsx',
]) {
  const src = readFileSync(join(ROOT, file), 'utf8')
  assert(!/service_role|SERVICE_ROLE_KEY|createClient\([^)]*service/i.test(src), `no service_role in ${file}`)
}
assert(rls.includes('auth.uid() = id'), 'profiles RLS owner')
assert(rls.includes('profiles_update_own'), 'update own policy')
assert(rls.includes('with check (auth.uid() = id)'), 'with check owner')
assert(!rls.includes('using (true)'), 'no open using')

// Service
assert(service.includes(".from('profiles')"), 'reads profiles')
assert(service.includes('first_name'), 'updates first_name')
assert(service.includes('last_name'), 'updates last_name')
assert(service.includes('.eq(\'id\', auth.id)'), 'scoped to auth user')
assert(service.includes('clearStudioUserCache'), 'clears studio cache')
assert(!service.includes('SERVICE_ROLE'), 'no service role')
assert(!service.includes('service_role'), 'no service_role')
assert(!service.includes('user_id: input'), 'no arbitrary user id from form')

// Prefer profiles in sidebar source
assert(studioUser.includes(".from('profiles')"), 'studioUser reads profiles')
assert(studioUser.includes('profileName || metadataName'), 'profile priority')

// Page UX
assert(page.includes('Zapisz zmiany'), 'save label')
assert(page.includes('Dane konta zostały zapisane.'), 'success copy')
assert(page.includes('Nie udało się zapisać danych. Spróbuj ponownie.'), 'error copy')
assert(page.includes('autoComplete="given-name"'), 'given-name')
assert(page.includes('autoComplete="family-name"'), 'family-name')
assert(page.includes('autoComplete="email"'), 'email autocomplete')
assert(page.includes('readOnly'), 'email readonly')
assert(page.includes('aria-live="polite"'), 'aria-live')
assert(page.includes('disabled={!canSave}'), 'dirty save gate')
assert(!page.includes('Zmień e-mail'), 'no email edit CTA')

// Admin unchanged identity model
assert(adminIdentity.includes('public.profiles'), 'admin still reads profiles')
assert(adminIdentity.includes('admin_compose_account_identity'), 'admin helper intact')

// Validation
assert(accountProfileSchema.safeParse({ firstName: '', lastName: 'Kowalska' }).success === false, 'empty first blocked')
assert(accountProfileSchema.safeParse({ firstName: 'Anna', lastName: '' }).success === false, 'empty last blocked')
assert(accountProfileSchema.safeParse({ firstName: 'A'.repeat(61), lastName: 'K' }).success === false, 'long first blocked')
assert(accountProfileSchema.safeParse({ firstName: 'A', lastName: 'B'.repeat(81) }).success === false, 'long last blocked')
assert(
  accountProfileSchema.safeParse({ firstName: '  Anna  ', lastName: '  Nowak-Kowalska  ' }).success,
  'trim + hyphen ok',
)
assert(
  accountProfileSchema.safeParse({ firstName: 'Zofia', lastName: "O'Brien" }).success,
  'apostrophe ok',
)
assert(
  accountProfileSchema.safeParse({ firstName: 'Łukasz', lastName: 'Żółć' }).success,
  'Polish chars ok',
)
const trimmed = accountProfileSchema.parse({
  firstName: '  Anna  ',
  lastName: '  Kowalska  ',
})
assert(trimmed.firstName === 'Anna' && trimmed.lastName === 'Kowalska', 'whitespace trimmed')

assert(schemaSrc.includes('.max(60'), 'max first')
assert(schemaSrc.includes('.max(80'), 'max last')

console.log('PASS  account-settings')
