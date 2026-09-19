import { SettingsLayout } from '@/features/settings/SettingsLayout'
import {
  SettingsPreferenceList,
  SettingsPreferenceRow,
  SettingsSaveStatus,
  SettingsSection,
  SettingsSectionHeader,
  SettingsSwitch,
  SettingsWorkspace,
} from '@/features/settings/SettingsWorkspace'
import { PageContainer } from '@/components/ui/PageContainer'
import { ThemePreviewCard } from '@/features/theme/ThemePreviewCard'
import { useTheme } from '@/features/theme/ThemeProvider'
import type { ThemeId } from '@/features/theme/types'
import { AppearanceCard } from '@/features/appearance/AppearanceCard'
import { useAppearance } from '@/features/appearance/useAppearance'
import {
  APPEARANCE_OPTIONS,
  type Appearance,
} from '@/features/appearance/types'
import { useGuideIntegrationPreference } from '@/features/onboarding/guide/useGuideIntegrationPreference'
import styles from './AppearanceSettingsPage.module.css'

export function AppearanceSettingsPage() {
  const {
    themeId,
    availableThemes,
    setTheme,
    persistStatus,
    persistError,
  } = useTheme()
  const {
    appearance,
    setAppearance,
    persistStatus: appearancePersistStatus,
    persistError: appearancePersistError,
  } = useAppearance()
  const { preference: guidePreference, setSidebarVisible } =
    useGuideIntegrationPreference()

  async function handleSelectTheme(id: ThemeId) {
    if (id === themeId && persistStatus !== 'error') return
    await setTheme(id)
  }

  async function handleSelectAppearance(id: Appearance) {
    if (id === appearance && appearancePersistStatus !== 'error') return
    await setAppearance(id)
  }

  const combinedStatus =
    persistStatus === 'error' || appearancePersistStatus === 'error'
      ? 'error'
      : persistStatus === 'saving' || appearancePersistStatus === 'saving'
        ? 'saving'
        : persistStatus === 'saved' || appearancePersistStatus === 'saved'
          ? 'saved'
          : 'idle'

  const statusLabel =
    combinedStatus === 'saving'
      ? 'Zapisywanie…'
      : combinedStatus === 'saved'
        ? 'Zapisano'
        : combinedStatus === 'error'
          ? persistError ||
            appearancePersistError ||
            'Nie udało się zapisać wyglądu'
          : null

  return (
    <SettingsLayout
      title="Wygląd"
      subtitle="Tryb jasny/ciemny, motyw kolorystyczny i nawigacja panelu OurWed."
      action={
        statusLabel ? (
          <SettingsSaveStatus status={combinedStatus}>
            {statusLabel}
          </SettingsSaveStatus>
        ) : null
      }
    >
      <PageContainer width="full">
        <SettingsWorkspace>
          <SettingsSection labelledBy="appearance-mode-heading">
            <SettingsSectionHeader
              id="appearance-mode-heading"
              title="Wygląd"
              description="Jasny lub ciemny tryb panelu. Nie korzysta z ustawień systemowych — wybór jest zapisywany na Twoim koncie."
            />
            <div
              className={styles.styleGrid}
              role="radiogroup"
              aria-label="Wygląd aplikacji"
            >
              {APPEARANCE_OPTIONS.map((option) => (
                <AppearanceCard
                  key={option.id}
                  id={option.id}
                  name={option.name}
                  description={option.description}
                  selected={option.id === appearance}
                  disabled={appearancePersistStatus === 'saving'}
                  onSelect={(id) => void handleSelectAppearance(id)}
                />
              ))}
            </div>
          </SettingsSection>

          <SettingsSection labelledBy="appearance-nav-heading">
            <SettingsSectionHeader
              id="appearance-nav-heading"
              title="Nawigacja"
              description="Elementy bocznego menu, które możesz dostosować do swojej pracy."
            />
            <SettingsPreferenceList>
              <SettingsPreferenceRow
                titleId="guide-sidebar-visible-title"
                title="Pokazuj Przewodnik w menu"
                description="Przewodnik możesz ukryć z bocznego menu i przywrócić tutaj w dowolnym momencie."
                control={
                  <SettingsSwitch
                    id="guide-sidebar-visible"
                    checked={guidePreference.sidebarVisible}
                    labelledBy="guide-sidebar-visible-title"
                    testId="pref-guide-sidebar-visible"
                    onCheckedChange={setSidebarVisible}
                  />
                }
              />
            </SettingsPreferenceList>
          </SettingsSection>

          <SettingsSection labelledBy="appearance-theme-heading">
            <SettingsSectionHeader
              id="appearance-theme-heading"
              title="Motyw aplikacji"
              description="Kolorystyka panelu OurWed. Motyw jest zapisywany na Twoim koncie."
            />
            <div
              className={styles.themeGrid}
              role="radiogroup"
              aria-label="Motyw aplikacji"
            >
              {availableThemes.map((theme) => (
                <ThemePreviewCard
                  key={theme.id}
                  theme={theme}
                  selected={theme.id === themeId}
                  disabled={persistStatus === 'saving'}
                  onSelect={(id) => void handleSelectTheme(id)}
                />
              ))}
            </div>
          </SettingsSection>
        </SettingsWorkspace>
      </PageContainer>
    </SettingsLayout>
  )
}
