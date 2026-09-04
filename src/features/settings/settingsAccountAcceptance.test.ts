/**
 * Settings Phase 2 — Account presentation.
 * Profile / Appearance / Notification preferences share the Settings workspace
 * grammar without changing persistence, taxonomy, or Studio pages.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  settings-account — ${msg}`)
}

const profile = read('src/pages/AccountSettingsPage.tsx')
const appearance = read('src/pages/AppearanceSettingsPage.tsx')
const appearanceCss = read('src/pages/AppearanceSettingsPage.module.css')
const notifications = read('src/pages/NotificationSettingsPage.tsx')
const workspace = read('src/features/settings/SettingsWorkspace.tsx')
const workspaceCss = read('src/features/settings/SettingsWorkspace.module.css')
const themeCard = read('src/features/theme/ThemePreviewCard.tsx')
const themeCardCss = read('src/features/theme/ThemePreviewCard.module.css')
const styleTypes = read('src/features/interface-style/types.ts')
const styleCardCss = read('src/features/interface-style/InterfaceStyleCard.module.css')
const nav = read('src/features/settings/settingsNav.ts')
const layout = read('src/features/settings/SettingsLayout.tsx')
const company = read('src/pages/CompanyDetailsPage.tsx')
const travel = read('src/pages/TravelSettingsPage.tsx')

assert(profile.includes('SettingsWorkspace'), 'profile workspace')
assert(profile.includes('SettingsSection'), 'profile sections')
assert(profile.includes('SettingsFieldGrid'), 'profile name grid')
assert(profile.includes('columns={2}'), 'desktop 2-col names')
assert(profile.includes('SettingsReadonlyField'), 'readonly email')
assert(!profile.includes('<Input') || profile.includes('label="Imię"'), 'name inputs remain')
assert(!profile.includes('readOnly'), 'email is not an input')
assert(
  profile.includes('Adres używany do logowania i powiadomień e-mail.'),
  'email helper is truthful',
)
assert(
  !profile.includes('Zmiana adresu e-mail będzie dostępna osobno.'),
  'no email-change future promise',
)
assert(profile.includes('Zapisz'), 'save label')
assert(profile.includes('Zapisywanie…'), 'saving label')
assert(profile.includes('Zapisano'), 'saved label')
assert(profile.includes('disabled={!canSave}'), 'dirty gate')
assert(profile.includes('useUpdateAccountNames'), 'name mutation preserved')
assert(profile.includes('useAccountProfile'), 'profile query preserved')
assert(!profile.includes('autosave'), 'no profile autosave')
assert(profile.includes('width="full"'), 'profile uses full workspace width')

assert(appearance.includes('SettingsWorkspace'), 'appearance workspace')
assert(appearance.includes('Styl interfejsu'), 'style section')
assert(appearance.includes('Motyw aplikacji'), 'theme section')
assert(appearance.includes('useInterfaceStyle'), 'style hook')
assert(appearance.includes('useTheme'), 'theme hook')
assert(appearance.includes('handleSelectStyle'), 'style handler')
assert(appearance.includes('handleSelectTheme'), 'theme handler')
assert(appearance.includes('Zapisywanie…'), 'appearance saving')
assert(appearance.includes('Zapisano'), 'appearance saved')
assert(!appearance.includes('Zapisz zmiany'), 'no global save CTA')
assert(appearanceCss.includes('minmax(13.5rem, 1fr)'), 'compact theme grid')
assert(themeCardCss.includes('height: 40px'), 'compact theme preview')
assert(!themeCard.includes('previewTitle'), 'no fake dashboard chrome')
assert(themeCard.includes('--tp-sidebar'), 'token swatches')
assert(styleTypes.includes("id: 'classic'"), 'classic style id frozen')
assert(styleTypes.includes("id: 'modern'"), 'modern style id frozen')
assert(styleTypes.includes('Interfejs Classic'), 'classic style display name')
assert(styleTypes.includes('Interfejs Modern'), 'modern style display name')
assert(styleCardCss.includes('min-height: var(--touch-target)'), 'style card target')
assert(themeCardCss.includes('min-height: var(--touch-target)'), 'theme card target')

assert(notifications.includes('Preferencje powiadomień'), 'prefs title')
assert(notifications.includes('title="E-mail"'), 'email section')
assert(notifications.includes('SettingsPreferenceList'), 'preference list')
assert(notifications.includes('SettingsSwitch'), 'shared switch')
assert(notifications.includes('notificationPreferencesService'), 'prefs service')
assert(!notifications.includes('type="checkbox"'), 'no native tiny checkbox')
assert(workspace.includes('role="switch"'), 'switch role')
assert(workspaceCss.includes('.switch'), 'switch styles')
{
  const switchBlock = workspaceCss.slice(
    workspaceCss.indexOf('.switch {'),
    workspaceCss.indexOf('.switchTrack'),
  )
  assert(switchBlock.includes('var(--touch-target)'), 'switch 44px hit area')
}

assert(nav.includes("path: '/ustawienia/konto'"), 'profile path')
assert(nav.includes("path: '/ustawienia/wyglad'"), 'appearance path')
assert(nav.includes("path: '/ustawienia/powiadomienia'"), 'prefs path')
assert(nav.includes("label: 'Profil'"), 'profile nav')
assert(nav.includes("label: 'Wygląd'"), 'appearance nav')
assert(nav.includes("label: 'Preferencje powiadomień'"), 'prefs nav')
  assert(layout.includes('SettingsPrimaryNavigation'), 'shell primary kept')
  assert(layout.includes('pageTitleGroup'), 'mobile Account heading uses Konto, not a second Profil')
  assert(company.includes('SettingsWorkspace'), 'studio company untouched grammar')
assert(travel.includes('SettingsWorkspace'), 'studio travel untouched grammar')
assert(!company.includes('Interfejs Classic'), 'company not restyled as appearance')

const hexInNotif = /#[0-9A-Fa-f]{3,8}/.test(notifications)
assert(!hexInNotif, 'notification page has no hardcoded hex')

console.log('PASS  settings-account presentation')
