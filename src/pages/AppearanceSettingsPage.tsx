import { SettingsLayout } from '@/features/settings/SettingsLayout'
import {
  SettingsSaveStatus,
  SettingsSection,
  SettingsSectionHeader,
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
import { InterfaceStyleCard } from '@/features/interface-style/InterfaceStyleCard'
import { useInterfaceStyle } from '@/features/interface-style/useInterfaceStyle'
import {
  INTERFACE_STYLE_OPTIONS,
  type InterfaceStyle,
} from '@/features/interface-style/types'
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
  const {
    interfaceStyle,
    setInterfaceStyle,
    persistStatus: stylePersistStatus,
    persistError: stylePersistError,
  } = useInterfaceStyle()

  async function handleSelectTheme(id: ThemeId) {
    if (id === themeId && persistStatus !== 'error') return
    await setTheme(id)
  }

  async function handleSelectAppearance(id: Appearance) {
    if (id === appearance && appearancePersistStatus !== 'error') return
    await setAppearance(id)
  }

  async function handleSelectStyle(id: InterfaceStyle) {
    if (id === interfaceStyle && stylePersistStatus !== 'error') return
    await setInterfaceStyle(id)
  }

  const combinedStatus =
    persistStatus === 'error' ||
    appearancePersistStatus === 'error' ||
    stylePersistStatus === 'error'
      ? 'error'
      : persistStatus === 'saving' ||
          appearancePersistStatus === 'saving' ||
          stylePersistStatus === 'saving'
        ? 'saving'
        : persistStatus === 'saved' ||
            appearancePersistStatus === 'saved' ||
            stylePersistStatus === 'saved'
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
            stylePersistError ||
            'Nie udało się zapisać wyglądu'
          : null

  return (
    <SettingsLayout
      title="Wygląd"
      subtitle="Tryb jasny/ciemny, styl interfejsu i motyw kolorystyczny panelu OurWed."
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

          <SettingsSection labelledBy="appearance-style-heading">
            <SettingsSectionHeader
              id="appearance-style-heading"
              title="Styl interfejsu"
              description="Wybierz układ ekranów. To nie jest motyw kolorystyczny — Classic i Modern zapisują się niezależnie od palety."
            />
            <div
              className={styles.styleGrid}
              role="radiogroup"
              aria-label="Styl interfejsu"
            >
              {INTERFACE_STYLE_OPTIONS.map((option) => (
                <InterfaceStyleCard
                  key={option.id}
                  id={option.id}
                  name={option.name}
                  description={option.description}
                  selected={option.id === interfaceStyle}
                  disabled={stylePersistStatus === 'saving'}
                  onSelect={(id) => void handleSelectStyle(id)}
                />
              ))}
            </div>
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
