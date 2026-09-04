/**
 * Persistent Wedding Brief PDF — source fingerprint, generate/download split,
 * safe replacement, and failure matrix.
 *
 * Run: npm run test:persistent-wedding-brief
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CURRENT_BRIEF_GENERATOR_VERSION } from '@/features/wedding-brief/briefGeneratorVersion'
import {
  deriveWeddingBriefUiKind,
  briefPrimaryLabel,
  BRIEF_DOWNLOAD_LABEL,
  BRIEF_DOWNLOADING_LABEL,
  BRIEF_GENERATE_LABEL,
  BRIEF_GENERATING_LABEL,
  COCKPIT_BRIEF_DOWNLOAD_LABEL,
  COCKPIT_BRIEF_GENERATE_LABEL,
} from '@/features/wedding-brief/briefActionCopy'
import {
  buildCanonicalBriefSource,
  serializeCanonicalBriefSource,
} from '@/features/wedding-brief/canonicalBriefSource'
import { hashCanonicalBriefSource } from '@/features/wedding-brief/hashCanonicalBriefSource'
import {
  BriefSourceChangedError,
  createWeddingBriefWorkflow,
  type WeddingBriefWorkflowDeps,
} from '@/features/wedding-brief/weddingBriefWorkflow'
import type { BuildWeddingBriefPdfDataInput } from '@/features/wedding-brief/buildWeddingBriefPdfData'
import { DEFAULT_TEMPLATE_SCHEMA } from '@/features/prewedding/defaultTemplate'
import type { WeddingBriefRecord } from '@/lib/api/weddingBriefService'
import type { Session } from '@/types/session'
import type { TravelSegment, WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
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
  return Promise.resolve()
}

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function baseWedding(overrides?: Partial<Wedding>): Wedding {
  return {
    id: 'w-brief-1',
    couple: {
      partner1: 'Anna Nowak',
      partner2: 'Piotr Kowalski',
      partner1FirstName: 'Anna',
      partner1LastName: 'Nowak',
      partner2FirstName: 'Piotr',
      partner2LastName: 'Kowalski',
      partner1Phone: '500 100 200',
      email: 'anna@example.test',
      phone: '500 100 200',
      venue: 'Villa',
      city: 'Kraków',
    },
    date: '2026-09-12',
    ceremonyTime: '16:00',
    packageName: 'Video Standard',
    packageId: 'pkg-1',
    price: 8500,
    depositAmount: 1500,
    currency: 'PLN',
    status: 'active',
    workflowStage: 'pre_wedding_questionnaire',
    payments: [
      {
        id: 'p1',
        label: 'Zadatek',
        type: 'deposit',
        amount: 1500,
        paidAt: '2026-04-10',
        paid: true,
        method: 'transfer',
      },
    ],
    notes: [
      {
        id: 'n1',
        author: 'Studio',
        content: 'WAŻNE: nie organizować wejścia przez zakrystię.',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    checklist: [],
    schedule: [],
    finances: [],
    deliverables: [],
    timeline: [],
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'completed' },
    },
    contract: { status: 'generated' },
    accentColor: '#0a0a0a',
    packageItems: [],
    coverageEndTime: '00:30',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function place(partial: Partial<WeddingPlace> & Pick<WeddingPlace, 'id' | 'role'>): WeddingPlace {
  return {
    weddingId: 'w-brief-1',
    label: partial.label ?? 'Miejsce',
    formattedAddress: partial.formattedAddress ?? 'Adres 1',
    latitude: partial.latitude ?? 50.1,
    longitude: partial.longitude ?? 19.9,
    placeId: partial.placeId ?? `pid-${partial.id}`,
    sortOrder: partial.sortOrder ?? 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

function snapshot(overrides?: Partial<BuildWeddingBriefPdfDataInput>): BuildWeddingBriefPdfDataInput {
  return {
    wedding: baseWedding(),
    places: [
      place({ id: 'ceremony', role: 'ceremony', label: 'Kościół', sortOrder: 2 }),
      place({
        id: 'reception',
        role: 'reception',
        label: 'Sala',
        formattedAddress: 'Sala 2',
        sortOrder: 3,
      }),
    ],
    contacts: [
      {
        id: 'c1',
        weddingId: 'w-brief-1',
        name: 'Świadek',
        role: 'Świadek',
        phone: '511 000 111',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    extras: [
      {
        id: 'e1',
        weddingId: 'w-brief-1',
        extraServiceId: 'ex-1',
        name: 'Drone',
        priceSnapshot: 500,
        quantity: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    sessions: [],
    operationalTimes: { ceremony: '16:00' },
    travelSegments: [],
    preWedding: {
      schema: DEFAULT_TEMPLATE_SCHEMA,
      answers: {
        q1: '2026-09-12',
        q18: '120',
      },
    },
    ...overrides,
  }
}

function pdfBytes(): ArrayBuffer {
  return new TextEncoder().encode('%PDF-1.4\nfake-brief\n').buffer
}

function invalidPdf(): ArrayBuffer {
  return new TextEncoder().encode('not-a-pdf').buffer
}

type FakeStore = {
  current: WeddingBriefRecord | null
  files: Map<string, ArrayBuffer>
  removed: string[]
  pdfCalls: number
  persistCalls: number
}

function createFakeWorkflow(input: {
  snapshots: BuildWeddingBriefPdfDataInput[]
  pdf?: ArrayBuffer
  persistError?: Error
  uploadError?: Error
  oldDeleteError?: Error
  generatorVersion?: number
}): { workflow: ReturnType<typeof createWeddingBriefWorkflow>; store: FakeStore; deps: WeddingBriefWorkflowDeps } {
  const store: FakeStore = {
    current: null,
    files: new Map(),
    removed: [],
    pdfCalls: 0,
    persistCalls: 0,
  }
  let snapIndex = 0
  const deps: WeddingBriefWorkflowDeps = {
    loadSnapshot: async () => {
      const snap = input.snapshots[Math.min(snapIndex, input.snapshots.length - 1)]!
      if (snapIndex < input.snapshots.length - 1) snapIndex += 1
      return snap
    },
    hashSource: hashCanonicalBriefSource,
    generatePdfBytes: async () => {
      store.pdfCalls += 1
      return input.pdf ?? pdfBytes()
    },
    getCurrent: async () => store.current,
    persistCurrent: async (row) => {
      store.persistCalls += 1
      if (input.persistError) throw input.persistError
      const record: WeddingBriefRecord = {
        id: store.current?.id ?? 'brief-row-1',
        weddingId: row.weddingId,
        filePath: row.filePath,
        fileName: row.fileName,
        sourceHash: row.sourceHash,
        generatorVersion: row.generatorVersion,
        generatedAt: row.generatedAt,
        byteSize: row.byteSize,
      }
      store.current = record
      return record
    },
    uploadPdf: async (path, bytes) => {
      if (input.uploadError) throw input.uploadError
      store.files.set(path, bytes)
    },
    downloadPdf: async (path) => {
      const bytes = store.files.get(path)
      if (!bytes) throw new Error('missing file')
      return bytes
    },
    removeFile: async (path) => {
      if (input.oldDeleteError && store.current && path !== store.current.filePath) {
        throw input.oldDeleteError
      }
      store.files.delete(path)
      store.removed.push(path)
    },
    tryRemoveFile: async (path) => {
      store.files.delete(path)
      store.removed.push(path)
    },
    studioUserId: async () => 'user-1',
    randomId: () => `id-${Math.random().toString(16).slice(2)}-${store.pdfCalls}-${store.persistCalls}`,
    now: () => new Date('2026-08-20T08:00:00.000Z'),
    generatorVersion: input.generatorVersion ?? CURRENT_BRIEF_GENERATOR_VERSION,
  }
  return { workflow: createWeddingBriefWorkflow(deps), store, deps }
}

await run('1. No metadata → Generuj', () => {
  const kind = deriveWeddingBriefUiKind({
    hasBrief: false,
    storedSourceHash: null,
    storedGeneratorVersion: null,
    currentSourceHash: 'abc',
    currentGeneratorVersion: CURRENT_BRIEF_GENERATOR_VERSION,
    busyOperation: null,
  })
  assert(kind === 'NO_BRIEF', 'no brief')
  assert(BRIEF_GENERATE_LABEL === 'Generuj brief PDF', 'generate copy')
})

await run('2–4. Generate persists hash + version; download path skips pdf-render', async () => {
  const { workflow, store } = createFakeWorkflow({ snapshots: [snapshot()] })
  const result = await workflow.generateAndPersist('w-brief-1')
  assert(store.pdfCalls === 1, 'one conversion')
  assert(store.current != null, 'metadata persisted')
  assert(Boolean(store.current?.sourceHash), 'hash stored')
  assert(store.current?.generatorVersion === CURRENT_BRIEF_GENERATOR_VERSION, 'version stored')
  assert(store.files.size === 1, 'file uploaded')
  assert(result.bytes.byteLength > 0, 'bytes returned')

  const download = read('src/features/wedding-brief/downloadWeddingBriefPdf.ts')
  assert(download.includes('downloadStoredWeddingBriefPdf'), 'stored download')
  assert(download.includes('weddingBriefService.downloadPdf'), 'storage download')
  assert(!download.includes('convertWeddingBriefHtmlToPdf('), 'download file does not convert')
  assert(!download.includes("functions.invoke('pdf-render'"), 'no pdf-render in download')
  assert(!download.includes('localStorage'), 'no localStorage')
  assert(!download.includes('sessionStorage'), 'no sessionStorage')
  assert(download.includes("mode === 'download'"), 'explicit download mode')
})

await run('5. Relevant couple name change stales', async () => {
  const a = await hashCanonicalBriefSource(buildCanonicalBriefSource(snapshot()))
  const b = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({
        wedding: baseWedding({
          couple: {
            ...baseWedding().couple,
            partner1FirstName: 'Joanna',
            partner1: 'Joanna Nowak',
          },
        }),
      }),
    ),
  )
  assert(a !== b, 'name change')
})

await run('6. Change back restores the same hash', async () => {
  const original = snapshot()
  const a = await hashCanonicalBriefSource(buildCanonicalBriefSource(original))
  const changed = snapshot({
    wedding: baseWedding({ ceremonyTime: '17:00' }),
  })
  const b = await hashCanonicalBriefSource(buildCanonicalBriefSource(changed))
  assert(a !== b, 'ceremony time stales')
  const back = await hashCanonicalBriefSource(buildCanonicalBriefSource(original))
  assert(a === back, 'revert restores hash')
  const kind = deriveWeddingBriefUiKind({
    hasBrief: true,
    storedSourceHash: a,
    storedGeneratorVersion: CURRENT_BRIEF_GENERATOR_VERSION,
    currentSourceHash: back,
    currentGeneratorVersion: CURRENT_BRIEF_GENERATOR_VERSION,
    busyOperation: null,
  })
  assert(kind === 'CURRENT_BRIEF', 'Pobierz after revert')
})

await run('7. Irrelevant technical fields do not stale', async () => {
  const a = await hashCanonicalBriefSource(buildCanonicalBriefSource(snapshot()))
  const b = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({
        wedding: baseWedding({
          workflowStage: 'contract',
          status: 'archived',
          travelFeeStatus: 'charged',
          travelFeeAmount: 800,
          createdAt: '2026-08-20T00:00:00.000Z',
          timeline: [
            {
              id: 't1',
              title: 'Ślub dodany',
              date: '2026-01-01',
              type: 'created',
            },
          ],
        }),
      }),
    ),
  )
  assert(a === b, 'unrelated wedding fields ignored')
})

await run('8. Token / public-hash fields are not in the loader', () => {
  const loader = read('src/features/wedding-brief/loadWeddingBriefSource.ts')
  assert(!loader.includes('public_token'), 'no public token')
  assert(!loader.includes('publicToken'), 'no publicToken')
  assert(!loader.includes('rotate'), 'no rotate')
  assert(!loader.includes('getLatestSubmittedFormAnswerRecord'), 'no contract dump')
  const canonical = read('src/features/wedding-brief/canonicalBriefSource.ts')
  assert(!canonical.includes('updatedAt'), 'no updatedAt in canonical module payload')
  assert(!canonical.includes('generatedAt'), 'clock excluded')
})

await run('9. Generator version mismatch → Generuj', () => {
  const kind = deriveWeddingBriefUiKind({
    hasBrief: true,
    storedSourceHash: 'same',
    storedGeneratorVersion: 1,
    currentSourceHash: 'same',
    currentGeneratorVersion: 2,
    busyOperation: null,
  })
  assert(kind === 'STALE_BRIEF', 'version bump stales')
})

await run('10. Regenerate removes previous file after new pointer', async () => {
  const firstSnap = snapshot()
  const { workflow, store } = createFakeWorkflow({ snapshots: [firstSnap] })
  const first = await workflow.generateAndPersist('w-brief-1')
  const oldPath = first.record.filePath
  const staleSnap = snapshot({
    wedding: baseWedding({ ceremonyTime: '17:30' }),
  })
  const secondWf = createFakeWorkflow({ snapshots: [staleSnap] })
  secondWf.store.current = store.current
  secondWf.store.files = store.files
  const second = await secondWf.workflow.generateAndPersist('w-brief-1')
  assert(second.record.filePath !== oldPath, 'new path')
  assert(secondWf.store.removed.includes(oldPath), 'old removed')
  assert(secondWf.store.files.has(second.record.filePath), 'new kept')
  assert(!secondWf.store.files.has(oldPath), 'old gone')
})

await run('11. PDFShift failure preserves previous', async () => {
  const { store } = createFakeWorkflow({ snapshots: [snapshot()] })
  store.current = {
    id: 'existing',
    weddingId: 'w-brief-1',
    filePath: 'user-1/weddings/w-brief-1/briefs/old.pdf',
    fileName: 'brief.pdf',
    sourceHash: 'old-hash',
    generatorVersion: 1,
    generatedAt: '2026-08-01T00:00:00.000Z',
    byteSize: 12,
  }
  store.files.set(store.current.filePath, pdfBytes())
  const failing = createFakeWorkflow({
    snapshots: [snapshot()],
    pdf: pdfBytes(),
  })
  failing.store.current = store.current
  failing.store.files = store.files
  failing.deps.generatePdfBytes = async () => {
    throw new Error('PDF_RENDER_FAILED')
  }
  const wf = createWeddingBriefWorkflow(failing.deps)
  let threw = false
  try {
    await wf.generateAndPersist('w-brief-1')
  } catch {
    threw = true
  }
  assert(threw, 'generate failed')
  assert(failing.store.current?.filePath === store.current.filePath, 'old pointer')
  assert(failing.store.files.has(store.current.filePath), 'old file kept')
})

await run('12. Invalid PDF preserves previous', async () => {
  const previousPath = 'user-1/weddings/w-brief-1/briefs/old.pdf'
  const { deps, store } = createFakeWorkflow({
    snapshots: [snapshot()],
    pdf: invalidPdf(),
  })
  store.current = {
    id: 'existing',
    weddingId: 'w-brief-1',
    filePath: previousPath,
    fileName: 'brief.pdf',
    sourceHash: 'old-hash',
    generatorVersion: 1,
    generatedAt: '2026-08-01T00:00:00.000Z',
    byteSize: 12,
  }
  store.files.set(previousPath, pdfBytes())
  const wf = createWeddingBriefWorkflow(deps)
  let threw = false
  try {
    await wf.generateAndPersist('w-brief-1')
  } catch {
    threw = true
  }
  assert(threw, 'invalid pdf rejected')
  assert(store.current.filePath === previousPath, 'pointer unchanged')
  assert(store.files.has(previousPath), 'old file kept')
})

await run('13. Upload failure preserves previous', async () => {
  const previousPath = 'user-1/weddings/w-brief-1/briefs/old.pdf'
  const { workflow, store } = createFakeWorkflow({
    snapshots: [snapshot()],
    uploadError: new Error('storage denied'),
  })
  store.current = {
    id: 'existing',
    weddingId: 'w-brief-1',
    filePath: previousPath,
    fileName: 'brief.pdf',
    sourceHash: 'old-hash',
    generatorVersion: 1,
    generatedAt: '2026-08-01T00:00:00.000Z',
    byteSize: 12,
  }
  store.files.set(previousPath, pdfBytes())
  let threw = false
  try {
    await workflow.generateAndPersist('w-brief-1')
  } catch {
    threw = true
  }
  assert(threw, 'upload failed')
  assert(store.current.filePath === previousPath, 'old pointer')
})

await run('14. DB persist failure cleans new file and keeps old pointer', async () => {
  const previousPath = 'user-1/weddings/w-brief-1/briefs/old.pdf'
  const { workflow, store } = createFakeWorkflow({
    snapshots: [snapshot()],
    persistError: new Error('rls denied'),
  })
  store.current = {
    id: 'existing',
    weddingId: 'w-brief-1',
    filePath: previousPath,
    fileName: 'brief.pdf',
    sourceHash: 'old-hash',
    generatorVersion: 1,
    generatedAt: '2026-08-01T00:00:00.000Z',
    byteSize: 12,
  }
  store.files.set(previousPath, pdfBytes())
  let threw = false
  try {
    await workflow.generateAndPersist('w-brief-1')
  } catch {
    threw = true
  }
  assert(threw, 'persist failed')
  assert(store.current.filePath === previousPath, 'old pointer')
  assert(store.files.has(previousPath), 'old file kept')
  assert(
    [...store.files.keys()].every((k) => k === previousPath),
    'new upload cleaned',
  )
})

await run('15. Old-file deletion failure keeps new current', async () => {
  const { workflow, store } = createFakeWorkflow({ snapshots: [snapshot()] })
  const first = await workflow.generateAndPersist('w-brief-1')
  const stale = snapshot({ wedding: baseWedding({ ceremonyTime: '18:00' }) })
  const second = createFakeWorkflow({
    snapshots: [stale],
    oldDeleteError: new Error('delete denied'),
  })
  second.store.current = store.current
  second.store.files = store.files
  const result = await second.workflow.generateAndPersist('w-brief-1')
  assert(result.record.filePath !== first.record.filePath, 'new pointer')
  assert(second.store.current?.filePath === result.record.filePath, 'new remains current')
})

await run('16. Source change during generation does not become current', async () => {
  const previousPath = 'user-1/weddings/w-brief-1/briefs/old.pdf'
  const { workflow, store } = createFakeWorkflow({
    snapshots: [
      snapshot(),
      snapshot({ wedding: baseWedding({ ceremonyTime: '19:00' }) }),
    ],
  })
  store.current = {
    id: 'existing',
    weddingId: 'w-brief-1',
    filePath: previousPath,
    fileName: 'brief.pdf',
    sourceHash: 'old-hash',
    generatorVersion: 1,
    generatedAt: '2026-08-01T00:00:00.000Z',
    byteSize: 12,
  }
  store.files.set(previousPath, pdfBytes())
  let threw: unknown
  try {
    await workflow.generateAndPersist('w-brief-1')
  } catch (e) {
    threw = e
  }
  assert(threw instanceof BriefSourceChangedError, 'source changed error')
  assert(store.current.filePath === previousPath, 'previous preserved')
  assert(
    [...store.files.keys()].every((k) => k === previousPath),
    'stale upload cleaned',
  )
})

await run('17. Double click → one conversion', async () => {
  const { workflow, store } = createFakeWorkflow({ snapshots: [snapshot()] })
  const originalGenerate = workflow.generateAndPersist
  const started = Promise.all([
    originalGenerate('w-brief-1'),
    originalGenerate('w-brief-1'),
  ])
  await started
  assert(store.pdfCalls === 1, 'coalesced conversion')
  assert(store.persistCalls === 1, 'one persist')
})

await run('18. Concurrent persist: loser file cleaned, one current row', async () => {
  const shared: { current: WeddingBriefRecord | null; files: Map<string, ArrayBuffer>; removed: string[] } = {
    current: null,
    files: new Map(),
    removed: [],
  }
  function make(id: string) {
    const { deps } = createFakeWorkflow({ snapshots: [snapshot()] })
    deps.randomId = () => id
    deps.getCurrent = async () => shared.current
    deps.persistCurrent = async (row) => {
      const record: WeddingBriefRecord = {
        id: 'brief-row-1',
        weddingId: row.weddingId,
        filePath: row.filePath,
        fileName: row.fileName,
        sourceHash: row.sourceHash,
        generatorVersion: row.generatorVersion,
        generatedAt: row.generatedAt,
        byteSize: row.byteSize,
      }
      shared.current = record
      return record
    }
    deps.uploadPdf = async (path, bytes) => {
      shared.files.set(path, bytes)
    }
    deps.downloadPdf = async (path) => shared.files.get(path)!
    deps.tryRemoveFile = async (path) => {
      shared.files.delete(path)
      shared.removed.push(path)
    }
    deps.removeFile = async (path) => {
      shared.files.delete(path)
      shared.removed.push(path)
    }
    return createWeddingBriefWorkflow(deps)
  }
  const a = make('file-a')
  const b = make('file-b')
  await a.generateAndPersist('w-brief-1')
  await b.generateAndPersist('w-brief-1')
  assert(shared.current != null, 'one row')
  assert(shared.current?.filePath.includes('file-b'), 'last persist wins')
})

await run('19. Persistence is DB + Storage, not browser memory', () => {
  const service = read('src/lib/api/weddingBriefService.ts')
  assert(service.includes("from('wedding_briefs')"), 'db table')
  assert(service.includes('documentStorage'), 'storage helper')
  const hook = read('src/features/wedding-brief/useWeddingBriefAction.ts')
  assert(!hook.includes('localStorage'), 'hook no localStorage')
  assert(hook.includes('weddingBriefQueryKey'), 'metadata query')
  assert(hook.includes('weddingBriefSourceQueryKey'), 'source query')
})

await run('20. Modern / Classic / Cockpit share the hook', () => {
  const modern = read('src/features/weddings/modern-detail/ModernWeddingDetailHeader.tsx')
  const classic = read('src/features/weddings/detail/v2/WeddingHeaderActions.tsx')
  const cockpit = read('src/features/wedding-day-cockpit/WeddingDayCockpitView.tsx')
  const legacy = read('src/features/wedding-brief/WeddingBriefDownloadButton.tsx')
  assert(modern.includes('useWeddingBriefAction'), 'modern')
  assert(classic.includes('useWeddingBriefAction'), 'classic')
  assert(cockpit.includes("useWeddingBriefAction(data.weddingId, 'cockpit')"), 'cockpit')
  assert(legacy.includes('useWeddingBriefAction'), 'legacy remount-safe')
  assert(modern.includes('brief.label'), 'modern derived label')
  assert(classic.includes('brief.label'), 'classic derived label')
  assert(cockpit.includes('brief.label'), 'cockpit derived label')
})

await run('21. Current download never calls PDFShift', () => {
  const download = read('src/features/wedding-brief/downloadWeddingBriefPdf.ts')
  const workflow = read('src/features/wedding-brief/weddingBriefWorkflow.ts')
  const hook = read('src/features/wedding-brief/useWeddingBriefAction.ts')
  assert(download.includes('weddingBriefService.downloadPdf'), 'storage')
  assert(download.includes('downloadStoredWeddingBriefPdf'), 'stored helper')
  assert(!download.includes('loadWeddingBriefSourceSnapshot'), 'download does not load source')
  assert(!download.includes('renderWeddingBriefHtml'), 'download does not render HTML')
  assert(workflow.includes('convertWeddingBriefHtmlToPdf'), 'generate only in workflow')
  assert(hook.includes("'download' : 'generate'"), 'hook chooses mode from UI kind')
  assert(hook.includes("setBusyOperation(mode)"), 'busy follows operation')
  assert(hook.includes("mode === 'generate'"), 'download skips source refetch')
})

await run('22. Canonicalization: key order does not matter', async () => {
  const source = buildCanonicalBriefSource(snapshot())
  const flipped = {
    extras: source.extras,
    couple: source.couple,
    contacts: source.contacts,
    notes: source.notes,
    operationalTimes: source.operationalTimes,
    payments: source.payments,
    places: source.places,
    preWedding: source.preWedding,
    sessions: source.sessions,
    travelSegments: source.travelSegments,
    wedding: source.wedding,
  }
  const a = serializeCanonicalBriefSource(source)
  const b = serializeCanonicalBriefSource(flipped)
  assert(a === b, 'sorted keys')
})

await run('23. Canonicalization: ignored timestamps do not matter', async () => {
  const a = await hashCanonicalBriefSource(buildCanonicalBriefSource(snapshot()))
  const places = snapshot().places!.map((p) => ({
    ...p,
    updatedAt: '2026-08-20T12:00:00.000Z',
    createdAt: '2026-08-20T12:00:00.000Z',
  }))
  const b = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(snapshot({ places })),
  )
  assert(a === b, 'place timestamps ignored')
})

await run('24. Canonicalization: null vs empty string', async () => {
  const a = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({ wedding: baseWedding({ displayName: '' }) }),
    ),
  )
  const b = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({ wedding: baseWedding({ displayName: null }) }),
    ),
  )
  assert(a === b, 'empty displayName ≡ null')
})

await run('25. Brief-relevant session change stales', async () => {
  const a = await hashCanonicalBriefSource(buildCanonicalBriefSource(snapshot()))
  const session: Session = {
    id: 's1',
    sessionType: 'other',
    customSessionType: 'ślub cywilny',
    date: '2026-09-11',
    startTime: '12:00',
    primaryPerson: {},
    totalPrice: 0,
    depositAmount: 0,
    payments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const b = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(snapshot({ sessions: [session] })),
  )
  assert(a !== b, 'ślub session included')
  const other: Session = {
    ...session,
    id: 's2',
    customSessionType: 'sesja rodzinna',
    date: '2026-05-01',
  }
  const c = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(snapshot({ sessions: [other] })),
  )
  assert(a === c, 'unrelated session excluded')
})

await run('26. ADMIN_ONLY answer does not stale', async () => {
  const a = await hashCanonicalBriefSource(buildCanonicalBriefSource(snapshot()))
  const b = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({
        preWedding: {
          schema: DEFAULT_TEMPLATE_SCHEMA,
          answers: {
            q1: '2026-09-12',
            q18: '120',
            q27_info: 'admin only copy',
            q28: true,
          },
        },
      }),
    ),
  )
  assert(a === b, 'admin-only omitted')
})

await run('Payment amount stales; payment type-only does not', async () => {
  const a = await hashCanonicalBriefSource(buildCanonicalBriefSource(snapshot()))
  const amount = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({
        wedding: baseWedding({
          payments: [
            {
              id: 'p1',
              label: 'Zadatek',
              type: 'deposit',
              amount: 2000,
              paid: true,
            },
          ],
        }),
      }),
    ),
  )
  const typeOnly = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({
        wedding: baseWedding({
          payments: [
            {
              id: 'p1',
              label: 'Inny',
              type: 'installment',
              amount: 1500,
              paid: true,
              paidAt: '2026-08-01',
              note: 'ignore me',
            },
          ],
        }),
      }),
    ),
  )
  assert(a !== amount, 'amount stales')
  assert(a === typeOnly, 'type/label/note ignored')
})

await run('Travel ok segment stales; error segment does not', async () => {
  const none = await hashCanonicalBriefSource(buildCanonicalBriefSource(snapshot()))
  const ok: TravelSegment = {
    id: 'seg-1',
    weddingId: 'w-brief-1',
    sequence: 1,
    originKind: 'wedding_place',
    originWeddingPlaceId: 'ceremony',
    destinationKind: 'wedding_place',
    destinationWeddingPlaceId: 'reception',
    endpointsHash: 'h',
    distanceMeters: 1200,
    distanceText: '1.2 km',
    durationSeconds: 180,
    durationText: '3 min',
    travelMode: 'DRIVE',
    provider: 'google',
    status: 'ok',
    errorMessage: null,
    calculatedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  }
  const withOk = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(snapshot({ travelSegments: [ok] })),
  )
  const withError = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({ travelSegments: [{ ...ok, status: 'error', distanceMeters: null }] }),
    ),
  )
  assert(none !== withOk, 'ok travel included')
  assert(none === withError, 'error travel excluded')
})

await run('Operational time / extra / contact / place / date / package / coverage', async () => {
  const base = await hashCanonicalBriefSource(buildCanonicalBriefSource(snapshot()))
  const time = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(snapshot({ operationalTimes: { ceremony: '16:30' } })),
  )
  const extra = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({
        extras: [
          {
            id: 'e1',
            weddingId: 'w-brief-1',
            extraServiceId: 'ex-1',
            name: 'Slowmotion',
            priceSnapshot: 500,
            quantity: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    ),
  )
  const contact = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({
        contacts: [
          {
            id: 'c1',
            weddingId: 'w-brief-1',
            name: 'Świadek',
            role: 'Świadek',
            phone: '600 000 000',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    ),
  )
  const placeHash = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({
        places: [
          place({
            id: 'ceremony',
            role: 'ceremony',
            label: 'Inny kościół',
            sortOrder: 2,
          }),
          place({
            id: 'reception',
            role: 'reception',
            label: 'Sala',
            formattedAddress: 'Sala 2',
            sortOrder: 3,
          }),
        ],
      }),
    ),
  )
  const date = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(snapshot({ wedding: baseWedding({ date: '2026-10-01' }) })),
  )
  const pack = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({ wedding: baseWedding({ packageName: 'Premium' }) }),
    ),
  )
  const coverage = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({ wedding: baseWedding({ coverageEndTime: '01:00' }) }),
    ),
  )
  const note = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({
        wedding: baseWedding({
          notes: [
            {
              id: 'n1',
              author: 'Studio',
              content: 'WAŻNE: zmiana planu.',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      }),
    ),
  )
  const unrelatedNote = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({
        wedding: baseWedding({
          notes: [
            {
              id: 'n1',
              author: 'Studio',
              content: 'WAŻNE: nie organizować wejścia przez zakrystię.',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            {
              id: 'n2',
              author: 'Studio',
              content: 'Przypomnieć o fakturze.',
              createdAt: '2026-01-02T00:00:00.000Z',
            },
          ],
        }),
      }),
    ),
  )
  assert(base !== time, 'operational time')
  assert(base !== extra, 'extra name')
  assert(base !== contact, 'contact phone')
  assert(base !== placeHash, 'place label')
  assert(base !== date, 'date')
  assert(base !== pack, 'package')
  assert(base !== coverage, 'coverage end')
  assert(base !== note, 'critical note')
  assert(base === unrelatedNote, 'non-critical note ignored')
})

await run('Pre-wedding visible answer stales', async () => {
  const a = await hashCanonicalBriefSource(buildCanonicalBriefSource(snapshot()))
  const b = await hashCanonicalBriefSource(
    buildCanonicalBriefSource(
      snapshot({
        preWedding: {
          schema: DEFAULT_TEMPLATE_SCHEMA,
          answers: { q1: '2026-09-12', q18: '80' },
        },
      }),
    ),
  )
  assert(a !== b, 'guest count')
})

await run('UI labels + generate/download busy states', () => {
  assert(BRIEF_DOWNLOAD_LABEL === 'Pobierz brief PDF', 'download')
  assert(BRIEF_GENERATE_LABEL === 'Generuj brief PDF', 'generate')
  assert(BRIEF_GENERATING_LABEL === 'Generowanie…', 'generating copy')
  assert(BRIEF_DOWNLOADING_LABEL === 'Pobieranie…', 'downloading copy')

  const base = {
    hasBrief: true,
    storedSourceHash: 'x',
    storedGeneratorVersion: 1,
    currentSourceHash: 'x',
    currentGeneratorVersion: 1,
  } as const

  const idle = deriveWeddingBriefUiKind({ ...base, busyOperation: null })
  assert(idle === 'CURRENT_BRIEF', 'current idle')
  assert(briefPrimaryLabel(idle) === BRIEF_DOWNLOAD_LABEL, '3. success → Pobierz')
  assert(
    briefPrimaryLabel(idle, 'cockpit') === COCKPIT_BRIEF_DOWNLOAD_LABEL,
    '13. cockpit download copy',
  )

  const none = deriveWeddingBriefUiKind({
    hasBrief: false,
    storedSourceHash: null,
    storedGeneratorVersion: null,
    currentSourceHash: 'abc',
    currentGeneratorVersion: 1,
    busyOperation: null,
  })
  assert(none === 'NO_BRIEF', '1. no brief')
  assert(briefPrimaryLabel(none) === BRIEF_GENERATE_LABEL, '1. Generuj')
  assert(
    briefPrimaryLabel(none, 'cockpit') === COCKPIT_BRIEF_GENERATE_LABEL,
    '13. cockpit generate copy',
  )

  const generating = deriveWeddingBriefUiKind({
    ...base,
    busyOperation: 'generate',
  })
  assert(generating === 'GENERATING', '2. generate clicked')
  assert(briefPrimaryLabel(generating) === BRIEF_GENERATING_LABEL, '2. Generowanie…')
  assert(
    briefPrimaryLabel(generating, 'cockpit') === BRIEF_GENERATING_LABEL,
    'cockpit generating',
  )

  const downloading = deriveWeddingBriefUiKind({
    ...base,
    busyOperation: 'download',
  })
  assert(downloading === 'DOWNLOADING', '4. download clicked')
  assert(briefPrimaryLabel(downloading) === BRIEF_DOWNLOADING_LABEL, '4. Pobieranie…')
  assert(
    briefPrimaryLabel(downloading, 'cockpit') === BRIEF_DOWNLOADING_LABEL,
    '13. cockpit downloading',
  )
  assert(briefPrimaryLabel(downloading) !== BRIEF_GENERATING_LABEL, '6. download is not Generowanie…')

  const downloadError = deriveWeddingBriefUiKind({ ...base, busyOperation: null })
  assert(downloadError === 'CURRENT_BRIEF', '9. download error returns to Pobierz')
  assert(
    briefPrimaryLabel(downloadError) === BRIEF_DOWNLOAD_LABEL,
    '9. Pobierz after download error',
  )

  const hook = read('src/features/wedding-brief/useWeddingBriefAction.ts')
  assert(hook.includes("kind === 'CURRENT_BRIEF' ? 'download' : 'generate'"), '8. generate vs download')
  assert(hook.includes("setBusyOperation(mode)"), 'busy matches clicked operation')
  assert(hook.includes("if (inFlightRef.current) return"), '10. double-click blocked')
  assert(hook.includes("mode === 'generate'"), '7. download skips source invalidation')
  assert(!hook.includes('setGenerating(true)'), 'no shared generating flag')

  const copy = read('src/features/wedding-brief/briefActionCopy.ts')
  assert(copy.includes("kind === 'DOWNLOADING'"), 'downloading kind')
  assert(copy.includes("busyOperation === 'download'"), 'download busy')
  assert(copy.includes("busyOperation === 'generate'"), 'generate busy')

  const modern = read('src/features/weddings/modern-detail/ModernWeddingDetailHeader.tsx')
  const classic = read('src/features/weddings/detail/v2/WeddingHeaderActions.tsx')
  const cockpit = read('src/features/wedding-day-cockpit/WeddingDayCockpitView.tsx')
  const legacy = read('src/features/wedding-brief/WeddingBriefDownloadButton.tsx')
  assert(modern.includes('brief.label'), '11. modern uses shared label')
  assert(classic.includes('brief.label'), '12. classic uses shared label')
  assert(cockpit.includes('brief.label'), '13. cockpit uses shared label')
  assert(legacy.includes('brief.label'), '14. legacy uses shared label')
  assert(legacy.includes('disabled={brief.busy}'), '14. legacy disabled while busy')
})

await run('Migration + RLS + unique wedding_id', () => {
  const sql = read('supabase/migrations/20260820120000_wedding_briefs.sql')
  assert(sql.includes('create table if not exists public.wedding_briefs'), 'table')
  assert(sql.includes('wedding_id uuid not null unique'), 'one row')
  assert(sql.includes('references public.weddings (id) on delete cascade'), 'fk')
  assert(sql.includes('enable row level security'), 'rls')
  assert(sql.includes('force row level security'), 'force rls')
  assert(sql.includes('is_wedding_owner(wedding_id)'), 'owner')
  assert(sql.includes('account_has_pro_access()'), 'pro writes')
  assert(sql.includes('grant select, insert, update, delete'), 'grants')
  assert(!sql.includes('wedding_documents'), 'not contract versions')
})

await run('Storage path unique per generation; upsert false', () => {
  const service = read('src/lib/api/weddingBriefService.ts')
  const storage = read('src/lib/api/documents/storage.ts')
  const workflow = read('src/features/wedding-brief/weddingBriefWorkflow.ts')
  assert(service.includes('/briefs/'), 'briefs folder')
  assert(storage.includes('upsert: false'), 'no overwrite')
  assert(workflow.includes('weddingBriefStoragePath'), 'unique path')
  assert(workflow.includes('tryRemoveFile(filePath, \'persist-failed\')') || workflow.includes('persist-failed'), 'orphan cleanup')
  assert(workflow.includes('stale-generation-source-changed'), 'CAS cleanup')
})

await run('No dirty flags scattered across mutations', () => {
  const files = [
    'src/features/prewedding/weddingDaySync/applyWeddingDaySync.ts',
    'src/features/weddings/detail/useWeddingDetailHost.ts',
    'src/lib/api/weddingService.ts',
  ]
  for (const file of files) {
    const src = read(file)
    assert(!src.includes('invalidateBrief'), `${file} no invalidateBrief`)
    assert(!src.includes('briefDirty'), `${file} no briefDirty`)
    assert(!src.includes('setBriefNeedsRegeneration'), `${file} no dirty setter`)
  }
})

await run('SHA-256 via Web Crypto', () => {
  const hash = read('src/features/documents/ai/hash.ts')
  const briefHash = read('src/features/wedding-brief/hashCanonicalBriefSource.ts')
  assert(hash.includes("digest('SHA-256'"), 'sha-256')
  assert(briefHash.includes('hashDocumentText'), 'shared hash')
})
