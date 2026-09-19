/**
 * Strip internal/debug tokens from user-visible V7 answers.
 */

const LEAK_PATTERNS: RegExp[] = [
  /\brs_[a-z0-9]+\b/gi,
  /\bFIN\.[A-Z0-9_]+\b/g,
  /\bCONTACT\.[A-Z0-9_]+\b/g,
  /\bWEDDING\.[A-Z0-9_]+\b/g,
  /\bCONTRACT\.[A-Z0-9_]+\b/g,
  /\bPLACE\.[A-Z0-9_]+\b/g,
  /\bPKG\.[A-Z0-9_]+\b/g,
  /\bQ\.[A-Z0-9_]+\b/g,
  /\bTASK\.[A-Z0-9_]+\b/g,
  /\bTRAVEL\.[A-Z0-9_]+\b/g,
  /\bOPS\.[A-Z0-9_]+\b/g,
  /\bCOMPARATOR_NOT_ALLOWED\b/g,
  /\bNOT_FAITHFUL\b/g,
  /\bTurnPlan\b/gi,
  /\bConversationCollection\b/gi,
  /\bTOOL_ERROR\b/g,
  /\bUUID\b/gi,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
  /\bsearch_resources\b/g,
  /\brefine_resources\b/g,
  /\baggregate_resources\b/g,
  /\binspect_resource\b/g,
  /\blist_related\b/g,
  /\bdescribe_resource_set\b/g,
  /\bsort_resources\b/g,
]

export function sanitizeV7UserText(text: string): string {
  let out = text
  for (const re of LEAK_PATTERNS) {
    out = out.replace(re, '')
  }
  return out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

export function containsV7InternalLeak(text: string): boolean {
  return LEAK_PATTERNS.some((re) => {
    re.lastIndex = 0
    return re.test(text)
  })
}
