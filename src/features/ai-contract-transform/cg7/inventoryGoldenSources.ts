/** Harness-only: inventory golden SOURCE DOCX (no generator changes). */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { findPaymentStartIndex, findSignatureStartIndex } from '../packageDeliverablesDetection'
import { discoverFilledLocationEvidence } from '../quality/locationFieldEvidence'
import { discoverFilledPartyEvidence } from '../quality/partyFilledIdentity'
import { detectRepresentedConcepts } from '../quality/representationPolicy'
import { discoverFilledTotalEvidence } from '../quality/totalFieldEvidence'

const FILES = [
  'Golden_01_Elegant_Photographer.docx',
  'Golden_02_Structured_Two_Client_Photographer.docx',
  'Golden_03_Long_Photo_Video.docx',
  'Golden_04_Table_Heavy_Modern_Studio.docx',
  'Golden_05_Dense_Formal_Legalistic.docx',
  'Golden_06_Minimal_Contemporary.docx',
] as const

async function main() {
  const srcDir = join(process.cwd(), 'tmp/golden-contract-validation/SOURCE')
  const out: unknown[] = []
  for (const file of FILES) {
    const bytes = readFileSync(join(srcDir, file))
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const blocks = await indexDocxForTransform(ab)
    const paras = blocks.filter((b) => b.kind === 'paragraph')
    const cells = blocks.filter((b) => b.kind === 'tableCell')
    const tableIndexes = new Set(
      cells.map((b) => b.tableContext?.tableIndex).filter((x): x is number => x != null),
    )
    const party = discoverFilledPartyEvidence(blocks)
    const locs = discoverFilledLocationEvidence(blocks)
    const totals = discoverFilledTotalEvidence(blocks)
    const rep = detectRepresentedConcepts(blocks, {
      hasPartyEvidence: party.length > 0,
      hasPrepEvidence: locs.some((e) =>
        e.role === 'preparation' ||
        e.role === 'preparation_partner1' ||
        e.role === 'preparation_partner2',
      ),
      hasCeremonyEvidence: locs.some((e) => e.role === 'ceremony'),
      hasReceptionEvidence: locs.some((e) => e.role === 'reception'),
    })
    out.push({
      file,
      bytes: bytes.length,
      blocks: blocks.length,
      paragraphs: paras.length,
      tableCells: cells.length,
      tables: tableIndexes.size,
      paymentStart: findPaymentStartIndex(blocks),
      signatureStart: findSignatureStartIndex(blocks),
      partySurfaces: party.map((p) => ({
        blockId: p.blockId,
        surfaces: p.identitySurfaces,
        preview: p.sourceText.slice(0, 120),
      })),
      locationEvidence: locs.map((e) => ({
        blockId: e.blockId,
        role: e.role,
        preview: e.sourceText.slice(0, 100),
      })),
      totalEvidence: totals.map((t) => ({
        blockId: t.blockId,
        amount: t.sourceAmount,
        hasWords: t.hasWords,
        preview: t.sourceText.slice(0, 100),
      })),
      representation: rep,
      sampleHead: blocks.slice(0, 8).map((b) => `${b.blockId}: ${b.text.slice(0, 90)}`),
    })
  }
  mkdirSync('tmp/golden-contract-validation/EVIDENCE', { recursive: true })
  writeFileSync(
    'tmp/golden-contract-validation/EVIDENCE/SOURCE_INVENTORY.json',
    JSON.stringify(out, null, 2),
  )
  console.log(JSON.stringify(out, null, 2))
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
