/**
 * Package template upload state-machine — no empty-dropzone flicker.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/studio/packageContractUploadStateMachine.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  resolvePackageTemplateSurface,
  shouldShowEmptyDropzone,
} from './packageTemplateUploadSurface'
import type { PackageTemplateUiPhase } from './packageTemplateUiPhase'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const phases: PackageTemplateUiPhase[] = [
  'idle_empty',
  'uploading',
  'saving',
  'success_transition',
  'ready',
  'error',
]

// Test 1 — successful path never shows empty between success and ready
const successPath: PackageTemplateUiPhase[] = [
  'idle_empty',
  'uploading',
  'saving',
  'success_transition',
  'ready',
]
for (const phase of successPath) {
  if (phase === 'idle_empty') {
    assert(shouldShowEmptyDropzone(phase), 'idle may show empty')
    continue
  }
  assert(
    !shouldShowEmptyDropzone(phase),
    `${phase} must not show empty dropzone`,
  )
  assert(
    resolvePackageTemplateSurface({
      phase,
      hasPersistedTemplate: phase === 'ready',
      card:
        phase === 'ready' || phase === 'success_transition'
          ? {
              templateId: 't1',
              templateVersionId: 'v1',
              fileName: 'umowa.docx',
              versionLabel: 'Wersja 1',
              uploadedAtLabel: null,
              paymentNotice: null,
            }
          : null,
    }) !== 'empty',
    `${phase} surface is not empty`,
  )
}

// Test 2 — delayed query: success_transition keeps progress, not empty
assert(
  resolvePackageTemplateSurface({
    phase: 'success_transition',
    hasPersistedTemplate: false,
    card: {
      templateId: 't1',
      templateVersionId: 'v1',
      fileName: 'umowa.docx',
      versionLabel: 'Wersja 1',
      uploadedAtLabel: '27.07.2026',
      paymentNotice: null,
    },
  }) === 'progress',
  'delayed refetch still shows progress/success card',
)
assert(
  !shouldShowEmptyDropzone('success_transition'),
  'no empty during success_transition',
)

// Test 3 — error keeps error surface (selected file retained in component)
assert(
  resolvePackageTemplateSurface({
    phase: 'error',
    hasPersistedTemplate: false,
    card: null,
  }) === 'error',
  'error surface',
)
assert(!shouldShowEmptyDropzone('error'), 'error does not reset to empty')

// Test 4 — existing template ready, no empty flash
assert(
  resolvePackageTemplateSurface({
    phase: 'ready',
    hasPersistedTemplate: true,
    card: {
      templateId: 't1',
      templateVersionId: 'v1',
      fileName: 'Umowa — Video Mini',
      versionLabel: 'Wersja 1',
      uploadedAtLabel: null,
      paymentNotice: null,
    },
  }) === 'ready',
  'existing template ready',
)
assert(
  !shouldShowEmptyDropzone('ready'),
  'ready with template never empty dropzone',
)

// Test 5 — replace while ready → uploading (no empty)
assert(
  resolvePackageTemplateSurface({
    phase: 'uploading',
    hasPersistedTemplate: true,
    card: {
      templateId: 'old',
      templateVersionId: 'v1',
      fileName: 'old.docx',
      versionLabel: 'Wersja 1',
      uploadedAtLabel: null,
      paymentNotice: null,
    },
  }) === 'progress',
  'replace shows progress not empty',
)

// Test 6 — all non-idle phases covered
for (const phase of phases) {
  if (phase === 'idle_empty') continue
  assert(
    !shouldShowEmptyDropzone(phase),
    `phase ${phase} blocks empty dropzone`,
  )
}

const section = source('src/features/studio/PackageContractSection.tsx')
assert(section.includes("phase === 'uploading'"), 'uploading phase')
assert(section.includes('success_transition'), 'success_transition phase')
assert(section.includes('inFlightRef'), 'in-flight guard')
assert(
  !section.includes("setView('upload')"),
  'legacy setView(upload) removed',
)
assert(
  section.includes('shouldShowEmptyDropzone'),
  'empty dropzone gated',
)
assert(
  source(
    'src/features/documents/contract-experience/PackageTemplateUploadProgress.tsx',
  ).includes('Spróbuj ponownie'),
  'retry action',
)
assert(!section.includes('Wgrano'), 'no temporary Wgrano label in section')

const progress = source(
  'src/features/documents/contract-experience/PackageTemplateUploadProgress.tsx',
)
assert(progress.includes('Przesyłanie pliku'), 'upload copy')
assert(progress.includes('Zapisywanie szablonu'), 'saving copy')
assert(progress.includes('Szablon został dodany'), 'success copy')

const surface = source('src/features/studio/packageTemplateUploadSurface.ts')
assert(surface.includes('success_transition'), 'surface knows success')
assert(surface.includes("phase === 'idle_empty'"), 'empty only when idle')

console.log('ok — packageContractUploadStateMachine')
