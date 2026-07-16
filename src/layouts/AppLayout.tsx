import type { ReactNode } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Sidebar } from './Sidebar'
import styles from './AppLayout.module.css'

interface AppLayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
  action?: ReactNode
}

export function AppLayout({ children, title, subtitle, action }: AppLayoutProps) {
  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <PageHeader title={title} subtitle={subtitle} action={action} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  )
}
