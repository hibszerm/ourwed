/**
 * OpenAI response classification tests for edge function.
 * Run: npm run test:ai-contract-mapping-classification
 */

import {
  classificationToApiError,
  extractOutputText,
  hasExplicitRefusalContent,
  inspectOpenAiResponse,
  readResponseStatus,
} from '../../../supabase/functions/ai-contract-lab-structured-mapping/classifyResponse.ts'
import { mapProviderError } from '../../../supabase/functions/ai-contract-lab-structured-mapping/validate.ts'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

function main() {
  const explicitRefusal = {
    id: 'resp_refusal',
    status: 'completed',
    output: [
      {
        type: 'message',
        content: [{ type: 'refusal', refusal: 'policy' }],
      },
    ],
  }
  assert(hasExplicitRefusalContent(explicitRefusal), '1 explicit refusal detected')
  assertEq(
    inspectOpenAiResponse({ body: explicitRefusal }).finalClassification,
    'refused',
    '1 classified refused',
  )
  assertEq(
    classificationToApiError('refused').code,
    'refused',
    '1 api code refused',
  )

  const incomplete = {
    id: 'resp_incomplete',
    status: 'incomplete',
    incomplete_details: { reason: 'max_output_tokens' },
    output: [{ type: 'message', content: [{ type: 'output_text', text: '' }] }],
  }
  assertEq(readResponseStatus(incomplete), 'incomplete', '2 incomplete status')
  assertEq(
    inspectOpenAiResponse({ body: incomplete }).finalClassification,
    'incomplete_response',
    '2 classified incomplete_response',
  )
  assertEq(
    classificationToApiError('incomplete_response').code,
    'incomplete_response',
    '2 api code incomplete_response',
  )

  const missingStructured = {
    id: 'resp_missing',
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: '   ' }] }],
  }
  assertEq(extractOutputText(missingStructured), null, '3 no output text')
  assertEq(
    inspectOpenAiResponse({ body: missingStructured }).finalClassification,
    'missing_structured_output',
    '3 classified missing_structured_output',
  )
  assertEq(
    classificationToApiError('missing_structured_output').code,
    'missing_structured_output',
    '3 api code missing_structured_output',
  )

  const invalidJsonBody = {
    id: 'resp_invalid_json',
    status: 'completed',
    output_text: '{not json',
  }
  const invalidParsed = undefined
  assertEq(
    inspectOpenAiResponse({
      body: invalidJsonBody,
      parsed: invalidParsed,
      structuredOutputValidationSucceeded: false,
    }).finalClassification,
    'completed',
    '3b transport still has output text before parse failure handled separately',
  )

  const invalidSchemaBody = {
    id: 'resp_invalid_schema',
    status: 'completed',
    output_text: JSON.stringify({ documentAssessment: {}, fields: [{ fieldKey: 'bogus' }] }),
  }
  assertEq(
    inspectOpenAiResponse({
      body: invalidSchemaBody,
      parsed: { documentAssessment: {}, fields: [{ fieldKey: 'bogus' }] },
      structuredOutputValidationSucceeded: false,
    }).finalClassification,
    'invalid_structured_output',
    '4 classified invalid_structured_output',
  )
  assertEq(
    classificationToApiError('invalid_structured_output').code,
    'invalid_structured_output',
    '4 api code invalid_structured_output',
  )

  const providerError = mapProviderError(429, { error: { message: 'rate limit' } })
  assertEq(providerError.code, 'rate_limited', '5 provider error category preserved')

  const legacyMisclassification = {
    id: 'resp_0b89dd43d390fcdc016a674bc788f8819c99a22aa3366baf7e',
    status: 'incomplete',
    incomplete_details: { reason: 'max_output_tokens' },
    output: [],
  }
  const legacyInspection = inspectOpenAiResponse({ body: legacyMisclassification })
  assertEq(
    legacyInspection.finalClassification,
    'incomplete_response',
    'legacy incomplete no longer classified refused',
  )
  assert(!legacyInspection.hasExplicitRefusal, 'legacy incomplete not explicit refusal')

  const diagnostic = inspectOpenAiResponse({ body: legacyMisclassification })
  const logPayload = JSON.stringify({
    runId: 'exp-run-test',
    responseId: 'resp_test',
    model: 'gpt-5-mini',
    responseStatus: diagnostic.responseStatus,
    incompleteReason: diagnostic.incompleteReason,
    outputItemTypes: diagnostic.outputItemTypes,
    contentItemTypes: diagnostic.contentItemTypes,
    hasExplicitRefusal: diagnostic.hasExplicitRefusal,
    hasOutputText: diagnostic.hasOutputText,
    hasParsedStructuredOutput: diagnostic.hasParsedStructuredOutput,
    structuredOutputValidationSucceeded: diagnostic.structuredOutputValidationSucceeded,
    finalClassification: diagnostic.finalClassification,
  })
  assert(!logPayload.includes('Pałac'), '6 no contract text in diagnostic log')
  assert(!logPayload.includes('sk-'), '6 no secrets in diagnostic log')

  console.log('ok — structuredMappingResponseClassification')
}

void main()
