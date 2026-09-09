/**
 * A4 + A5 contract integrity — reception required; no template venue leakage.
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/utils/contractGenerationIntegrityAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildProtectedContractData } from '@/features/ai-contract-transform/protectedContractData'
import { blocksFromPlainParagraphs } from '@/features/ai-contract-transform/indexDocxForTransform'
import {
  isModeALocationIntegrityBlock,
  runPostReconstructionQualityGate,
} from '@/features/ai-contract-transform/quality/buildQualityReport'
import { buildExpectationManifest } from '@/features/ai-contract-transform/quality/expectationManifest'
import type { ContractTransformationDataset } from '@/features/ai-contract-transform/types'
import {
  generationBlockedByReadiness,
  mayGenerateContract,
} from '@/lib/utils/contractGenerationIntegrity'
import { evaluateWeddingContractReadiness } from '@/lib/utils/weddingContractReadiness'
import type { Wedding } from '@/types/wedding'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function run(name: string, fn: () => void | Promise<void>) {
  const result = fn()
  if (result && typeof (result as Promise<void>).then === 'function') {
    return (result as Promise<void>).then(
      () => console.log(`PASS  ${name}`),
      (err) => {
        console.error(`FAIL  ${name}`)
        console.error(err instanceof Error ? err.message : err)
        process.exitCode = 1
      },
    )
  }
  console.log(`PASS  ${name}`)
}

function baseWedding(overrides: Partial<Wedding> = {}): Wedding {
  return {
    id: 'qa-a4-a5',
    couple: {
      partner1: 'QA Bride',
      partner2: 'QA Groom',
      partner1FirstName: 'QA',
      partner1LastName: 'Bride',
      partner2FirstName: 'QA',
      partner2LastName: 'Groom',
      partner1Address: 'ul. Testowa 1',
      partner1PostalCode: '00-001',
      partner1City: 'Warszawa',
      partner1Phone: '500100200',
      phone: '500100200',
      email: 'qa@example.test',
      venue: '',
      city: '',
    },
    date: '2027-06-15',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Video Standard',
    packageId: 'pkg-1',
    price: 12400,
    depositAmount: 1000,
    currency: 'PLN',
    packageItems: [{ title: 'Video', sortOrder: 0, enabled: true }],
    coverageEndTime: '00:30',
    overtimeRate: 400,
    deliveryMonths: 3,
    finalPaymentDueDate: '2027-06-01',
    travelFeeStatus: 'charged',
    travelFeeAmount: 400,
    bridePreparationLocation: '',
    groomPreparationLocation: '',
    preparationLocation: '',
    ceremonyLocation: '',
    receptionLocation: 'Pałac Goetz',
    accentColor: '#0a0a0a',
    createdAt: '2026-01-01',
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
    ...overrides,
  }
}

function datasetWithReception(
  reception: string | null,
  extras?: Partial<ContractTransformationDataset['locations']>,
): ContractTransformationDataset {
  const hasCeremony = Boolean(extras?.ceremony)
  const hasPrep = Boolean(
    extras?.preparation ||
      (extras?.preparationLocations && extras.preparationLocations.length > 0),
  )
  const absentLocationRoles: Array<'ceremony' | 'preparation'> = []
  if (!hasCeremony) absentLocationRoles.push('ceremony')
  if (!hasPrep) absentLocationRoles.push('preparation')
  return {
    clients: {
      displayNames: 'QA Bride i QA Groom',
      personCount: 2,
      address: 'ul. Testowa 1, 00-001 Warszawa',
      phone: '500100200',
    },
    dates: {
      contractExecutionDate: '09.09.2026 r.',
      weddingDate: '15.06.2027 r.',
    },
    locations: {
      ...(reception
        ? { reception: { displayName: reception } }
        : {}),
      ...extras,
      ...(absentLocationRoles.length > 0
        ? {
            absentLocationRoles,
            locationRoleIntegrity: {
              eachRoleIndependent: true as const,
              neverInferAbsentRoleFromAnother: true as const,
              sameVenueOnlyWhenExplicitPerRole: true as const,
              absentMeansDoNotAssertVenue: true as const,
            },
          }
        : {}),
    },
    finances: {
      contractValueFormatted: '12 400 zł',
      contractValueWords: 'dwanaście tysięcy czterysta złotych',
      depositFormatted: '1 000 zł',
      depositWords: 'tysiąc złotych',
      remainingFormatted: '11 400 zł',
      remainingWords: 'jedenaście tysięcy czterysta złotych',
    },
    package: { name: 'Video Standard' },
  }
}

async function main() {
  // --- A4 readiness ---
  run('A4-1 missing reception → mayGenerateContract false', () => {
    const v = mayGenerateContract(baseWedding({ receptionLocation: '' }))
    assertEq(v.isReady, false, 'blocked')
    assert(
      v.missingGroups.some((g) => g.items.includes('Miejsce przyjęcia')),
      'labels Miejsce przyjęcia',
    )
  })

  run('A4-2 reception only → location requirement passes', () => {
    const readiness = evaluateWeddingContractReadiness(
      baseWedding({
        receptionLocation: 'Pałac Goetz',
        ceremonyLocation: '',
        bridePreparationLocation: '',
        groomPreparationLocation: '',
      }),
    )
    const locItems = readiness.items.filter((i) =>
      ['client_reception', 'client_ceremony', 'client_prep_bride', 'client_prep_groom'].includes(
        i.id,
      ),
    )
    assertEq(
      locItems.find((i) => i.id === 'client_reception')?.status,
      'complete',
      'reception complete',
    )
    assertEq(
      locItems.find((i) => i.id === 'client_ceremony')?.status,
      'optional',
      'ceremony optional',
    )
    assertEq(
      locItems.find((i) => i.id === 'client_prep_bride')?.status,
      'optional',
      'bride prep optional',
    )
    assertEq(
      locItems.find((i) => i.id === 'client_prep_groom')?.status,
      'optional',
      'groom prep optional',
    )
    assertEq(mayGenerateContract(baseWedding()).isReady, true, 'ready')
  })

  run('A4-3 venue text without street passes', () => {
    assertEq(
      mayGenerateContract(
        baseWedding({ receptionLocation: 'Hotel XYZ, Kraków' }),
      ).isReady,
      true,
      'partial venue ok',
    )
  })

  run('A4-4 regenerate / service boundary blocks missing reception before AI', () => {
    const blocked = generationBlockedByReadiness(
      mayGenerateContract(baseWedding({ receptionLocation: '' })),
    )
    assertEq(blocked.status, 'needs_review', 'blocked')
    assertEq(blocked.correlationId, null, 'no pipeline correlation')
    assert(
      blocked.reviewStatePatch.contextualMessages.some((m) =>
        /Miejsce przyjęcia/i.test(m),
      ),
      'mentions reception',
    )
    const sparse = readFileSync(
      resolve(
        process.cwd(),
        'src/features/documents/template/WeddingSparseContractGenerationService.ts',
      ),
      'utf8',
    )
    const guardIdx = sparse.indexOf('const readiness = mayGenerateContract(input.wedding)')
    const aiIdx = sparse.indexOf('await runSparseProductTransform')
    assert(guardIdx > 0 && aiIdx > guardIdx, 'readiness before AI transform')
    const legacy = readFileSync(
      resolve(
        process.cwd(),
        'src/features/documents/template/WeddingContractGenerationService.ts',
      ),
      'utf8',
    )
    assert(
      legacy.indexOf('mayGenerateContract(input.wedding)') > 0,
      'legacy generate also gated',
    )
  })

  run('A4-5 historical download path not gated by readiness (source)', () => {
    const preview = readFileSync(
      resolve(process.cwd(), 'src/pages/WeddingContractPreviewPage.tsx'),
      'utf8',
    )
    assert(
      !preview.includes('mayGenerateContract') &&
        !preview.includes('validateContractGeneration'),
      'preview/download not readiness-gated',
    )
    const sparse = readFileSync(
      resolve(
        process.cwd(),
        'src/features/documents/template/WeddingSparseContractGenerationService.ts',
      ),
      'utf8',
    )
    assert(sparse.includes('mayGenerateContract'), 'sparse generate gated')
  })

  run('A4 page + legacy generate wired', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/WeddingContractGenerationPage.tsx'),
      'utf8',
    )
    assert(page.includes('mayGenerateContract'), 'page uses shared rule')
    assert(
      page.includes('contract-readiness-generation-block'),
      'direct route block UI',
    )
    const legacy = readFileSync(
      resolve(
        process.cwd(),
        'src/features/documents/template/WeddingContractGenerationService.ts',
      ),
      'utf8',
    )
    assert(legacy.includes('mayGenerateContract'), 'legacy generate gated')
  })

  // --- A5 quality gate ---
  run('A5-1 empty reception + template venue → Mode A download blocked', () => {
    const source = blocksFromPlainParagraphs([
      'Przyjęcie weselne odbędzie się w obiekcie Zamek Wielkopolski w Rokosowie.',
      'Wynagrodzenie wynosi 12 400 zł (słownie: dwanaście tysięcy czterysta złotych).',
      'Zadatek 1 000 zł. Pozostała kwota 11 400 zł.',
    ])
    const dataset = datasetWithReception(null)
    const protectedData = buildProtectedContractData({ blocks: source })
    const manifest = buildExpectationManifest({
      sourceBlocks: source,
      dataset,
      protectedData,
    })
    assert(
      manifest.sourceSpecificValues.some((s) =>
        /Zamek|Rokosow/i.test(s.sourceValue),
      ),
      'inventories Zamek/Rokosów-class venue without special-case product code',
    )
    const gate = runPostReconstructionQualityGate({
      sourceBlocks: source,
      transformedBlocks: source.map((b) => ({
        blockId: b.blockId,
        text: b.text,
      })),
      dataset,
      protectedData,
      mode: 'full_ai',
    })
    assert(
      gate.report.blockingIssues.some((i) => isModeALocationIntegrityBlock(i)),
      'location integrity blocking issue',
    )
    assertEq(gate.downloadAllowed, false, 'Mode A download denied')
  })

  run('A5-2 ceremony example retained + valid reception → blocked or neutralized', () => {
    const source = blocksFromPlainParagraphs([
      'Ceremonia odbędzie się w Hotelu Example Ceremonia.',
      'Przyjęcie weselne odbędzie się w Pałacu Goetz.',
      'Wynagrodzenie wynosi 12 400 zł (słownie: dwanaście tysięcy czterysta złotych).',
      'Zadatek 1 000 zł. Pozostała kwota 11 400 zł.',
    ])
    const dataset = datasetWithReception('Pałac Goetz')
    const protectedData = buildProtectedContractData({ blocks: source })
    // Simulate AI that updated reception but left ceremony example
    const transformed = source.map((b) => ({
      blockId: b.blockId,
      text: b.text.includes('Przyjęcie')
        ? 'Przyjęcie weselne odbędzie się w Pałacu Goetz.'
        : b.text,
    }))
    const gate = runPostReconstructionQualityGate({
      sourceBlocks: source,
      transformedBlocks: transformed,
      dataset,
      protectedData,
      mode: 'full_ai',
    })
    const joined = transformed.map((b) => b.text).join('\n')
    const ceremonyExampleSurvived = /Hotel Example Ceremonia/i.test(joined)
    if (ceremonyExampleSurvived) {
      assertEq(gate.downloadAllowed, false, 'A5 blocks surviving ceremony example')
    } else {
      assert(true, 'ceremony example neutralized')
    }
  })

  run('A5-3 real reception wins over template example', () => {
    const source = blocksFromPlainParagraphs([
      'Przyjęcie weselne odbędzie się w Hotelu Template Example.',
      'Wynagrodzenie wynosi 12 400 zł (słownie: dwanaście tysięcy czterysta złotych).',
      'Zadatek 1 000 zł. Pozostała kwota 11 400 zł.',
    ])
    const dataset = datasetWithReception('Pałac Goetz')
    const protectedData = buildProtectedContractData({ blocks: source })
    const transformed = source.map((b) => ({
      blockId: b.blockId,
      text: b.text.replace(
        'Hotelu Template Example',
        'obiekcie Pałac Goetz',
      ),
    }))
    const gate = runPostReconstructionQualityGate({
      sourceBlocks: source,
      transformedBlocks: transformed,
      dataset,
      protectedData,
      mode: 'full_ai',
    })
    const joined = transformed.map((b) => b.text).join('\n')
    assert(/Pałac Goetz/i.test(joined), 'real reception present')
    assert(!/Template Example/i.test(joined), 'template example gone')
    assert(
      !gate.report.blockingIssues.some(
        (i) =>
          i.code === 'stale_source_value_remaining' &&
          i.canonicalField === 'wedding.receptionLocation',
      ),
      'no stale reception template value',
    )
    assertEq(gate.downloadAllowed, true, 'Mode A allows clean reception replace')
  })

  run('A5-4 real ceremony replaces example when supplied', () => {
    const source = blocksFromPlainParagraphs([
      'Ceremonia odbędzie się w Kościele Example.',
      'Przyjęcie weselne odbędzie się w Pałacu Goetz.',
      'Wynagrodzenie wynosi 12 400 zł (słownie: dwanaście tysięcy czterysta złotych).',
      'Zadatek 1 000 zł. Pozostała kwota 11 400 zł.',
    ])
    const dataset = datasetWithReception('Pałac Goetz', {
      ceremony: { displayName: 'Kościół Mariacki' },
    })
    const protectedData = buildProtectedContractData({ blocks: source })
    const transformed = source.map((b) => ({
      blockId: b.blockId,
      text: b.text
        .replace('Kościele Example', 'Kościół Mariacki')
        .replace('Pałacu Goetz', 'Pałac Goetz'),
    }))
    const gate = runPostReconstructionQualityGate({
      sourceBlocks: source,
      transformedBlocks: transformed,
      dataset,
      protectedData,
      mode: 'full_ai',
    })
    const joined = transformed.map((b) => b.text).join('\n')
    assert(/Kościół Mariacki/i.test(joined), 'real ceremony present')
    assert(!/Example/i.test(joined), 'example ceremony gone')
    assert(
      !gate.report.blockingIssues.some(
        (i) =>
          i.code === 'stale_source_value_remaining' &&
          i.canonicalField === 'wedding.ceremonyLocation',
      ),
      'no stale ceremony template value',
    )
  })

  run('A5-5 same ceremony and reception allowed by readiness', () => {
    const w = baseWedding({
      ceremonyLocation: 'Pałac Goetz',
      receptionLocation: 'Pałac Goetz',
    })
    assertEq(mayGenerateContract(w).isReady, true, 'same venue ok')
  })

  run('A5-6 commercial values unchanged in readiness path', () => {
    const w = baseWedding()
    assertEq(w.price, 12400, 'cv')
    assertEq(w.depositAmount, 1000, 'deposit')
    assertEq(w.travelFeeAmount, 400, 'travel')
    assertEq(mayGenerateContract(w).isReady, true, 'ready with money')
  })

  run('A5-7 no Rokosów special-case in product code', () => {
    const files = [
      'src/lib/utils/contractGenerationIntegrity.ts',
      'src/lib/utils/weddingContractReadiness.ts',
      'src/features/ai-contract-transform/quality/buildQualityReport.ts',
      'src/features/documents/template/WeddingSparseContractGenerationService.ts',
    ]
    for (const rel of files) {
      const src = readFileSync(resolve(process.cwd(), rel), 'utf8')
      assert(!/Rokos[oó]w/i.test(src), `${rel} must not special-case Rokosów`)
    }
  })

  // --- A5 role-fact invention (reception must not fill absent ceremony/prep) ---
  run('A5-8 reception-only: invented ceremony/prep from reception → Mode A block', () => {
    const source = blocksFromPlainParagraphs([
      'Przygotowań ślubnych, które odbędą się w Hotelu Prep Example;',
      'ceremonii ślubu, która odbędzie się w Zamek Wielkopolski w Rokosowie;',
      'przyjęcia weselnego, które odbędzie się w Hotelu Reception Example.',
      'Wynagrodzenie wynosi 12 400 zł (słownie: dwanaście tysięcy czterysta złotych).',
      'Zadatek 1 000 zł. Pozostała kwota 11 400 zł.',
    ])
    const dataset = datasetWithReception('QA Pałac Testowy')
    assert(
      dataset.locations.absentLocationRoles?.includes('ceremony') &&
        dataset.locations.absentLocationRoles?.includes('preparation'),
      'absent roles marked',
    )
    const protectedData = buildProtectedContractData({ blocks: source })
    // Simulate Full-AI that cleared template venues by copying reception into all roles
    const transformed = [
      {
        blockId: source[0]!.blockId,
        text: 'Przygotowań ślubnych, które odbędą się w QA Pałac Testowy;',
      },
      {
        blockId: source[1]!.blockId,
        text: 'ceremonii ślubu, która odbędzie się w QA Pałac Testowy;',
      },
      {
        blockId: source[2]!.blockId,
        text: 'przyjęcia weselnego, które odbędzie się w QA Pałac Testowy.',
      },
      {
        blockId: source[3]!.blockId,
        text: source[3]!.text,
      },
      {
        blockId: source[4]!.blockId,
        text: source[4]!.text,
      },
    ]
    const gate = runPostReconstructionQualityGate({
      sourceBlocks: source,
      transformedBlocks: transformed,
      dataset,
      protectedData,
      mode: 'full_ai',
    })
    assert(
      gate.report.blockingIssues.some(
        (i) =>
          i.code === 'invented_location_for_absent_role' &&
          isModeALocationIntegrityBlock(i),
      ),
      'blocks invented ceremony/prep from reception',
    )
    assertEq(gate.downloadAllowed, false, 'Mode A denies invented role facts')
  })

  run('A5-9 explicit same venue ceremony+reception → ALLOW', () => {
    const source = blocksFromPlainParagraphs([
      'Ceremonia odbędzie się w Kościele Example.',
      'Przyjęcie weselne odbędzie się w Hotelu Example.',
      'Wynagrodzenie wynosi 12 400 zł (słownie: dwanaście tysięcy czterysta złotych).',
      'Zadatek 1 000 zł. Pozostała kwota 11 400 zł.',
    ])
    const dataset = datasetWithReception('QA Pałac Testowy', {
      ceremony: { displayName: 'QA Pałac Testowy' },
    })
    assert(
      !dataset.locations.absentLocationRoles?.includes('ceremony'),
      'ceremony not absent',
    )
    const protectedData = buildProtectedContractData({ blocks: source })
    const transformed = source.map((b) => ({
      blockId: b.blockId,
      text: b.text
        .replace('Kościele Example', 'QA Pałac Testowy')
        .replace('Hotelu Example', 'QA Pałac Testowy'),
    }))
    const gate = runPostReconstructionQualityGate({
      sourceBlocks: source,
      transformedBlocks: transformed,
      dataset,
      protectedData,
      mode: 'full_ai',
    })
    assert(
      !gate.report.blockingIssues.some(
        (i) => i.code === 'invented_location_for_absent_role',
      ),
      'no invented-role issue when both explicit',
    )
    assertEq(gate.downloadAllowed, true, 'same explicit venue allowed')
  })

  run('A5-10 distinct ceremony + reception retain authoritative values', () => {
    const source = blocksFromPlainParagraphs([
      'Ceremonia odbędzie się w Kościele Example.',
      'Przyjęcie weselne odbędzie się w Hotelu Example.',
      'Wynagrodzenie wynosi 12 400 zł (słownie: dwanaście tysięcy czterysta złotych).',
      'Zadatek 1 000 zł. Pozostała kwota 11 400 zł.',
    ])
    const dataset = datasetWithReception('QA Pałac Testowy', {
      ceremony: { displayName: 'Kościół QA' },
    })
    const protectedData = buildProtectedContractData({ blocks: source })
    const transformed = source.map((b) => ({
      blockId: b.blockId,
      text: b.text
        .replace('Kościele Example', 'Kościół QA')
        .replace('Hotelu Example', 'QA Pałac Testowy'),
    }))
    const gate = runPostReconstructionQualityGate({
      sourceBlocks: source,
      transformedBlocks: transformed,
      dataset,
      protectedData,
      mode: 'full_ai',
    })
    const joined = transformed.map((b) => b.text).join('\n')
    assert(/Kościół QA/i.test(joined), 'ceremony value present')
    assert(/QA Pałac Testowy/i.test(joined), 'reception value present')
    assert(
      !gate.report.blockingIssues.some(
        (i) => i.code === 'invented_location_for_absent_role',
      ),
      'no cross-role invention',
    )
    assertEq(gate.downloadAllowed, true, 'distinct roles allowed')
  })

  run('A5-11 reception only + Rokosów cleared without reception-as-ceremony', () => {
    const source = blocksFromPlainParagraphs([
      'Ceremonia odbędzie się w Zamek Wielkopolski w Rokosowie.',
      'Przyjęcie weselne odbędzie się w Hotelu Template.',
      'Wynagrodzenie wynosi 12 400 zł (słownie: dwanaście tysięcy czterysta złotych).',
      'Zadatek 1 000 zł. Pozostała kwota 11 400 zł.',
    ])
    const dataset = datasetWithReception('QA Pałac Testowy')
    const protectedData = buildProtectedContractData({ blocks: source })
    // Safe neutralization: ceremony venue removed, reception replaced — no copied reception
    const transformed = [
      {
        blockId: source[0]!.blockId,
        text: 'Ceremonia odbędzie się w miejscu wskazanym przez Parę Młodą.',
      },
      {
        blockId: source[1]!.blockId,
        text: 'Przyjęcie weselne odbędzie się w QA Pałac Testowy.',
      },
      { blockId: source[2]!.blockId, text: source[2]!.text },
      { blockId: source[3]!.blockId, text: source[3]!.text },
    ]
    const gate = runPostReconstructionQualityGate({
      sourceBlocks: source,
      transformedBlocks: transformed,
      dataset,
      protectedData,
      mode: 'full_ai',
    })
    const joined = transformed.map((b) => b.text).join('\n')
    assert(!/Rokos/i.test(joined), 'no Rokosów')
    assert(/QA Pałac Testowy/i.test(joined), 'reception present')
    assert(
      !/ceremoni[^\n]*QA Pałac Testowy/i.test(joined),
      'reception not asserted as ceremony',
    )
    assert(
      !gate.report.blockingIssues.some(
        (i) => i.code === 'invented_location_for_absent_role',
      ),
      'safe neutralization ok',
    )
    assertEq(gate.downloadAllowed, true, 'allows safe neutralization')
  })

  run('A5-12 prep empty: reception copied into prep → block; template prep cleared → ok', () => {
    const source = blocksFromPlainParagraphs([
      'Przygotowania odbędą się w Willi Prep Example.',
      'Przyjęcie weselne odbędzie się w Hotelu Template.',
      'Wynagrodzenie wynosi 12 400 zł (słownie: dwanaście tysięcy czterysta złotych).',
      'Zadatek 1 000 zł. Pozostała kwota 11 400 zł.',
    ])
    const dataset = datasetWithReception('QA Pałac Testowy')
    const protectedData = buildProtectedContractData({ blocks: source })
    const invented = [
      {
        blockId: source[0]!.blockId,
        text: 'Przygotowania odbędą się w QA Pałac Testowy.',
      },
      {
        blockId: source[1]!.blockId,
        text: 'Przyjęcie weselne odbędzie się w QA Pałac Testowy.',
      },
      { blockId: source[2]!.blockId, text: source[2]!.text },
      { blockId: source[3]!.blockId, text: source[3]!.text },
    ]
    const inventedGate = runPostReconstructionQualityGate({
      sourceBlocks: source,
      transformedBlocks: invented,
      dataset,
      protectedData,
      mode: 'full_ai',
    })
    assertEq(inventedGate.downloadAllowed, false, 'blocks prep invention')
    const safe = [
      {
        blockId: source[0]!.blockId,
        text: 'Przygotowania — lokalizacja do ustalenia.',
      },
      {
        blockId: source[1]!.blockId,
        text: 'Przyjęcie weselne odbędzie się w QA Pałac Testowy.',
      },
      { blockId: source[2]!.blockId, text: source[2]!.text },
      { blockId: source[3]!.blockId, text: source[3]!.text },
    ]
    const safeGate = runPostReconstructionQualityGate({
      sourceBlocks: source,
      transformedBlocks: safe,
      dataset,
      protectedData,
      mode: 'full_ai',
    })
    assert(!/Prep Example|Willa Prep/i.test(safe.map((b) => b.text).join('\n')), 'no template prep')
    assertEq(safeGate.downloadAllowed, true, 'allows neutralized prep')
  })

  run('generationBlockedByReadiness shape', () => {
    const blocked = generationBlockedByReadiness(
      mayGenerateContract(baseWedding({ receptionLocation: '' })),
    )
    assertEq(blocked.status, 'needs_review', 'needs_review')
    assertEq(blocked.correlationId, null, 'no AI correlation')
  })

  console.log('\ncontract generation integrity A4+A5: done')
}

void main()
