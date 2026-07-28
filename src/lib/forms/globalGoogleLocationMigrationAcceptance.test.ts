/**
 * Global Google location migration — every active address surface uses Google.
 * Fails if active runtime still imports Geoapify.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walkTsFiles(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) out.push(full)
  }
  return out
}

run('1–5. Contract + four wedding locations use AddressField / Google provider', () => {
  const qf = readFileSync(
    resolve(process.cwd(), 'src/features/forms/QuestionField.tsx'),
    'utf8',
  )
  assert(qf.includes('<AddressField'), 'QuestionField → AddressField')
  const blocks = readFileSync(
    resolve(process.cwd(), 'src/types/questionnaireBlocks.ts'),
    'utf8',
  )
  assert(blocks.includes('bridePreparationLocation'), 'bride')
  assert(blocks.includes('groomPreparationLocation'), 'groom')
  assert(blocks.includes('ceremonyLocation'), 'ceremony')
  assert(blocks.includes('receptionLocation'), 'reception')
  assert(blocks.includes('partner1.address'), 'contract address')
  const addr = readFileSync(
    resolve(process.cwd(), 'src/features/forms/AddressField.tsx'),
    'utf8',
  )
  assert(addr.includes('createDefaultAddressAutocompleteProvider'), 'google factory')
  assert(!addr.includes('geoapify'), 'no geoapify in AddressField')
})

run('6–7. Wedding wizard + wedding details use Google search', () => {
  const wizard = readFileSync(
    resolve(process.cwd(), 'src/pages/NewWeddingPage.tsx'),
    'utf8',
  )
  assert(wizard.includes('AddressField'), 'wizard AddressField')
  const hero = readFileSync(
    resolve(process.cwd(), 'src/features/weddings/components/detail/WeddingDetailHero.tsx'),
    'utf8',
  )
  assert(hero.includes('WeddingLocationEditor'), 'hero location editor')
  const loc = readFileSync(
    resolve(process.cwd(), 'src/features/travel/LocationSearchField.tsx'),
    'utf8',
  )
  assert(loc.includes('createDefaultAddressAutocompleteProvider'), 'google')
  assert(loc.includes('mapSuggestionAndResolvedToGeoPlace'), 'shared venue map')
  assert(!loc.includes('geoapifyService'), 'no geoapify service')
  assert(!loc.includes('travelProvider.getAutocomplete'), 'no old autocomplete')
})

run('8–9. Travel origin + destination use Google', () => {
  const settings = readFileSync(
    resolve(process.cwd(), 'src/pages/TravelSettingsPage.tsx'),
    'utf8',
  )
  assert(settings.includes('PlacePicker'), 'place picker')
  const picker = readFileSync(
    resolve(process.cwd(), 'src/features/travel/PlacePicker.tsx'),
    'utf8',
  )
  assert(picker.includes('LocationSearchField'), 'picker → search')
  const travel = readFileSync(
    resolve(process.cwd(), 'src/services/travelProvider.ts'),
    'utf8',
  )
  assert(travel.includes('places-proxy') || travel.includes('PLACES_PROXY'), 'places')
  assert(travel.includes('computeGoogleRoute'), 'routes')
  assert(!travel.includes('geoapify'), 'no geoapify')
})

run('10. Active src has no Geoapify runtime imports', () => {
  const forbidden = [
    'geoapifyService',
    'geoapifyReliability',
    'from \'@/services/geoapify',
    'from "@/services/geoapify',
    'api.geoapify.com',
    'VITE_GEOAPIFY_API_KEY',
  ]
  const root = resolve(process.cwd(), 'src')
  const files = walkTsFiles(root)
  const offenders: string[] = []
  for (const file of files) {
    // Allow legacy provider string mentions in types / comments for historical rows.
    if (file.endsWith('types/travel.ts')) continue
    if (file.includes('Acceptance.test')) continue
    const src = readFileSync(file, 'utf8')
    for (const token of forbidden) {
      if (src.includes(token)) offenders.push(`${file} :: ${token}`)
    }
  }
  assert(offenders.length === 0, `Forbidden Geoapify usage:\n${offenders.join('\n')}`)
})

run('legacy historical provider string still readable in domain type', () => {
  const types = readFileSync(resolve(process.cwd(), 'src/types/travel.ts'), 'utf8')
  assert(types.includes("'geoapify'"), 'legacy read compat')
})

console.log('\nglobal google location migration: done')
