import { Link } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { ThemePreviewCard } from '@/features/theme/ThemePreviewCard'
import { useTheme } from '@/features/theme/ThemeProvider'
import type { ThemeId } from '@/features/theme/types'
import styles from './AppearanceSettingsPage.module.css'

export function AppearanceSettingsPage() {
  const {
    themeId,
    availableThemes,
    setTheme,
    persistStatus,
    persistError,
    isReconciling,
  } = useTheme()

  async function handleSelect(id: ThemeId) {
    if (id === themeId && persistStatus !== 'error') return
    await setTheme(id)
  }

  const statusLabel =
    persistStatus === 'saving'
      ? 'Zapisywanie…'
      : persistStatus === 'saved'
        ? 'Zapisano'
        : persistStatus === 'error'
          ? 'Nie udało się zapisać motywu'
          : isReconciling
            ? 'Wczytywanie…'
            : null

  return (
    <AppLayout
      title="Wygląd"
      subtitle="Personalizacja panelu OurWed"
    >
      <PageContainer width="wide">
        <div className={styles.page}>
          <p className={styles.back}>
            <Link to="/ustawienia" className={styles.backLink}>
              ← Ustawienia
            </Link>
          </p>

          <header className={styles.header}>
            <div>
              <h2 className={styles.title}>Motyw aplikacji</h2>
              <p className={styles.lead}>
                Wybierz kolorystykę panelu OurWed. Motyw jest zapisywany na
                Twoim koncie.
              </p>
            </div>
            <div
              className={styles.status}
              role="status"
              aria-live="polite"
              data-state={persistStatus}
            >
              {statusLabel}
              {persistError ? (
                <span className={styles.errorDetail}> — {persistError}</span>
              ) : null}
            </div>
          </header>

          <div
            className={styles.grid}
            role="radiogroup"
            aria-label="Motyw aplikacji"
          >
            {availableThemes.map((theme) => (
              <ThemePreviewCard
                key={theme.id}
                theme={theme}
                selected={theme.id === themeId}
                disabled={persistStatus === 'saving'}
                onSelect={(id) => void handleSelect(id)}
              />
            ))}
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  )
}
