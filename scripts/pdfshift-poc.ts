/**
 * PDFShift vs local Gotenberg Chromium POC (DEV only).
 *
 * Builds the SAME fixture HTML for brief + contract print HTML, then renders:
 *   A) localDocker (Gotenberg Chromium) when configured
 *   B) PDFShift when PDFSHIFT_API_KEY is set
 *
 * By default PDFShift uses sandbox=true (no credit spend).
 * Set PDFSHIFT_POC_LIVE=1 and PDFSHIFT_POC_SANDBOX=false to spend credits.
 *
 *   npx tsx --tsconfig tsconfig.app.json --env-file=.env.local scripts/pdfshift-poc.ts
 *
 * Does NOT change production provider selection.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildWeddingBriefPdfData } from '../src/features/wedding-brief/buildWeddingBriefPdfData.ts'
import {
  buildWeddingBriefFilename,
  renderWeddingBriefHtml,
} from '../src/features/wedding-brief/renderWeddingBriefHtml.ts'
import { renderWeddingBriefFooterHtml } from '../src/features/wedding-brief/renderWeddingBriefFooterHtml.ts'
import { DEFAULT_TEMPLATE_SCHEMA } from '../src/features/prewedding/defaultTemplate.ts'
import { paragraphsToPrintHtml } from '../src/features/documents/template/docxParagraphEditor.ts'
import { resolvePdfRendererProvider } from '../src/features/documents/pdf/pdfRenderer.ts'
import {
  convertHtmlViaGotenberg,
  readGotenbergConfig,
} from '../supabase/functions/docx-to-pdf/gotenbergConvert.ts'
import { convertHtmlViaPdfShift } from '../supabase/functions/pdf-render/pdfShiftConvert.ts'
import type { Wedding } from '../src/types/wedding.ts'
import type { WeddingPlace } from '../src/types/travel.ts'

const outDir = resolve('tmp/pdf-poc')
mkdirSync(outDir, { recursive: true })

const wedding = {
  id: '00000000-0000-4000-8000-000000000001',
  couple: {
    partner1: 'Aleksandra Nowak',
    partner2: 'Michał Kowalski',
    partner1FirstName: 'Aleksandra',
    partner1LastName: 'Nowak',
    partner2FirstName: 'Michał',
    partner2LastName: 'Kowalski',
    email: 'aleksandra@example.test',
    phone: '500 100 200',
    venue: 'Villa Love',
    city: 'Izdebnik',
  },
  date: '2026-09-12',
  ceremonyTime: '14:30',
  packageName: 'Video Standard',
  packageId: 'pkg-1',
  price: 8500,
  depositAmount: 1500,
  currency: 'PLN',
  status: 'active',
  workflowStage: 'preparation',
  payments: [],
  notes: [
    {
      id: 'n1',
      author: 'Studio',
      content: 'WAŻNE: Ojciec Panny Młodej nie bierze udziału w uroczystości.',
      pinned: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  contacts: [],
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
} as Wedding

const places: WeddingPlace[] = [
  {
    id: '1',
    weddingId: wedding.id,
    role: 'ceremony',
    label: 'Kościół pw. św. Józefa',
    placeId: 'test:ceremony',
    formattedAddress: 'ul. Zamoyskiego 2, 30-519 Kraków',
    latitude: 50.0465,
    longitude: 19.9551,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: '2',
    weddingId: wedding.id,
    role: 'reception',
    label: 'Villa Love',
    placeId: 'test:villa',
    formattedAddress: 'Lwowska 78, 34-144 Izdebnik',
    latitude: 49.825068,
    longitude: 19.752234,
    sortOrder: 1,
    createdAt: '',
    updatedAt: '',
  },
]

const briefData = buildWeddingBriefPdfData({
  wedding,
  places,
  contacts: [
    {
      id: 'c1',
      weddingId: wedding.id,
      name: 'Aleksandra Nowak',
      role: 'Panna Młoda',
      phone: '500 100 200',
      email: 'aleksandra@example.test',
      createdAt: '',
    },
  ],
  extras: [],
  preWedding: {
    title: 'Ankieta przedślubna',
    submittedAt: '2026-08-20T10:00:00.000Z',
    schema: DEFAULT_TEMPLATE_SCHEMA,
    answers: {
      q1: '2026-09-12',
      q2: 'Aleksandra Nowak',
      q12: '14:30',
      q21: 'Naturalne ujęcia rodziców.',
    },
  },
  generatedAt: new Date('2026-09-11T06:42:00.000Z'),
})

const briefHtml = renderWeddingBriefHtml(briefData)
const briefFooter = renderWeddingBriefFooterHtml(briefData)
const briefFilename = buildWeddingBriefFilename(briefData)

/** Contract HTML for Chromium parity POC — NOT the production DOCX→LibreOffice path. */
const contractHtml = paragraphsToPrintHtml('Umowa — Aleksandra i Michał', [
  { index: 0, text: 'UMOWA O ŚWIADCZENIE USŁUG FILMOWYCH' },
  {
    index: 1,
    text: 'Zawarta w dniu 12.09.2026 r. pomiędzy Studiem OurWed a Parą Młodą: Aleksandra Nowak i Michał Kowalski.',
  },
  {
    index: 2,
    text: '§1 Przedmiot umowy\nPrzedmiotem umowy jest realizacja reportażu filmowego ze ślubu w dniu 12 września 2026 r.',
  },
  {
    index: 3,
    text: '§2 Wynagrodzenie\nCałkowite wynagrodzenie wynosi 8 500,00 PLN. Zadatek: 1 500,00 PLN.',
  },
  {
    index: 4,
    text: '§3 Miejsce\nCeremonia: Kościół pw. św. Józefa, Kraków. Przyjęcie: Villa Love, Izdebnik.',
  },
])

writeFileSync(resolve(outDir, 'brief-source.html'), briefHtml, 'utf8')
writeFileSync(resolve(outDir, 'brief-footer.html'), briefFooter, 'utf8')
writeFileSync(resolve(outDir, 'contract-source.html'), contractHtml, 'utf8')

const comparison: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  note:
    'Production contract PDF remains DOCX→Gotenberg LibreOffice. Contract rows here compare Chromium HTML print path vs PDFShift.',
  brief: { filename: briefFilename },
  contract: { title: 'Umowa — Aleksandra i Michał' },
  assets: {
    fonts: 'system stack only (Helvetica Neue / Times New Roman) — no @font-face',
    images: 'none in brief or contract print HTML',
    localhost: 'none in HTML source',
  },
  results: {} as Record<string, unknown>,
}

async function runLocal(
  name: 'brief' | 'contract',
  html: string,
  footerHtml?: string,
  filename?: string,
) {
  const config = readGotenbergConfig({ get: (k) => process.env[k] })
  if (!config.ok) {
    ;(comparison.results as Record<string, unknown>)[`${name}-local`] = {
      error: config.message,
    }
    console.warn('SKIP local', name, config.message)
    return
  }
  try {
    const { pdfBytes, provider } = await convertHtmlViaGotenberg({
      html,
      footerHtml,
      filename,
      config,
      maxPdfBytes: 40 * 1024 * 1024,
    })
    const out =
      name === 'brief'
        ? resolve(outDir, 'brief-local.pdf')
        : resolve(outDir, 'contract-local.pdf')
    writeFileSync(out, pdfBytes)
    ;(comparison.results as Record<string, unknown>)[`${name}-local`] = {
      path: out,
      bytes: pdfBytes.byteLength,
      provider,
    }
    console.log('OK local', name, out, pdfBytes.byteLength)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    ;(comparison.results as Record<string, unknown>)[`${name}-local`] = {
      error: msg,
    }
    console.warn('SKIP local', name, msg)
  }
}

async function runPdfShift(
  name: 'brief' | 'contract',
  html: string,
  footerHtml?: string,
) {
  const apiKey = process.env.PDFSHIFT_API_KEY?.trim()
  if (!apiKey) {
    ;(comparison.results as Record<string, unknown>)[`${name}-pdfshift`] = {
      skipped: 'PDFSHIFT_API_KEY not set',
    }
    console.warn('SKIP pdfshift', name, 'no PDFSHIFT_API_KEY')
    return
  }

  const live = process.env.PDFSHIFT_POC_LIVE === '1'
  const sandboxEnv = process.env.PDFSHIFT_POC_SANDBOX
  const sandbox =
    sandboxEnv === 'false' || sandboxEnv === '0' ? false : true
  if (!sandbox && !live) {
    ;(comparison.results as Record<string, unknown>)[`${name}-pdfshift`] = {
      skipped:
        'Refusing non-sandbox without PDFSHIFT_POC_LIVE=1 (credit protection)',
    }
    console.warn('SKIP pdfshift non-sandbox without PDFSHIFT_POC_LIVE=1')
    return
  }

  try {
    const result = await convertHtmlViaPdfShift({
      html,
      apiKey,
      options: {
        footerHtml,
        sandbox,
      },
    })
    const out =
      name === 'brief'
        ? resolve(outDir, 'brief-pdfshift.pdf')
        : resolve(outDir, 'contract-pdfshift.pdf')
    writeFileSync(out, result.pdfBytes)
    ;(comparison.results as Record<string, unknown>)[`${name}-pdfshift`] = {
      path: out,
      bytes: result.pdfBytes.byteLength,
      provider: result.provider,
      sandbox: result.sandbox,
    }
    console.log(
      'OK pdfshift',
      name,
      out,
      result.pdfBytes.byteLength,
      'sandbox=',
      result.sandbox,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    ;(comparison.results as Record<string, unknown>)[`${name}-pdfshift`] = {
      error: msg,
    }
    console.error('FAIL pdfshift', name, msg)
  }
}

const providerHint = resolvePdfRendererProvider(
  process.env.PDF_RENDER_PROVIDER,
)
console.log('POC provider hint (informational):', providerHint)
console.log('Artifacts →', outDir)

await runLocal('brief', briefHtml, briefFooter, briefFilename)
await runLocal('contract', contractHtml, undefined, 'contract-local.pdf')
await runPdfShift('brief', briefHtml, briefFooter)
await runPdfShift('contract', contractHtml)

const reportPath = resolve(outDir, 'comparison-report.json')
writeFileSync(reportPath, JSON.stringify(comparison, null, 2), 'utf8')
console.log('Wrote', reportPath)

if (
  !existsSync(resolve(outDir, 'brief-source.html')) ||
  !existsSync(resolve(outDir, 'contract-source.html'))
) {
  process.exit(1)
}

console.log('DONE pdfshift-poc (production provider unchanged)')
