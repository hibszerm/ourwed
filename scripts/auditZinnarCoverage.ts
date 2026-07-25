/**
 * One-off audit: Zinnar / PRIMEPHOTO contract dynamic coverage.
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/auditZinnarCoverage.ts
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { buildSlotsFromAnalysis } from '../src/features/documents/template/buildSlotsFromAnalysis'
import { extractDocxParagraphsIncludingEmpty } from '../src/features/documents/template/extractDocxParagraphs'
import { detectContractCandidates } from '../src/features/documents/template/candidateDetection'
import type { AiDocumentAnalysisResult } from '../src/features/documents/ai/types'

const emptyAi: AiDocumentAnalysisResult = {
  schemaVersion: '1',
  model: 'audit',
  promptVersion: 'audit',
  analyzerId: 'audit',
  analyzerVersion: '1',
  documentType: 'contract',
  overallConfidence: 1,
  fields: [],
  packageVariables: [],
  sections: [],
  clauses: [],
  warnings: [],
  analyzedAt: new Date().toISOString(),
  sourceTextLength: 0,
}

async function main() {
  const path = process.argv[2] ?? '/Users/marcin/Downloads/2026.06.20_Zinnar_film_signed.docx'
  const bytes = readFileSync(path)
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const paragraphs = await extractDocxParagraphsIncludingEmpty(ab)
  const joined = paragraphs.map((p) => p.text).join('\n')
  const nonempty = paragraphs.filter((p) => p.text.trim())
  console.log(
    JSON.stringify(
      {
        sourceFormat: 'docx',
        filename: path.split('/').pop(),
        paragraphCount: paragraphs.length,
        nonemptyParagraphs: nonempty.length,
        characterCount: joined.length,
      },
      null,
      2,
    ),
  )

  writeFileSync(
    '/tmp/zinnar-audit/app-paragraphs.txt',
    paragraphs.map((p) => `[${p.index}] ${p.text}`).join('\n'),
    'utf8',
  )

  const cands = detectContractCandidates(paragraphs)
  console.log('\n=== CANDIDATES ===')
  for (const c of cands) {
    console.log(
      `${c.decision}\t${c.proposedKey}\t${c.confidence}\t"${c.text}"\tp${c.paragraphIndex}\t${c.variableClassification ?? ''}\t${c.reason}`,
    )
  }

  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    plainText: joined,
    paragraphs,
    sourceKind: 'docx',
  })

  const dynamic = map.slots.filter(
    (s) =>
      s.registryKey &&
      s.variableClassification !== 'template_constant' &&
      s.variableClassification !== 'ignored_non_variable' &&
      s.enabled !== false,
  )
  const immutable = map.slots.filter(
    (s) =>
      s.variableClassification === 'template_constant' ||
      s.variableClassification === 'ignored_non_variable',
  )

  console.log('\n=== DYNAMIC SLOTS ===')
  for (const s of dynamic) {
    console.log(
      JSON.stringify({
        key: s.registryKey,
        text: s.originalText,
        para: s.paragraphIndex,
        start: s.startOffset,
        end: s.endOffset,
        conf: s.confidence,
        safety: s.physicalSpanSafety,
        req: s.requirement,
        bound: s.physicallyBound,
        class: s.variableClassification,
        reason: s.detectionReason,
      }),
    )
  }

  console.log('\n=== IMMUTABLE PROVIDER SLOTS ===')
  for (const s of immutable) {
    console.log(
      `${s.registryKey}\t"${(s.originalText ?? '').slice(0, 80)}"\tp${s.paragraphIndex}\tlinkable=${s.canLinkToCompany}`,
    )
  }

  console.log('\n=== META ===')
  console.log({
    providerPartyMode: map.providerPartyMode,
    clientPartyMode: map.clientPartyMode,
    analysisStatus: map.analysisStatus,
    lifecycleStatus: map.lifecycleStatus,
    warnings: map.analysisWarnings,
    counters: map.counters,
    dynamicCount: dynamic.length,
    immutableCount: immutable.length,
  })

  writeFileSync(
    '/tmp/zinnar-audit/analysis.json',
    JSON.stringify(
      {
        dynamic,
        immutable,
        meta: {
          providerPartyMode: map.providerPartyMode,
          clientPartyMode: map.clientPartyMode,
          analysisStatus: map.analysisStatus,
          warnings: map.analysisWarnings,
          counters: map.counters,
        },
        candidates: cands,
      },
      null,
      2,
    ),
    'utf8',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
