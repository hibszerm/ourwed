/**
 * Responses API extraction + table-aware protected ownership.
 * Run: npm run test:ai-contract-transform-extraction
 */

import { extractResponseText } from './extractResponseText'
import {
  PARSE_RETRY_HINT,
  parseSparseV2FromResponse,
  shouldRetryParseFailure,
} from './parseSparseV2Response'
import { blocksFromTableFixture } from './indexDocxForTransform'
import {
  buildProtectedContractData,
  fingerprintValue,
} from './protectedContractData'
import { FULL_AI_RESPONSE_VERSION } from './types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}
function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}


const VALID_JSON = JSON.stringify({
  changedBlocks: [{ blockId: 'para-0', text: 'Hello' }],
})

function makeResponse(input: {
  status?: string
  output_text?: string
  output: unknown[]
}): Record<string, unknown> {
  return {
    status: input.status ?? 'completed',
    id: 'resp_test',
    ...(input.output_text != null ? { output_text: input.output_text } : {}),
    output: input.output,
  }
}

function tableFixtureBlocks() {
  return blocksFromTableFixture({
    tables: [
      {
        tableIndex: 0,
        rows: [
          {
            cells: [
              'Zamawiający',
              'Anna Kowalska, ul. Stara 1, tel. 600 700 800',
            ],
          },
          {
            cells: [
              'Wykonawca',
              'Studio Foto Test Sp. z o.o., NIP 1234567890, tel. 111 222 333',
            ],
          },
          { cells: ['Data wydarzenia', '19.06.2025 r.'] },
          { cells: ['Lokalizacja', 'Rzeszów'] },
        ],
      },
      {
        tableIndex: 1,
        rows: [
          { cells: ['Materiał', 'Długość', 'W cenie'] },
          { cells: ['Film highlight', '10 min', 'Tak'] },
          { cells: ['Trailer', '60 s', 'Nie'] },
          { cells: ['Dodatkowa godzina', '1 h', 'płatne dodatkowo'] },
        ],
      },
    ],
    bodyParagraphs: [
      'Termin realizacji: 60 dni od wydarzenia.',
      'Wynagrodzenie 8 000 zł.',
      'Płatność najpóźniej w dniu wydarzenia.',
      'Rachunek: 12 3456 7890 1234 5678 9012 3456',
      'W razie odstąpienia potrąca się 30% wartości umowy.',
    ],
  })
}

async function main() {
  // 1 reasoning then message
  {
    const body = makeResponse({
      output: [
        { type: 'reasoning', summary: [] },
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: VALID_JSON }],
        },
      ],
    })
    const ext = extractResponseText(body)
    assertEq(ext.outputItemCount, 2, 'item count')
    assert(ext.outputItemTypes.includes('reasoning'), 'has reasoning')
    assert(ext.outputItemTypes.includes('message'), 'has message')
    assertEq(ext.messageItemCount, 1, 'one message')
    assert(ext.text?.includes('changedBlocks') ?? false, 'extracted json')
    const parsed = parseSparseV2FromResponse({
      body,
      applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
    })
    assert(parsed.ok, 'parse after reasoning')
  }

  // 2 message then metadata
  {
    const body = makeResponse({
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: VALID_JSON }],
        },
        { type: 'unknown_metadata', id: 'x' },
      ],
    })
    const ext = extractResponseText(body)
    assert(ext.text?.startsWith('{') ?? false, 'message first ok')
  }

  // 3 multiple output_text fragments in order
  {
    const part1 = '{"changedBlocks":[{"blockId":"para-0","text":"'
    const part2 = 'Hi'
    const part3 = '"}]}'
    const body = makeResponse({
      output: [
        {
          type: 'message',
          content: [
            { type: 'output_text', text: part1 },
            { type: 'output_text', text: part2 },
            { type: 'output_text', text: part3 },
          ],
        },
      ],
    })
    const ext = extractResponseText(body)
    assertEq(ext.outputTextItemCount, 3, '3 fragments')
    assertEq(ext.text, part1 + part2 + part3, 'joined order')
    const parsed = parseSparseV2FromResponse({
      body,
      applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
    })
    assert(parsed.ok, 'multi fragment parse')
  }

  // 4 convenience property preferred
  {
    const body = makeResponse({
      output_text: VALID_JSON,
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'WRONG' }],
        },
      ],
    })
    const ext = extractResponseText(body)
    assert(ext.usedOutputTextConvenienceProperty, 'used convenience')
    assertEq(ext.text, VALID_JSON, 'convenience wins')
  }

  // 5 empty output_text falls back
  {
    const body = makeResponse({
      output_text: '   ',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: VALID_JSON }],
        },
      ],
    })
    const ext = extractResponseText(body)
    assert(!ext.usedOutputTextConvenienceProperty, 'fallback')
    assert(ext.text?.includes('changedBlocks') ?? false, 'fallback text')
  }

  // 6 refusal separate
  {
    const body = makeResponse({
      output: [
        {
          type: 'message',
          content: [{ type: 'refusal', refusal: 'cannot' }],
        },
      ],
    })
    const parsed = parseSparseV2FromResponse({
      body,
      applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
    })
    assert(!parsed.ok && parsed.code === 'structured_output_refusal', 'refusal')
  }

  // 7 valid JSON
  {
    const parsed = parseSparseV2FromResponse({
      body: makeResponse({
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: VALID_JSON }],
          },
        ],
      }),
      applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
    })
    assert(parsed.ok, 'valid json')
  }

  // 8 fenced JSON recovered once
  {
    const fenced = '```json\n' + VALID_JSON + '\n```'
    const parsed = parseSparseV2FromResponse({
      body: makeResponse({
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: fenced }],
          },
        ],
      }),
      applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
    })
    assert(parsed.ok && parsed.recoveredFromMarkdownFence, 'fence recovered')
  }

  // 9 malformed JSON
  {
    const parsed = parseSparseV2FromResponse({
      body: makeResponse({
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{not-json' }],
          },
        ],
      }),
      applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
    })
    assert(
      !parsed.ok && parsed.code === 'structured_output_json_invalid',
      'json invalid',
    )
    assert(
      !parsed.ok && parsed.parseDiagnostics != null,
      'parse diagnostics',
    )
  }

  // 10 schema invalid
  {
    const parsed = parseSparseV2FromResponse({
      body: makeResponse({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  changedBlocks: [],
                  notes: 'nope',
                }),
              },
            ],
          },
        ],
      }),
      applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
    })
    assert(
      !parsed.ok && parsed.code === 'structured_output_schema_invalid',
      'schema invalid',
    )
  }

  // 11–12 parse retry policy
  {
    const fail = parseSparseV2FromResponse({
      body: makeResponse({
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{bad' }],
          },
        ],
      }),
      applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
    })
    assert(
      shouldRetryParseFailure({ attempt: 1, status: 'completed', parse: fail }),
      'retry once',
    )
    assert(
      !shouldRetryParseFailure({
        attempt: 2,
        status: 'completed',
        parse: fail,
      }),
      'no second retry',
    )
    assert(PARSE_RETRY_HINT.includes('JSON object'), 'retry hint')
    const schemaFail = parseSparseV2FromResponse({
      body: makeResponse({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  changedBlocks: [],
                  extra: true,
                }),
              },
            ],
          },
        ],
      }),
      applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
    })
    assert(
      !shouldRetryParseFailure({
        attempt: 1,
        status: 'completed',
        parse: schemaFail,
      }),
      'no retry schema-invalid',
    )
  }

  // 13–19 table ownership fixture
  const blocks = tableFixtureBlocks()
  const customer = blocks.find((b) => b.blockId === 'table-0-row-0-cell-1-p-0')
  const provider = blocks.find((b) => b.blockId === 'table-0-row-1-cell-1-p-0')
  const dateCell = blocks.find((b) => b.blockId === 'table-0-row-2-cell-1-p-0')
  const locCell = blocks.find((b) => b.blockId === 'table-0-row-3-cell-1-p-0')
  const serviceCell = blocks.find(
    (b) => b.blockId === 'table-1-row-1-cell-0-p-0',
  )
  assert(customer?.tableContext?.ownershipFamily === 'customer', 'customer own')
  assert(provider?.tableContext?.ownershipFamily === 'provider', 'provider own')
  assert(dateCell?.tableContext?.ownershipFamily === 'wedding_date', 'date own')
  assert(
    locCell?.tableContext?.ownershipFamily === 'wedding_location',
    'loc own',
  )
  assert(
    serviceCell?.tableContext?.ownershipFamily === 'service_scope',
    'service own',
  )

  const protectedData = buildProtectedContractData({
    blocks,
    knownProviderValues: ['Studio Foto Test Sp. z o.o.'],
  })
  assert(
    !protectedData.exactProtectedValues.some((v) =>
      v.includes('Anna Kowalska'),
    ),
    'customer name not protected',
  )
  assert(
    !protectedData.exactProtectedValues.some((v) => v.includes('600 700 800')),
    'customer phone not protected',
  )
  assert(
    protectedData.exactProtectedValues.some((v) => v.includes('1234567890')),
    'provider NIP protected',
  )
  assert(
    protectedData.exactProtectedValues.some((v) => v.includes('111 222 333')),
    'provider phone protected',
  )
  assert(
    protectedData.entries.some((e) => e.canonicalField === 'provider.taxId'),
    'taxId provenance',
  )

  const transformed = blocks.map((b) => {
    if (b.blockId === 'table-0-row-0-cell-1-p-0') {
      return {
        blockId: b.blockId,
        text: 'Ewa Nowak i Piotr Nowak, ul. Nowa 2, 00-002 Warszawa, tel. 501 502 503',
      }
    }
    if (b.blockId === 'table-0-row-2-cell-1-p-0') {
      return { blockId: b.blockId, text: '24.07.2027 r.' }
    }
    if (b.blockId === 'table-0-row-3-cell-1-p-0') {
      return { blockId: b.blockId, text: 'Kościół Testowy' }
    }
    return { blockId: b.blockId, text: b.text }
  })

  // Bank / delivery / cancellation unchanged in good transform
  const joined = transformed.map((b) => b.text).join('\n')
  assert(joined.includes('12 3456 7890'), 'bank kept')
  assert(joined.includes('60 dni'), 'delivery kept')
  assert(joined.includes('30%'), 'cancellation kept')
  assert(fingerprintValue('abc') !== fingerprintValue('abcd'), 'fp differs')


  console.log('ok — ai-contract-transform-extraction')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
