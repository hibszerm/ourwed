import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseLegacySemanticMapResponse as parseSemanticMapResponse } from '../semanticMapModelContract'
import { captureProviderOutputText, readCapturedProviderOutput } from './providerOutputCapture'

const directory = mkdtempSync(join(tmpdir(), 'ourwed-provider-output-'))
const metadata = {
  goldenId: 'G01', model: 'gpt-5.6-terra', reasoningEffort: 'medium',
  sourceSha256: 'source-hash', contractVersion: 'semantic-map-v1', callOrdinal: 1,
}
const validOutput = JSON.stringify({ semanticMappings: [{
  sourceBlockId: 'para-1', anchor: 'Alicji', concept: 'customer_1_name', occurrence: null,
  customerIndex: null, customerIndexes: null, nameForm: 'GENITIVE',
}] })
const validPath = captureProviderOutputText(directory, metadata, validOutput)
const captured = readCapturedProviderOutput(validPath)
assert.equal(captured.outputText, validOutput)
assert.equal(readFileSync(validPath, 'utf8').includes('authorization'), false)
assert.equal(readFileSync(validPath, 'utf8').includes('api_key'), false)
assert.equal(parseSemanticMapResponse(captured.outputText).ok, true)

const invalidOutput = '{"semanticMappings":[{"broken":true}]}'
const invalidPath = captureProviderOutputText(directory, { ...metadata, goldenId: 'G02' }, invalidOutput)
assert.equal(readCapturedProviderOutput(invalidPath).outputText, invalidOutput)
assert.equal(parseSemanticMapResponse(invalidOutput).ok, false)
assert.equal(readCapturedProviderOutput(invalidPath).outputText, invalidOutput)

console.log('provider output capture tests: PASS')
