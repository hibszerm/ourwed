import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { resolveSemanticMappings } from '../semanticMapping'
import { parseSemanticMapResponse } from '../semanticMapModelContract'

const root = process.cwd()
const evidencePath = join(root, 'tmp/golden-contract-validation-run2/EVIDENCE/G03_SEMANTIC_AB/TERRA.json')
const sourcePath = join(root, 'tmp/golden-contract-validation-run2/SOURCE/Golden_03_Long_Photo_Video.docx')
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as {
  semanticMappings: Array<{ sourceBlockId: string; concept: string; anchor: string; occurrence?: number | null }>
  mappingGrounding: Array<{ index: number; grounded: boolean; failure?: string }>
}
const previousFailures = evidence.mappingGrounding.filter((entry) => !entry.grounded)
assert.equal(previousFailures.length, 6)
assert.deepEqual(previousFailures.map((entry) => entry.failure), Array(6).fill('anchor_unmappable'))

const rawSource = readFileSync(sourcePath)
const sourceBytes = rawSource.buffer.slice(rawSource.byteOffset, rawSource.byteOffset + rawSource.byteLength)
const indexed = await indexDocxForTransform(sourceBytes)
const zip = await JSZip.loadAsync(sourceBytes)
const documentXml = await zip.file('word/document.xml')!.async('string')
const paragraphXmls = [...documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
const response = { semanticMappings: evidence.semanticMappings.map((mapping) => ({ ...mapping, occurrence: mapping.occurrence ?? null })) }
const parsed = parseSemanticMapResponse(response)
assert.equal(parsed.ok, true, 'captured provider-shaped mappings parse unchanged')
if (!parsed.ok) throw new Error('captured G03 semantic mappings did not parse')

const resolved = resolveSemanticMappings({
  mappings: parsed.semanticMappings,
  sourceBlocks: indexed.map(({ blockId, paragraphIndex }) => ({
    blockId,
    paragraphXml: paragraphXmls[paragraphIndex]!,
  })),
})
assert.equal(resolved.ok, true, 'all captured G03 mappings ground after internal w:br support')
if (!resolved.ok) throw new Error(`captured G03 mappings failed grounding: ${resolved.code}`)
assert.equal(resolved.mappings.length, evidence.semanticMappings.length)
assert.equal(previousFailures.filter((entry) =>
  resolved.mappings[entry.index]?.sourceBlockId === evidence.semanticMappings[entry.index]?.sourceBlockId,
).length, 6)
console.log('PASS captured G03 semantic-map grounding replay (six prior w:br failures; no provider calls)')
