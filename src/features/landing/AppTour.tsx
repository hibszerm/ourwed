import { LandingDemo } from '@/features/landing/LandingDemo'
import styles from './AppTour.module.css'

/** Full interactive product tour on the landing page. */
export function AppTour() {
  return <LandingDemo />
}

/** Kept for any older imports that referenced the shell styles. */
export { styles as appTourStyles }
