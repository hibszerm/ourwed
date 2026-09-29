import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = `${process.cwd()}/src/features/contract-generation-spike`
const adapter = await readFile(`${root}/contractGenerationInput.ts`, 'utf8')
const generator = await readFile(`${root}/generator.ts`, 'utf8')
const harness = await readFile(`${root}/multi-template-acceptance/harness.ts`, 'utf8')

assert.doesNotMatch(adapter, /JSZip|readSource|sourceDocx|parse.*(?:docx|document)|inventory/i)
assert.doesNotMatch(adapter, /new RegExp|\.match\(|\.matchAll\(/, 'adapter does not inspect text with regex or prose parsers')
assert.doesNotMatch(adapter, /supabase|\.from\(|\.insert\(|\.update\(|\.delete\(/i, 'adapter has no database client or writes')
assert.doesNotMatch(adapter, /contractNumber|agreementNumber|payment.*prose|questionnaire.*label/i, 'adapter has no contract ontology or UI-label interpretation')
assert.doesNotMatch(adapter, /party.*name.*includes|address.*includes|includes.*address/i, 'adapter does not infer identity/address ownership from values')
assert.match(adapter, /form_answers\.answer_json\.fields\.\$\{key\}.*owner/s, 'ownership comes from the submitted semantic key path')
assert.match(adapter, /genericContractAddress[\s\S]*unownedFacts/, 'generic correspondence address stays in the unowned fact collection')
assert.doesNotMatch(generator, /buildContractGenerationInput/)
assert.match(harness, /buildContractGenerationInput/, 'harness normalizes both current and compatibility fixture inputs through the adapter')
assert.doesNotMatch(harness, /\bcontractNumber\b|\bagreementNumber\b|\bpesel\b/i, 'harness does not interpret human identifiers or PESELs')
assert.doesNotMatch(harness, /parse.*(?:payment|address|questionnaire).*prose|questionnaire.*label.*(?:nlp|interpret)/i, 'harness does not add semantic parsers')
assert.doesNotMatch(harness, /partyName.*(?:includes|match)|address.*(?:includes|match).*name/i, 'harness does not infer party ownership from values')
console.log('PASS ContractGenerationInput architecture boundary acceptance')
