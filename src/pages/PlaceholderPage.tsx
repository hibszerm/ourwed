import type { ReactNode } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { EmptyState } from '@/components/ui/EmptyState'

export function PlaceholderPage({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon: ReactNode
}) {
  return (
    <AppLayout title={title}>
      <EmptyState
        icon={icon}
        title={description}
        description="Ta sekcja będzie dostępna w kolejnej wersji aplikacji."
      />
    </AppLayout>
  )
}
