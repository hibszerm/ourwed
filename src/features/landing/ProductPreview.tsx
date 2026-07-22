import { LandingDemo } from '@/features/landing/LandingDemo'
import { WORKFLOW_STAGE_LABELS } from '@/lib/utils/workflow'
import styles from './ProductPreview.module.css'

export const PREVIEW_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'weddings', label: 'Śluby' },
  { id: 'questionnaires', label: 'Ankiety' },
  { id: 'travel', label: 'Travel' },
  { id: 'finance', label: 'Finanse' },
  { id: 'calendar', label: 'Kalendarz' },
] as const

export type PreviewTabId = (typeof PREVIEW_TABS)[number]['id']

/** Hero product preview — real interactive demo (compact). */
export function HeroProductPreview({ className = '' }: { className?: string }) {
  return (
    <div className={`${styles.heroRoot} ${className}`.trim()}>
      <LandingDemo compact />
    </div>
  )
}

export function HeroProductFrame(props: { className?: string }) {
  return <HeroProductPreview {...props} />
}

export function ProductPreview({ className = '' }: { className?: string }) {
  return <HeroProductPreview className={className} />
}

export { WORKFLOW_STAGE_LABELS }
