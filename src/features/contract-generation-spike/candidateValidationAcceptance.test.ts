import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const runtime = await readFile(fileURLToPath(new URL('./generator.ts', import.meta.url)), 'utf8')
assert.match(runtime, /export async function validateCandidate/)
assert.match(runtime, /Table structure changed/)
assert.match(runtime, /Main document Word field instructions changed/)
assert.match(runtime, /Untouched block changed/)
assert.match(runtime, /Declared old literal remains/)
assert.match(runtime, /Declared new literal is absent/)
console.log('PASS candidate checks remain objective and structural')
