/**
 * Preview vs saved DOCX artifact consistency.
 * Run: npm run test:contract-artifact-consistency
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { writeTransformedDocx } from '@/features/ai-contract-transform/docxTransformWriter'
import { renderSeparateAdditionalServicesParagraphs } from '@/features/ai-contract-transform/contractAdditionalServices'
import type { TransformDocumentBlock } from '@/features/ai-contract-transform/types'
import { hashBytes } from '@/features/documents/ai/hash'
import { buildMinimalDocxFromParagraphs } from '@/features/documents/template/buildMinimalDocx'
import {
  applyDocxParagraphEdits,
} from '@/features/documents/template/docxParagraphEditor'
import { extractDocxParagraphsIncludingEmpty } from '@/features/documents/template/extractDocxParagraphs'
import {
  buildFinalContractGenerationArtifact,
  paragraphsTextChanged,
} from '@/features/documents/template/finalContractGenerationArtifact'
import { resolveContractSaveBytes } from '@/features/documents/template/resolveContractSaveBytes'
import type { TransformContractResult } from '@/features/documents/template/ContractTransformationService'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

async function run(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

function block(
  id: string,
  idx: number,
  text: string,
): TransformDocumentBlock {
  return {
    blockId: id,
    paragraphIndex: idx,
    text,
    kind: 'paragraph',
  }
}

const VIDEO_STANDARD_PARAS = [
  'przyjęcia weselnego (...) reportaż obejmuje czas maksymalnie do godziny 23.30.',
  'Czas pracy filmowca wynosi maksymalnie 12 godzin.',
  'Każda dodatkowa godzina to koszt w wysokości 900 zł.',
  'Para młoda wybiera wykonanie dzieła w tzw. Pakiecie Video Standard, który obejmuje wykonanie (...) przez Filmowca:',
  'teledysku ślubnego o długości ok. 3 minut;',
  'filmu ślubnego o długości około 15 minut;',
  'mini sesji filmowej w dniu ślubu',
  '- oraz przekazanie filmów w wersji elektronicznej na pendrive Parze Młodej.',
  'Filmowiec wykonuje przedmiot Umowy pojedynczo...',
]

async function buildVideoStandardFixtureDocx(): Promise<{
  sourceBytes: ArrayBuffer
  sourceBlocks: TransformDocumentBlock[]
}> {
  const sourceBytes = await buildMinimalDocxFromParagraphs(VIDEO_STANDARD_PARAS)
  const sourceBlocks = VIDEO_STANDARD_PARAS.map((text, index) =>
    block(`para-${index}`, index, text),
  )
  return { sourceBytes, sourceBlocks }
}

function artifactFromDocx(input: {
  docxBytes: ArrayBuffer
  paragraphs: Array<{ index: number; text: string }>
  finalArtifact: Awaited<ReturnType<typeof buildFinalContractGenerationArtifact>>
}): TransformContractResult {
  return {
    draftId: 'draft-1',
    templateId: 'tpl-1',
    templateVersionId: 'ver-1',
    versionNumber: 1,
    title: 'Umowa',
    resolved: {},
    omittedKeys: [],
    originalParagraphs: input.paragraphs,
    paragraphs: input.paragraphs,
    docxBytes: input.docxBytes,
    usedMock: false,
    qualityRetries: 0,
    executionSnapshot: null,
    paymentDueRule: null,
    postGenerationAudit: { ok: true, issues: [], actionableIssues: [] },
    finalArtifact: input.finalArtifact,
  }
}

async function main() {
  const pageSource = readFileSync(
    resolve('src/pages/WeddingContractGenerationPage.tsx'),
    'utf8',
  )

  await run('page save uses resolveContractSaveBytes not blind re-edit', () => {
    assert(pageSource.includes('resolveContractSaveBytes'), 'resolver wired')
    assert(
      !pageSource.includes(
        'const edited = await applyDocxParagraphEdits(\n        docxBytes,\n        paragraphs.map',
      ),
      'old blind save path removed',
    )
    assert(
      pageSource.includes('downloadGeneratedDocx') &&
        pageSource.includes('if (!docxBytes)'),
      'download uses preview docxBytes',
    )
  })

  await run(
    're-applying source-index edits corrupts post-insertion DOCX',
    async () => {
      const { sourceBytes, sourceBlocks } = await buildVideoStandardFixtureDocx()
      const serviceParagraphs = renderSeparateAdditionalServicesParagraphs(['VHS'])
      const finalBytes = await writeTransformedDocx({
        sourceBytes,
        sourceBlocks,
        transformedBlocks: sourceBlocks.map((b) => ({
          blockId: b.blockId,
          text: b.text,
        })),
        paragraphInsertions: [
          {
            afterParagraphIndex: 7,
            paragraphs: serviceParagraphs,
          },
        ],
      })

      const extracted = await extractDocxParagraphsIncludingEmpty(finalBytes)
      assert(extracted.length > sourceBlocks.length, 'insertions expanded docx')
      assert(
        extracted.some((p) => p.text.includes('VHS')),
        'VHS present before corrupting save',
      )

      const corruptingEdits = sourceBlocks.map((b) => ({
        index: b.paragraphIndex,
        text: b.text,
      }))
      const corrupted = await applyDocxParagraphEdits(finalBytes, corruptingEdits)
      const after = await extractDocxParagraphsIncludingEmpty(corrupted)
      const joined = after.map((p) => p.text).join('\n')
      assert(
        !joined.includes('Ponadto Zamawiający wybrał następującą usługę dodatkową'),
        'blind re-edit removes additional-services intro',
      )
    },
  )

  await run('resolveContractSaveBytes preserves exact bytes when unchanged', async () => {
    const { sourceBytes, sourceBlocks } = await buildVideoStandardFixtureDocx()
    const serviceParagraphs = renderSeparateAdditionalServicesParagraphs(['VHS'])
    const finalBytes = await writeTransformedDocx({
      sourceBytes,
      sourceBlocks,
      transformedBlocks: sourceBlocks.map((b) => ({
        blockId: b.blockId,
        text: b.text,
      })),
      paragraphInsertions: [
        {
          afterParagraphIndex: 7,
          paragraphs: serviceParagraphs,
        },
      ],
    })
    const paragraphs = await extractDocxParagraphsIncludingEmpty(finalBytes)
    const finalArtifact = await buildFinalContractGenerationArtifact({
      sourceTemplateVersionId: 'ver-1',
      datasetFingerprint: 'fixture',
      finalBlocks: sourceBlocks.map((b) => ({ blockId: b.blockId, text: b.text })),
      paragraphInsertions: [
        { afterParagraphIndex: 7, paragraphs: serviceParagraphs },
      ],
      docxBytes: finalBytes,
    })
    const generated = artifactFromDocx({
      docxBytes: finalBytes,
      paragraphs,
      finalArtifact,
    })

    const resolved = await resolveContractSaveBytes({
      docxBytes: finalBytes,
      generated,
      currentParagraphs: paragraphs,
    })
    assert(!resolved.editsApplied, 'no edits applied')
    assertEq(
      await hashBytes(resolved.bytes),
      finalArtifact.finalDocxHash,
      'hash matches preview artifact',
    )

    const savedText = (await extractDocxParagraphsIncludingEmpty(resolved.bytes))
      .map((p) => p.text)
      .join('\n')
    assert(savedText.includes('VHS'), 'VHS in saved bytes')
    assert(savedText.includes('mini sesji filmowej w dniu ślubu'), 'mini session separate')
    assert(
      savedText.includes(
        '- oraz przekazanie filmów w wersji elektronicznej na pendrive Parze Młodej.',
      ),
      'pendrive separate',
    )
    assert(
      savedText.includes('Każda dodatkowa godzina to koszt w wysokości 900 zł.'),
      'overtime unchanged',
    )
    const miniIdx = savedText.indexOf('mini sesji filmowej')
    const pendriveIdx = savedText.indexOf('- oraz przekazanie filmów')
    assert(miniIdx >= 0 && pendriveIdx > miniIdx, 'mini before pendrive')
    assert(
      !savedText.slice(miniIdx, pendriveIdx).includes('pendrive'),
      'mini not merged with pendrive',
    )
  })

  await run('paragraphsTextChanged detects user edits', () => {
    const base = [
      { index: 0, text: 'A' },
      { index: 1, text: 'B' },
    ]
    assert(!paragraphsTextChanged(base, base), 'same')
    assert(
      paragraphsTextChanged([{ index: 0, text: 'A2' }, base[1]!], base),
      'text change',
    )
    assert(
      paragraphsTextChanged([base[0]!, { index: 1, text: 'B' }, { index: 2, text: 'C' }], base),
      'length change',
    )
  })

  await run('sparse service builds finalArtifact', () => {
    const sparse = readFileSync(
      resolve('src/features/documents/template/WeddingSparseContractGenerationService.ts'),
      'utf8',
    )
    assert(sparse.includes('buildFinalContractGenerationArtifact'), 'artifact built')
    assert(sparse.includes('extractDocxParagraphsIncludingEmpty'), 'paragraphs from final docx')
    assert(sparse.includes('paragraphInsertions: transform.paragraphInsertions'), 'insertions stored')
  })

  await run('transform service returns paragraphInsertions', () => {
    const transform = readFileSync(
      resolve('src/features/ai-contract-transform/transformService.ts'),
      'utf8',
    )
    assert(
      transform.includes('paragraphInsertions: gate.paragraphInsertions'),
      'insertions in sparse success',
    )
  })

  console.log('\nContract artifact consistency tests finished.')
}

void main()
