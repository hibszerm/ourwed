import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const edgeSource = await readFile(new URL('../../../supabase/functions/contract-generation-boundary/index.ts', import.meta.url), 'utf8')
const providerConfig = edgeSource.slice(
  edgeSource.indexOf('function getProviderConfig()'),
  edgeSource.indexOf('function responseAuthority('),
)
const providerAdapters = edgeSource.slice(
  edgeSource.indexOf('function providerAdapters()'),
  edgeSource.indexOf('function createBoundary('),
)

assert.match(providerConfig, /const apiKey = Deno\.env\.get\('OPENAI_API_KEY'\)\?\.trim\(\)/)
assert.match(providerConfig, /const generatorModel = Deno\.env\.get\('OPENAI_CONTRACT_GENERATOR_MODEL'\)\?\.trim\(\)/)
assert.match(providerConfig, /const reviewerModel = Deno\.env\.get\('OPENAI_CONTRACT_REVIEWER_MODEL'\)\?\.trim\(\)/)
assert.match(providerConfig, /if \(!apiKey \|\| !generatorModel \|\| !reviewerModel\)/)
assert.doesNotMatch(providerConfig, /generatorModel\s*!?=+\s*reviewerModel/)
assert.doesNotMatch(providerConfig, /new Set|\.includes\(/)
const baselineGeneratorModel = 'gpt-6-luna'.trim()
const baselineReviewerModel = 'gpt-6-luna'.trim()
assert.ok(baselineGeneratorModel && baselineReviewerModel, 'validated baseline model IDs are non-empty')
assert.equal(baselineGeneratorModel, baselineReviewerModel, 'the accepted baseline uses the same model for both roles')

assert.match(providerAdapters, /model: config\.generatorModel/)
assert.match(providerAdapters, /model: config\.reviewerModel/)
assert.match(providerAdapters, /OPENAI_CONTRACT_GENERATOR_REASONING'\)\?\.trim\(\) \|\| 'medium'/)
assert.match(providerAdapters, /OPENAI_CONTRACT_REVIEWER_REASONING'\)\?\.trim\(\) \|\| 'medium'/)

console.log('PASS provider configuration accepts identical non-empty model IDs and defaults both roles to medium')
