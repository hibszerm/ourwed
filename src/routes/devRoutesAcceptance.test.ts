import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const routerSource = await readFile(new URL('./router.tsx', import.meta.url), 'utf8')
const devRoutesStart = routerSource.indexOf('const devRoutes = import.meta.env.DEV')
const routerStart = routerSource.indexOf('export const router')

assert(devRoutesStart >= 0, 'dev routes are guarded by import.meta.env.DEV')
assert(routerStart > devRoutesStart, 'router is declared after dev routes')

const devRoutesDeclaration = routerSource.slice(devRoutesStart, routerStart)
assert.match(
  devRoutesDeclaration,
  /import\.meta\.env\.DEV\s*\?\s*\[[\s\S]*path:\s*'\/dev\/landing-device-capture'/,
  'capture route is included only in the development route array',
)
assert.equal(
  (routerSource.match(/path:\s*'\/dev\/landing-device-capture'/g) ?? []).length,
  1,
  'capture route is not separately registered outside the development route array',
)
assert.match(routerSource.slice(routerStart), /\.\.\.devRoutes/, 'development routes are added through the guarded array')
