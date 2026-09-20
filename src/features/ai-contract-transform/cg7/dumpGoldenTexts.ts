import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { indexDocxForTransform } from '../indexDocxForTransform'

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
  const outDir = join(process.cwd(), 'tmp/golden-contract-validation/EVIDENCE')
  mkdirSync(outDir, { recursive: true })
  for (const file of FILES) {
    const bytes = readFileSync(join(srcDir, file))
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const blocks = await indexDocxForTransform(ab)
    const lines = blocks.map((b, i) => `[${i}] ${b.blockId} | ${b.kind} | ${b.text}`)
    writeFileSync(join(outDir, file.replace('.docx', '_TEXT.txt')), lines.join('\n'))
    console.log(file, blocks.length)
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
