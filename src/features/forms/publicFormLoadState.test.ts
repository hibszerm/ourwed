import assert from 'node:assert/strict'
import {
  derivePublicFormView,
  shouldFetchPublicForm,
} from './publicFormLoadState'

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

run('stays loading until auth initialization finishes', () => {
  assert.equal(
    derivePublicFormView({
      authReady: false,
      loadStatus: 'waiting_for_auth',
      hasResolvedTemplate: false,
    }),
    'loading',
  )
  assert.equal(
    shouldFetchPublicForm({ authReady: false, token: 'abc' }),
    false,
  )
})

run('fetch starts automatically once auth is ready and token exists', () => {
  assert.equal(
    shouldFetchPublicForm({ authReady: true, token: 'abc' }),
    true,
  )
  assert.equal(
    shouldFetchPublicForm({ authReady: true, token: '  ' }),
    false,
  )
})

run('valid ready payload with template shows the form', () => {
  assert.equal(
    derivePublicFormView({
      authReady: true,
      loadStatus: 'ready',
      hasResolvedTemplate: true,
    }),
    'ready',
  )
})

run('not_found / expired / error are never masked as loading', () => {
  assert.equal(
    derivePublicFormView({
      authReady: true,
      loadStatus: 'not_found',
      hasResolvedTemplate: false,
    }),
    'not_found',
  )
  assert.equal(
    derivePublicFormView({
      authReady: true,
      loadStatus: 'expired',
      hasResolvedTemplate: false,
    }),
    'expired',
  )
  assert.equal(
    derivePublicFormView({
      authReady: true,
      loadStatus: 'error',
      hasResolvedTemplate: false,
    }),
    'error',
  )
})

run('ready without a resolvable template fails instead of spinning', () => {
  assert.equal(
    derivePublicFormView({
      authReady: true,
      loadStatus: 'ready',
      hasResolvedTemplate: false,
    }),
    'error',
  )
})

run('token change requires a new fetch once auth remains ready', () => {
  assert.equal(
    shouldFetchPublicForm({ authReady: true, token: 'token-a' }),
    true,
  )
  assert.equal(
    shouldFetchPublicForm({ authReady: true, token: 'token-b' }),
    true,
  )
})

console.log('\nPublic form first-load regression tests finished.')
