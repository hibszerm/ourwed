/**
 * Polish duration inflection for coverage hours in contract prose.
 * Re-export from lib for template modules.
 */
export {
  polishHourWord,
  formatPolishHours,
  formatCoverageDurationForSource,
  stripClockTimeFromDuration,
  extractClockTimeOnly,
  looksLikeClockTime,
  durationContainsClockTime,
} from '@/lib/utils/polishDuration'
