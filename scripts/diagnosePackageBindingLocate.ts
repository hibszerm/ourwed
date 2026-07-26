/**
 * Diagnose persisted bindings vs DOCX paragraphs for package contract version.
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/diagnosePackageBindingLocate.ts
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { extractDocxParagraphsIncludingEmpty } from '../src/features/documents/template/extractDocxParagraphs'
import { canonicalizeParagraphText } from '../src/features/documents/template/canonicalParagraph'
import { locateSlotInParagraph } from '../src/features/documents/template/slotRenderer'
import { parseSlotMap, type TemplateSlot } from '../src/features/documents/template/types'

function loadEnv() {
  const raw = readFileSync('.env.local', 'utf8')
  const get = (k: string) =>
    raw
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith(`${k}=`))
      ?.slice(k.length + 1)
      ?.replace(/^["']|["']$/g, '')
      ?.trim()
  return {
    url: get('VITE_SUPABASE_URL')!,
    key:
      get('VITE_SUPABASE_SERVICE_ROLE_KEY') ||
      get('SUPABASE_SERVICE_ROLE_KEY') ||
      get('VITE_SUPABASE_ANON_KEY') ||
      get('VITE_SUPABASE_PUBLISHABLE_KEY')!,
  }
}

function charDiff(a: string, b: string) {
  const max = Math.max(a.length, b.length)
  const diffs: Array<{ i: number; a: string; b: string }> = []
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) {
      diffs.push({
        i,
        a: a[i] === undefined ? '∅' : JSON.stringify(a[i]),
        b: b[i] === undefined ? '∅' : JSON.stringify(b[i]),
      })
      if (diffs.length >= 40) break
    }
  }
  return diffs
}

async function main() {
  const versionId = 'b0cd5be9-4054-48fd-9bb4-438e1cc0b964'
  const { url, key } = loadEnv()
  const supabase = createClient(url, key)

  const { data: version, error } = await supabase
    .from('document_template_versions')
    .select('id, source_docx_path, slot_map')
    .eq('id', versionId)
    .single()
  if (error || !version) throw error ?? new Error('version missing')

  const slotMap = parseSlotMap(version.slot_map)
  const keys = ['reception_location', 'final_payment_due_date']
  const relevant = slotMap.slots.filter(
    (s) => s.registryKey && keys.includes(s.registryKey),
  )
  console.log('\n=== PERSISTED BINDINGS ===')
  for (const s of relevant) {
    console.log(JSON.stringify({
      bindingId: s.id,
      registryKey: s.registryKey,
      paragraphIndex: s.paragraphIndex,
      startOffset: s.startOffset,
      endOffset: s.endOffset,
      originalSpan: s.originalText,
      leftAnchor: s.leftAnchor,
      rightAnchor: s.rightAnchor,
      enabled: s.enabled,
      physicallyBound: s.physicallyBound,
      confidence: s.confidence,
      sampleContext: s.sampleContext,
      paragraphFingerprint: s.paragraphFingerprint,
      detectionStatus: s.detectionStatus,
    }, null, 2))
  }

  const path = version.source_docx_path as string
  const { data: blob, error: dlErr } = await supabase.storage
    .from('documents')
    .download(path)
  if (dlErr || !blob) {
    // try templates bucket names
    const buckets = ['documents', 'document-templates', 'templates']
    let bytes: ArrayBuffer | null = null
    for (const b of buckets) {
      const r = await supabase.storage.from(b).download(path)
      if (r.data) {
        bytes = await r.data.arrayBuffer()
        console.log('downloaded from bucket', b)
        break
      }
      console.log('bucket fail', b, r.error?.message)
    }
    if (!bytes) throw dlErr ?? new Error('download failed')
    await diagnose(bytes, relevant)
    return
  }
  await diagnose(await blob.arrayBuffer(), relevant)
}

async function diagnose(bytes: ArrayBuffer, relevant: TemplateSlot[]) {
  const paras = await extractDocxParagraphsIncludingEmpty(bytes)
  console.log('\n=== PARAGRAPH COUNT ===', paras.length)

  for (const key of ['reception_location', 'final_payment_due_date'] as const) {
    const bindings = relevant.filter((s) => s.registryKey === key)
    for (const slot of bindings) {
      const idx = slot.paragraphIndex ?? -1
      console.log(`\n=== RENDERER PARAGRAPHS around ${key} idx=${idx} ===`)
      for (const p of paras.filter(
        (x) => x.index >= idx - 1 && x.index <= idx + 1,
      )) {
        console.log({
          index: p.index,
          len: p.text.length,
          text: p.text,
          canonical: canonicalizeParagraphText(p.text),
        })
      }
      const para = paras.find((p) => p.index === idx)
      if (!para) {
        console.log('MISSING PARAGRAPH', idx)
        continue
      }
      const analysisHint = slot.sampleContext ?? slot.paragraphFingerprint ?? ''
      console.log('\n=== CHAR DIFF analysis-hint vs renderer para ===')
      console.log('analysis sample/fingerprint:', analysisHint)
      console.log('diff vs full para (first mismatches):', charDiff(analysisHint, para.text))
      const loc = locateSlotInParagraph(para.text, slot)
      console.log('\n=== LOCATE RESULT ===', {
        bindingId: slot.id,
        originalSpan: slot.originalText,
        offsets: [slot.startOffset, slot.endOffset],
        sliceAtOffsets:
          slot.startOffset != null && slot.endOffset != null
            ? canonicalizeParagraphText(para.text).slice(
                slot.startOffset,
                slot.endOffset,
              )
            : null,
        locate: loc,
        verbatimInRaw: para.text.includes(slot.originalText ?? ''),
        verbatimInCanonical: canonicalizeParagraphText(para.text).includes(
          canonicalizeParagraphText(slot.originalText ?? ''),
        ),
      })
    }
  }

  // Simulate sequential apply within para 31 and 11
  for (const paraIdx of [11, 31]) {
    const slots = relevant
      .filter((s) => s.paragraphIndex === paraIdx && s.enabled !== false)
      .sort(
        (a, b) =>
          (b.endOffset ?? 0) - (a.endOffset ?? 0) ||
          (b.startOffset ?? 0) - (a.startOffset ?? 0),
      )
    let text = paras.find((p) => p.index === paraIdx)?.text ?? ''
    console.log(`\n=== SEQUENTIAL APPLY ORDER para ${paraIdx} ===`)
    for (const slot of slots) {
      const before = text
      const loc = locateSlotInParagraph(text, slot)
      console.log({
        order: slot.id,
        registryKey: slot.registryKey,
        originalSpan: slot.originalText,
        locOk: Boolean(loc),
        loc,
      })
      if (loc) {
        text =
          text.slice(0, loc.start) +
          `[REPLACED:${slot.registryKey}]` +
          text.slice(loc.end)
      }
      if (!loc) {
        console.log('FAILED after prior mutations; before length', before.length)
      }
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
