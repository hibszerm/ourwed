import { Link } from 'react-router-dom'
import { Bell, Building2, MapPin, Package, Palette, Plug, Users } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import styles from '@/features/documents/DocumentsTemplates.module.css'

const companyLinks = [
  {
    to: '/ustawienia/firma',
    title: 'Dane firmy',
    description: 'Nazwa firmy, NIP, adres, konto bankowe, logo i podpis.',
    icon: Building2,
  },
  {
    to: '/studio/pakiety',
    title: 'Pakiety',
    description: 'Oferta, ceny i zawartość pakietów używanych w projektach.',
    icon: Package,
  },
  {
    to: '/ustawienia/podroz',
    title: 'Rozliczanie dojazdu',
    description:
      'Konfiguracja punktu startowego i zasad rozliczania dojazdów.',
    icon: MapPin,
  },
] as const

const appearanceLinks = [
  {
    to: '/ustawienia/wyglad',
    title: 'Wygląd',
    description: 'Motyw kolorystyczny panelu OurWed.',
    icon: Palette,
  },
] as const

const accountLinks = [
  {
    title: 'Konto',
    description: 'Dane logowania i bezpieczeństwo konta.',
    soon: true,
    icon: Users,
  },
  {
    title: 'Zespół',
    description: 'Zaproszenia i role współpracowników.',
    soon: true,
    icon: Users,
  },
  {
    to: '/ustawienia/integracje',
    title: 'Integracje',
    description: 'Google Calendar i Apple Calendar.',
    icon: Plug,
  },
  {
    title: 'Powiadomienia',
    description: 'Alerty e-mail i w aplikacji.',
    soon: true,
    icon: Bell,
  },
] as const

export function SettingsPage() {
  return (
    <AppLayout title="Ustawienia" subtitle="Konfiguracja firmy i konta">
      <PageContainer width="wide">
        <div className={styles.page}>
          <section className={styles.settingsSection}>
            <h2 className={styles.settingsSectionTitle}>Firma</h2>
            <div className={styles.hubGrid}>
              {companyLinks.map(({ to, title, description, icon: Icon }) => (
                <Link key={to} to={to} className={styles.hubCard}>
                  <span className={styles.iconWrap}>
                    <Icon size={22} strokeWidth={1.75} />
                  </span>
                  <h3 className={styles.hubCardTitle}>{title}</h3>
                  <p className={styles.hubCardDesc}>{description}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className={styles.settingsSection}>
            <h2 className={styles.settingsSectionTitle}>Personalizacja</h2>
            <div className={styles.hubGrid}>
              {appearanceLinks.map(({ to, title, description, icon: Icon }) => (
                <Link key={to} to={to} className={styles.hubCard}>
                  <span className={styles.iconWrap}>
                    <Icon size={22} strokeWidth={1.75} />
                  </span>
                  <h3 className={styles.hubCardTitle}>{title}</h3>
                  <p className={styles.hubCardDesc}>{description}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className={styles.settingsSection}>
            <h2 className={styles.settingsSectionTitle}>Konto</h2>
            <div className={styles.hubGrid}>
              {accountLinks.map((link) => {
                const Icon = link.icon
                if ('to' in link && link.to) {
                  return (
                    <Link key={link.to} to={link.to} className={styles.hubCard}>
                      <span className={styles.iconWrap}>
                        <Icon size={22} strokeWidth={1.75} />
                      </span>
                      <h3 className={styles.hubCardTitle}>{link.title}</h3>
                      <p className={styles.hubCardDesc}>{link.description}</p>
                    </Link>
                  )
                }
                return (
                  <div key={link.title} className={styles.hubCard} aria-disabled>
                    <span className={styles.iconWrap}>
                      <Icon size={22} strokeWidth={1.75} />
                    </span>
                    <h3 className={styles.hubCardTitle}>{link.title}</h3>
                    <p className={styles.hubCardDesc}>{link.description}</p>
                    <p className={styles.hubCardSoon}>Wkrótce</p>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </PageContainer>
    </AppLayout>
  )
}
