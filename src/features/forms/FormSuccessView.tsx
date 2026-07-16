import type { FormSettings, FormTemplate } from '@/types/form'
import styles from './FormPublicPage.module.css'

export function FormSuccessView({
  settings,
  template,
}: {
  settings: FormSettings
  template: FormTemplate
}) {
  return (
    <div className={styles.shell}>
      <div className={styles.success}>
        <div className={styles.illustration} aria-hidden="true">
          <span className={styles.illustrationMark} />
        </div>
        <h1 className={styles.title}>
          {settings.successTitle || template.successTitle}
        </h1>
        <p className={styles.lead}>
          {settings.successDescription || template.successDescription}
        </p>
      </div>
      <p className={styles.footer}>{settings.footerMessage}</p>
    </div>
  )
}
