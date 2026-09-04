import { Navigate } from 'react-router-dom'
import { SETTINGS_DEFAULT_DESKTOP_PATH } from '@/features/settings/settingsNav'

/**
 * /ustawienia always opens the Settings workspace at the Studio default
 * destination. Top-level Studio / Konto / Integracje / Subskrypcja tabs
 * live in SettingsLayout on every viewport — there is no separate mobile
 * directory.
 */
export function SettingsPage() {
  return <Navigate to={SETTINGS_DEFAULT_DESKTOP_PATH} replace />
}
