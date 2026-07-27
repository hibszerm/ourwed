import assert from 'node:assert/strict'
import {
  nextOpenPackageItemId,
  sanitizeOpenPackageItemId,
} from './packageItemMenuState'

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (error) {
    console.error(`FAIL  ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

run('opening B closes A by replacing the active id', () => {
  assert.equal(nextOpenPackageItemId('a', 'b', true), 'b')
})

run('toggling the same item closed clears the active id', () => {
  assert.equal(nextOpenPackageItemId('a', 'a', false), null)
})

run('closing a different item leaves the active id unchanged', () => {
  assert.equal(nextOpenPackageItemId('a', 'b', false), 'a')
})

run('deleted or missing items clear the active menu id', () => {
  assert.equal(sanitizeOpenPackageItemId('gone', ['a', 'b']), null)
  assert.equal(sanitizeOpenPackageItemId('a', ['a', 'b']), 'a')
  assert.equal(sanitizeOpenPackageItemId(null, ['a']), null)
})

console.log('\nPackage item overflow menu exclusivity tests finished.')
