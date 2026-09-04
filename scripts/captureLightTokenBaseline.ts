import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { THEME_IDS } from '@/features/theme/types'
import { resolveThemeCssVariables } from '@/features/theme/themeRegistry'

const baseline: Record<string, Record<string, string>> = {}
for (const id of THEME_IDS) {
  baseline[id] = resolveThemeCssVariables(id)
}

const outDir = resolve(process.cwd(), 'src/features/appearance')
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, 'lightThemeTokenBaseline.json')
writeFileSync(outPath, JSON.stringify(baseline, null, 2))
console.log('Wrote', outPath, Object.keys(baseline.classic).length, 'keys per theme')
