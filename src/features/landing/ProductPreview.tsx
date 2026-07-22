import { HeroShowcase } from '@/features/landing/HeroShowcase'
import { WORKFLOW_STAGE_LABELS } from '@/lib/utils/workflow'

/** @deprecated Use HeroShowcase — kept for older imports. */
export function HeroProductPreview({ className = '' }: { className?: string }) {
  return <HeroShowcase className={className} />
}

export function HeroProductFrame(props: { className?: string }) {
  return <HeroShowcase {...props} />
}

export function ProductPreview({ className = '' }: { className?: string }) {
  return <HeroShowcase className={className} />
}

export { WORKFLOW_STAGE_LABELS }
