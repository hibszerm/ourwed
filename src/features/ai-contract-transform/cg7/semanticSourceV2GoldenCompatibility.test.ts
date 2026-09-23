import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { groundSemanticMapResponse, parseLegacySemanticMapResponse, parseSemanticMapResponse } from '../semanticMapModelContract'
import { resolveSemanticMappings } from '../semanticMapping'
import { indexSemanticSourceTokens } from '../semanticSourceTokens'

const base = 'tmp/golden-contract-validation-run2'
const fresh = `${base}/EVIDENCE/GPT6_LUNA_FINAL_CLEAN_SIX_POST_PROTOCOL_STABILIZATION_20260923`
const filenames = [
  'Golden_01_Elegant_Photographer.docx',
  'Golden_02_Structured_Two_Client_Photographer.docx',
  'Golden_03_Long_Photo_Video.docx',
  'Golden_04_Table_Heavy_Modern_Studio.docx',
  'Golden_05_Dense_Formal_Legalistic.docx',
  'Golden_06_Minimal_Contemporary.docx',
]

for (let ordinal = 1; ordinal <= 6; ordinal++) {
  const golden = `G${String(ordinal).padStart(2, '0')}`
  const bytes = readFileSync(`${base}/SOURCE/${filenames[ordinal - 1]}`)
  const sourceBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const blocks = await indexDocxForTransform(sourceBytes)
  const zip = await JSZip.loadAsync(bytes)
  const documentXml = await zip.file('word/document.xml')!.async('string')
  const paragraphXmls = [...documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
  const sourceParagraphs = blocks.map((block) => ({ blockId: block.blockId, paragraphXml: paragraphXmls[block.paragraphIndex]! }))
  const wireText = ordinal === 1
    ? JSON.parse(readFileSync(`${base}/EVIDENCE/GPT6_LUNA_FRESH_FINAL_WRITER_ACCEPTANCE/G01-provider-output.json`, 'utf8')).outputText as string
    : readFileSync(`${fresh}/${golden}-provider-output.txt`, 'utf8')
  const legacy = parseLegacySemanticMapResponse(wireText)
  assert(legacy.ok, `${golden}: historical response parses`)
  const legacyGrounded = resolveSemanticMappings({ mappings: legacy.semanticMappings, sourceBlocks: sourceParagraphs })
  assert(legacyGrounded.ok, `${golden}: historical response grounds`)

  // Conversion below is a deterministic span-compatibility fixture, never V2 provider evidence.
  const oldWire = JSON.parse(wireText) as { semanticMappings: Record<string, unknown>[] }
  const v2Rows = oldWire.semanticMappings.map((row, index) => {
    const mapping = legacyGrounded.mappings[index]!
    const block = blocks.find((item) => item.blockId === mapping.sourceBlockId)!
    const tokens = indexSemanticSourceTokens(block)
    const first = tokens.find((token) => token.start === mapping.span.start)
    const last = tokens.find((token) => token.end === mapping.span.end)
    assert(first && last, `${golden}: mapping ${index} has structural boundaries`)
    const { anchor: _anchor, occurrence: _occurrence, ...semantic } = row
    return { ...semantic, startTokenId: first.id, endTokenId: last.id }
  })
  const v2Parsed = parseSemanticMapResponse({ semanticMappings: v2Rows })
  assert(v2Parsed.ok, `${golden}: deterministic compatibility fixture parses as V2`)
  const v2Grounded = groundSemanticMapResponse({ semanticMappings: v2Rows }, sourceParagraphs, blocks)
  assert(v2Grounded.ok, `${golden}: deterministic compatibility fixture grounds`)
  assert.deepEqual(
    v2Grounded.mappings.map((mapping) => ({ blockId: mapping.sourceBlockId, anchor: mapping.anchor, span: mapping.span, concept: mapping.concept })),
    legacyGrounded.mappings.map((mapping) => ({ blockId: mapping.sourceBlockId, anchor: mapping.anchor, span: mapping.span, concept: mapping.concept })),
    `${golden}: V2 boundaries recover the same exact source spans`,
  )
  console.log(`${golden} structural token compatibility: PASS (${v2Grounded.mappings.length})`)
}
