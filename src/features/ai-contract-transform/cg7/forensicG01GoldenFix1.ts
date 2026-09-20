/**
 * Golden Fix 1 — G01 forensic capture (NO generator changes).
 * Offline path reconstruction + optional paid capture of model response.
 *
 *   npx tsx --tsconfig tsconfig.app.json src/features/ai-contract-transform/cg7/forensicG01GoldenFix1.ts
 *   G01_FORENSIC_PAID=1 …  (one paid call to capture raw changedBlocks)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createLocalFullRewriteInvoke,
  createUsageTracker,
} from '../cg2/localFullRewriteInvoke'
import {
  buildProtectedContractData,
  protectedDataSummary,
} from '../protectedContractData'
import { runPostReconstructionQualityGate } from '../quality/buildQualityReport'
import { summarizeRequiredReplacementsForPrompt } from '../quality/deterministicRepairs'
import { buildExpectationManifest } from '../quality/expectationManifest'
import {
  discoverFilledPartyEvidence,
  isClientPartyIdentityBlock,
  isProviderIdentityBlock,
  verifyProviderRoleSparseScope,
} from '../quality/partyFilledIdentity'
import { detectRepresentedConcepts } from '../quality/representationPolicy'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { buildContractTransformationDataset } from '../transformationDataset'
import { runFullAiRewrite } from '../transformApi'
import { buildGoldenScenarios } from './goldenScenarios'

function classifyOwner(text: string): 'CUSTOMER' | 'PROVIDER' | 'MIXED' | 'UNKNOWN' {
  const hasProvider =
    /\b(NIP|REGON)\b/i.test(text) ||
    /zwan\w*\s+dalej\s+[„"]?(Filmowc|Fotograf|Kamerzyst|Wykonawc|Usługodawc)/i.test(
      text,
    ) ||
    /prowadząc\w*\s+działalność|pod\s+firmą/i.test(text)
  const hasCustomer =
    /zwan\w*\s+dalej\s+[„"]?(Zamawiając|Klient)/i.test(text) ||
    /zamieszkał\w*|zam\.\s/i.test(text) ||
    /PESEL/i.test(text)
  if (hasProvider && hasCustomer) return 'MIXED'
  if (hasProvider) return 'PROVIDER'
  if (hasCustomer) return 'CUSTOMER'
  return 'UNKNOWN'
}

async function main() {
  const outDir = join(process.cwd(), 'tmp/golden-fix-1')
  mkdirSync(outDir, { recursive: true })

  const scenario = buildGoldenScenarios().find((s) => s.caseId === 'G01')
  if (!scenario) throw new Error('G01 scenario missing')

  const sourcePath = join(
    process.cwd(),
    'tmp/golden-contract-validation/SOURCE',
    scenario.sourceFile,
  )
  if (!existsSync(sourcePath)) {
    throw new Error(`SOURCE missing at ${sourcePath}`)
  }

  const buf = readFileSync(sourcePath)
  const sourceBytes = buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  )
  const blocks = await indexDocxForTransform(sourceBytes)
  const dataset = buildContractTransformationDataset({
    wedding: scenario.wedding,
    package: scenario.package,
    extras: scenario.extras,
    currentDate: '2026-11-05',
  })

  const partyEv = discoverFilledPartyEvidence(blocks)
  const represented = detectRepresentedConcepts(blocks, {
    hasPartyEvidence: partyEv.length > 0,
  })
  const protectedData = buildProtectedContractData({
    blocks,
    blockTexts: blocks.map((b) => b.text),
  })
  const manifest = buildExpectationManifest({
    sourceBlocks: blocks,
    dataset,
    protectedData,
  })
  const requiredReplacements = summarizeRequiredReplacementsForPrompt(
    manifest.requiredReplacements,
  )

  const relevantBlocks = blocks.filter((b) => {
    const t = b.text
    return (
      /NIP|REGON|zamieszkał|zam\.\s|Klient|Fotograf|PESEL|e-mail|Papierowa|Wzorcow|Alicj|Magdalen|Atelier|ul\./i.test(
        t,
      ) || partyEv.some((e) => e.blockId === b.blockId)
    )
  })

  const blockMap = relevantBlocks.map((b) => {
    const owner = classifyOwner(b.text)
    return {
      blockId: b.blockId,
      kind: b.kind,
      ownershipFamily: b.tableContext?.ownershipFamily ?? null,
      ownerHeuristic: owner,
      isProviderIdentityBlock: isProviderIdentityBlock(b.text),
      isClientPartyIdentityBlock: isClientPartyIdentityBlock(b.text),
      inPartyEvidence: partyEv.some((e) => e.blockId === b.blockId),
      sourceText: b.text,
      providerValuesInBlock: protectedData.entries
        .filter((e) => e.sourceBlockId === b.blockId)
        .map((e) => ({
          field: e.canonicalField,
          fingerprint: e.valueFingerprint,
          reason: e.ownershipReason,
        })),
    }
  })

  const addrInventory = manifest.sourceSpecificValues.filter(
    (s) => s.canonicalField === 'customer.address',
  )
  const addrRequired = manifest.requiredFields.filter(
    (f) => f.canonicalField === 'customer.address',
  )
  const nameRequired = manifest.requiredFields.filter(
    (f) => f.canonicalField === 'customer.names',
  )

  // Address regex probes (current vs needed)
  const para2 = blocks.find((b) => b.blockId === 'para-2')
  const addrRegexCurrent = /zam\.\s*([^,]+(?:,\s*\d{2}-\d{3}\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)?)/i
  // JS \w does NOT match Polish diacritics — use explicit letter class
  const addrRegexBroad =
    /zamieszkał[aąyuę](?:\s+przy)?\s+(ul\.\s*[^,]+(?:,\s*\d{2}-\d{3}\s+[^,]+)?)/i
  const currentAddrMatch = para2 ? para2.text.match(addrRegexCurrent) : null
  const broadAddrMatch = para2 ? para2.text.match(addrRegexBroad) : null

  let paidCapture: Record<string, unknown> | null = null

  if (process.env.G01_FORENSIC_PAID === '1') {
    const apiKey =
      process.env.OPENAI_API_KEY?.trim() ||
      (existsSync('/tmp/ourwed_cg2_openai_key')
        ? readFileSync('/tmp/ourwed_cg2_openai_key', 'utf8').trim()
        : '')
    if (!apiKey) throw new Error('API key missing for forensic paid capture')

    const usage = createUsageTracker()
    const invoke = createLocalFullRewriteInvoke({ apiKey, usage })
    const edge = await runFullAiRewrite({
      runId: `g01-forensic-${Date.now().toString(36)}`,
      documentBlocks: blocks,
      transformationDataset: dataset,
      protectedDataSummary: protectedDataSummary(protectedData),
      requiredReplacements,
      invoke,
    })

    if (!edge.ok) {
      paidCapture = { edgeError: edge.error, usage }
    } else {
      const gate = runPostReconstructionQualityGate({
        sourceBlocks: blocks,
        transformedBlocks: edge.transformedBlocks,
        dataset,
        protectedData,
        mode: 'full_ai',
      })
      const scopeIssues = verifyProviderRoleSparseScope({
        sourceBlocks: blocks,
        transformedBlocks: edge.transformedBlocks,
        partyEvidence: partyEv,
      })

      const changed = edge.transformedBlocks
        .map((t) => {
          const src = blocks.find((b) => b.blockId === t.blockId)
          if (!src || src.text === t.text) return null
          return {
            blockId: t.blockId,
            ownerHeuristic: classifyOwner(src.text),
            isProviderIdentityBlock: isProviderIdentityBlock(src.text),
            isClientPartyIdentityBlock: isClientPartyIdentityBlock(src.text),
            inPartyEvidence: partyEv.some((e) => e.blockId === t.blockId),
            sourceText: src.text,
            modelOutput: t.text,
            providerValuesLost: protectedData.entries
              .filter((e) => e.sourceBlockId === t.blockId)
              .filter((e) => !t.text.includes(e.sourceSpan))
              .map((e) => ({
                field: e.canonicalField,
                fingerprint: e.valueFingerprint,
              })),
            canonicalAddressPresent: dataset.clients.address
              ? t.text.includes(
                  typeof dataset.clients.address === 'string'
                    ? dataset.clients.address
                    : '',
                ) ||
                /Kasztanowa|60-214|Poznań/i.test(t.text)
              : null,
            staleCustomerPresent: /Alicj|Wzorcow|00-951/i.test(t.text),
            providerRoleNouns: {
              source: (src.text.match(/Fotograf\w*|Filmowc\w*/gi) ?? []).length,
              output: (t.text.match(/Fotograf\w*|Filmowc\w*/gi) ?? []).length,
            },
          }
        })
        .filter(Boolean)

      paidCapture = {
        usage,
        model: edge.model,
        durationMs: edge.durationMs,
        downloadAllowed: gate.downloadAllowed,
        blockingIssues: gate.report.blockingIssues,
        reviewIssues: gate.report.reviewIssues,
        scopeIssues,
        changedBlocks: changed,
        allTransformedCount: edge.transformedBlocks.length,
        note: 'This is a NEW forensic capture under frozen e8fd781 — original frozen-run raw response was not preserved.',
      }

      writeFileSync(
        join(outDir, 'G01_RAW_MODEL_CHANGED_BLOCKS.json'),
        JSON.stringify(changed, null, 2),
      )
    }
  }

  const forensic = {
    generatorSha: 'e8fd781cb3cb5465503f3886f390125b15bb0dd9',
    harnessSha: 'a191410fd0671cffb72cd85c11018d6f7d1fcfaa',
    sourceFile: scenario.sourceFile,
    sourceSha256:
      'd8f5b95eae9586adc5c37b681f2ba108ab2464fcc78f2ab8214a6d57a6710fee',
    datasetSummary: {
      clients: dataset.clients,
      dates: dataset.dates,
      finances: dataset.finances,
      package: dataset.package,
      extras: dataset.additionalServices?.map((s) => s.name) ?? [],
    },
    representation: represented,
    partyEvidence: partyEv.map((e) => ({
      blockId: e.blockId,
      identitySurfaces: e.identitySurfaces,
      preview: e.sourceText.slice(0, 160),
    })),
    protectedEntries: protectedData.entries.map((e) => ({
      field: e.canonicalField,
      sourceBlockId: e.sourceBlockId,
      fingerprint: e.valueFingerprint,
      reason: e.ownershipReason,
      // span length only — do not dump secrets into reports beyond fingerprint
      spanLen: e.sourceSpan.length,
    })),
    addressDiscovery: {
      representedCustomerAddress: represented.customerAddress,
      inventoryCurrentRegexMatch: currentAddrMatch?.[1] ?? null,
      inventoryBroadRegexMatch: broadAddrMatch?.[1] ?? null,
      sourceSpecificAddressValues: addrInventory,
      requiredAddressFields: addrRequired,
      requiredNameFields: nameRequired,
      diagnosis:
        represented.customerAddress &&
        !currentAddrMatch &&
        broadAddrMatch
          ? 'A3/A2: representation sees zamieszkał* but inventory regex only matches zam. — source address not inventoried; required address may lack grounded sourceBlockIds'
          : 'see report',
    },
    mixedParagraphDiagnosis: {
      para2: para2
        ? {
            isProviderIdentityBlock: isProviderIdentityBlock(para2.text),
            isClientPartyIdentityBlock: isClientPartyIdentityBlock(para2.text),
            ownerHeuristic: classifyOwner(para2.text),
            inPartyEvidence: partyEv.some((e) => e.blockId === 'para-2'),
            note: 'PROVIDER_BLOCK matches NIP/firmą/Fotografem; exclusion omits Klientką → whole MIXED opening treated as provider-only',
          }
        : null,
    },
    requiredReplacements,
    relevantBlocks: blockMap,
    frozenRunBlockingCodes: [
      'expected_dataset_value_missing:customer.address',
      'protected_value_changed:provider.taxId',
      'protected_value_changed:provider.regon',
      'protected_value_changed:provider.email',
      'protected_value_changed:provider.phone',
      'unnecessary_provider_role_rewrite:para-2',
      'unnecessary_provider_role_rewrite:para-14',
    ],
    paidCapture,
    originalRawResponsePreserved: false,
  }

  writeFileSync(join(outDir, 'G01_FORENSIC.json'), JSON.stringify(forensic, null, 2))

  const md = [
    '# G01 FORENSIC — Golden Fix 1 (pre-implementation)',
    '',
    'Generator: `e8fd781` · Harness: `a191410`',
    '',
    '## Original frozen-run status',
    '',
    '- Raw model response from the stopped golden run was **not preserved**.',
    '- Offline reconstruction below uses the same SOURCE + G01_DATA.',
    '- Optional `G01_FORENSIC_PAID=1` captures a fresh response under frozen code for evidence.',
    '',
    '## RCA-A — customer.address (offline)',
    '',
    `- represented.customerAddress = **${represented.customerAddress}** (zamieszkał* stem matches)`,
    `- Current inventory regex \`zam.\` match on para-2: **${currentAddrMatch?.[1] ?? 'NONE'}**`,
    `- Broad \`zamieszkał*\` match on para-2: **${broadAddrMatch?.[1] ?? 'NONE'}**`,
    `- Party evidence blocks: ${partyEv.map((e) => e.blockId).join(', ') || '(none)'}`,
    `- Required customer.address fields: ${JSON.stringify(addrRequired, null, 2)}`,
    '',
    '### Classification',
    '',
    '**Primary: A3** exact source address was not inventoried (regex only `zam.`, source uses `zamieszkałą przy`).',
    '',
    '**Contributing: A2** party evidence failed to claim the MIXED opening paragraph as client identity',
    '(`isProviderIdentityBlock` true → `isClientPartyIdentityBlock` false).',
    '',
    '**Contributing: A5/A6** without grounded address sourceBlockIds / deterministic repair, model may omit',
    'canonical address even while rewriting nearby identity; completeness then emits',
    '`expected_dataset_value_missing:customer.address`.',
    '',
    '## RCA-B — provider mutation (offline)',
    '',
    '### Mixed paragraph para-2',
    '',
    `- Heuristic owner: **${para2 ? classifyOwner(para2.text) : 'n/a'}**`,
    `- isProviderIdentityBlock: **${para2 ? isProviderIdentityBlock(para2.text) : 'n/a'}**`,
    `- isClientPartyIdentityBlock: **${para2 ? isClientPartyIdentityBlock(para2.text) : 'n/a'}**`,
    `- In partyEvidence: **${partyEv.some((e) => e.blockId === 'para-2')}**`,
    '',
    'Protected provider values are inventoried FROM para-2 (NIP/REGON/email/body_email),',
    'but the same paragraph also contains the only customer identity+address surface.',
    '',
    'When the model rewrites para-2 to update the customer half, it currently receives the',
    '**entire paragraph as a freely rewritable block**. Mode A then correctly detects',
    '`protected_value_changed` for taxId/regon/email/phone.',
    '',
    '### Classification',
    '',
    '**Primary: B4** sparse rewrite scope is whole-paragraph; mixed block authorized for customer',
    'facts (or rewritten opportunistically) without local fact-surface protection of provider spans.',
    '',
    '**Contributing: B2** ownership treated MIXED as PROVIDER for discovery, but still writable',
    'to the model as a normal document block (no preventive lock of provider spans).',
    '',
    '**Contributing: B5** model independently altered provider identity values inside the rewrite',
    '(caught post-hoc by protected-value gate — gate must remain).',
    '',
    '`unnecessary_provider_role_rewrite:para-2` fires because para-2 is **not** in partyEvidence',
    '(misclassified as provider-only), yet contains Fotograf role noun and was rewritten.',
    '',
    '## Shared root cause?',
    '',
    '**PARTIAL.** Both failures concentrate on the MIXED opening party paragraph, but mechanisms differ:',
    '- Address: discovery/inventory gap (`zam.` vs `zamieszkałą`) + weak party grounding',
    '- Provider: whole-block rewrite without local protected-span authorization',
    '',
    '## Relevant blocks',
    '',
    ...blockMap.map(
      (b) =>
        `### ${b.blockId} · ${b.ownerHeuristic} · provider=${b.isProviderIdentityBlock} client=${b.isClientPartyIdentityBlock} evidence=${b.inPartyEvidence}\n\n\`\`\`\n${b.sourceText}\n\`\`\`\n`,
    ),
    '',
    '## Paid capture',
    '',
    paidCapture
      ? 'See `G01_FORENSIC.json` → `paidCapture` and `G01_RAW_MODEL_CHANGED_BLOCKS.json`.'
      : 'Not run (set `G01_FORENSIC_PAID=1`).',
    '',
  ].join('\n')

  writeFileSync(join(outDir, 'G01_FORENSIC.md'), md)
  console.log('Wrote', join(outDir, 'G01_FORENSIC.md'))
  console.log('Wrote', join(outDir, 'G01_FORENSIC.json'))
  if (paidCapture) {
    console.log('Paid capture included. downloadAllowed=', (paidCapture as { downloadAllowed?: boolean }).downloadAllowed)
    console.log(
      'blocking=',
      ((paidCapture as { blockingIssues?: unknown[] }).blockingIssues ?? [])
        .map((i) =>
          typeof i === 'object' && i && 'code' in i
            ? `${(i as { code: string }).code}:${(i as { canonicalField?: string; blockId?: string }).canonicalField ?? (i as { blockId?: string }).blockId}`
            : String(i),
        )
        .join(' | '),
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
