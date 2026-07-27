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
import { verifyGuardedTransformation } from './guardedVerifier'
import {
  createComparisonRunShell,
  runBothTransformModes,
} from './transformService'
import type { TransformFunctionsInvoke } from './transformApi'
import { FULL_AI_RESPONSE_VERSION, GUARDED_AI_RESPONSE_VERSION } from './types'
import { SAMPLE_DATASET } from './fixtures/transformFixtures'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}
function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

function installLocalStorage() {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, String(v))
    },
    removeItem: (k) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage
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
  installLocalStorage()

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

  const dataset = {
    ...SAMPLE_DATASET,
    clients: {
      ...SAMPLE_DATASET.clients,
      displayNames: 'Ewa Nowak i Piotr Nowak',
      address: 'ul. Nowa 2, 00-002 Warszawa',
      phone: '501 502 503',
    },
    dates: {
      ...SAMPLE_DATASET.dates,
      weddingDate: '24.07.2027 r.',
    },
    locations: {
      ceremony: { displayName: 'Kościół Testowy' },
    },
  }

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

  const ok = verifyGuardedTransformation({
    sourceBlocks: blocks,
    transformedBlocks: transformed,
    dataset,
    protectedData,
  })
  assert(
    ok.status === 'safe_to_generate' || ok.status === 'review_required',
    `customer/date/loc replaceable (was ${ok.status})`,
  )
  assert(
    !ok.blockingIssues.some((i) =>
      i.includes('protected_value_change:table-0-row-0'),
    ),
    'customer cell not protected-blocked',
  )
  const customerDiff = ok.diffs.find(
    (d) => d.blockId === 'table-0-row-0-cell-1-p-0',
  )
  assert(
    !customerDiff?.changes.some(
      (c) => c.classification === 'protected_value_change',
    ),
    'customer diff not protected_value_change',
  )

  // Provider change blocked with provenance
  const providerChanged = transformed.map((b) =>
    b.blockId === 'table-0-row-1-cell-1-p-0'
      ? { ...b, text: 'Inne Studio SA, NIP 9999999999' }
      : b,
  )
  const blocked = verifyGuardedTransformation({
    sourceBlocks: blocks,
    transformedBlocks: providerChanged,
    dataset,
    protectedData,
  })
  assertEq(blocked.status, 'blocked', 'provider change blocked')
  assert(
    blocked.blockingIssues.some((i) => i.includes('protected_value')),
    'protected issue present',
  )
  assert(
    (blocked.protectedValueDiagnostics?.length ?? 0) > 0,
    'provenance diagnostics',
  )
  assert(
    blocked.protectedValueDiagnostics!.some(
      (d) =>
        d.canonicalField.includes('provider') &&
        d.sourceValueFingerprint.length > 0,
    ),
    'fingerprint present',
  )
  assert(
    !String(JSON.stringify(blocked.protectedValueDiagnostics)).includes(
      'Studio Foto Test',
    ),
    'no raw provider text in diagnostics',
  )

  // Service scope change blocked
  const serviceChanged = transformed.map((b) =>
    b.blockId === 'table-1-row-1-cell-2-p-0' ? { ...b, text: 'Nie' } : b,
  )
  const serviceBlocked = verifyGuardedTransformation({
    sourceBlocks: blocks,
    transformedBlocks: serviceChanged,
    dataset,
    protectedData,
  })
  assertEq(serviceBlocked.status, 'blocked', 'service scope protected')

  // Bank / delivery / cancellation unchanged in good transform
  const joined = transformed.map((b) => b.text).join('\n')
  assert(joined.includes('12 3456 7890'), 'bank kept')
  assert(joined.includes('60 dni'), 'delivery kept')
  assert(joined.includes('30%'), 'cancellation kept')
  assert(fingerprintValue('abc') !== fingerprintValue('abcd'), 'fp differs')

  // 20 independent modes
  const invoke: TransformFunctionsInvoke = async (functionName) => {
    if (functionName === 'ai-contract-full-rewrite') {
      return {
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: {
            status: 422,
            text: async () =>
              JSON.stringify({
                ok: false,
                error: {
                  code: 'structured_output_json_invalid',
                  message: 'Structured output JSON could not be parsed',
                },
              }),
          },
        },
      }
    }
    return {
      data: {
        ok: true,
        changedBlocks: [
          {
            blockId: 'table-0-row-0-cell-1-p-0',
            text: 'Ewa Nowak i Piotr Nowak, ul. Nowa 2, 00-002 Warszawa, tel. 501 502 503',
          },
        ],
        model: 'mock',
        promptVersion: '2026-07-guarded-ai-v2',
        responseVersion: GUARDED_AI_RESPONSE_VERSION,
      },
      error: null,
    }
  }
  const finished = await runBothTransformModes({
    run: createComparisonRunShell({
      runId: 'extract-indep',
      sourceFileName: 't.docx',
      blocks,
      dataset,
    }),
    sourceBytes: new ArrayBuffer(8),
    sourceBlocks: blocks,
    dataset,
    invoke,
  })
  assertEq(finished.modeA.status, 'error', 'A independent error')
  assertEq(finished.modeB.status, 'success', 'B independent success')

  console.log('ok — ai-contract-transform-extraction')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
