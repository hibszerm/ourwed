/**
 * Acceptance: Polish locative city inflection (deterministic, no AI).
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/utils/toPolishLocativeCityAcceptance.test.ts
 */

import { toPolishLocativeCity } from './toPolishLocativeCity'

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

const CASES: Array<[string, string]> = [
  ['Zabrze', 'Zabrzu'],
  ['Warszawa', 'Warszawie'],
  ['Kraków', 'Krakowie'],
  ['Poznań', 'Poznaniu'],
  ['Katowice', 'Katowicach'],
  ['Tychy', 'Tychach'],
  ['Bytom', 'Bytomiu'],
  ['Wrocław', 'Wrocławiu'],
  ['Gdańsk', 'Gdańsku'],
  ['Łódź', 'Łodzi'],
  ['Sopot', 'Sopocie'],
  ['Lublin', 'Lublinie'],
  ['Szczecin', 'Szczecinie'],
  ['Rzeszów', 'Rzeszowie'],
  ['Zakopane', 'Zakopanem'],
  ['Bielsko-Biała', 'Bielsku-Białej'],
]

let failed = 0
for (const [input, expected] of CASES) {
  const got = toPolishLocativeCity(input)
  try {
    assertEq(got, expected, input)
    console.log(`PASS  ${input} → ${got}`)
  } catch (err) {
    failed += 1
    console.error(`FAIL  ${input}`)
    console.error(err instanceof Error ? err.message : err)
  }
}

// Missing / unsafe
if (toPolishLocativeCity('') !== undefined) {
  failed += 1
  console.error('FAIL  empty should be undefined')
} else {
  console.log('PASS  empty → undefined')
}
if (toPolishLocativeCity('   ') !== undefined) {
  failed += 1
  console.error('FAIL  blank should be undefined')
} else {
  console.log('PASS  blank → undefined')
}
if (toPolishLocativeCity('NieistniejąceWymyśloneMiastoXYZ') !== undefined) {
  // May or may not match a rule — if it returns something, ensure it is not the nominative
  const v = toPolishLocativeCity('NieistniejąceWymyśloneMiastoXYZ')
  if (v === 'NieistniejąceWymyśloneMiastoXYZ') {
    failed += 1
    console.error('FAIL  must not return nominative unchanged as "safe" locative')
  } else {
    console.log('PASS  invented city handled without nominative passthrough')
  }
} else {
  console.log('PASS  invented city → undefined')
}

if (failed) {
  process.exitCode = 1
} else {
  console.log('\nAll locative city tests passed.')
}
