import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { ACCEPTANCE_PROVIDER_BUDGET, runMultiTemplateAcceptance, type AcceptanceProvider } from './harness'
import { GENERIC_CONTRACT_PRODUCT_RULES } from '../generator'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ourwed-option-b-harness-'))
try {
  const caseDir = path.join(temp, 'cases', 'case-offline')
  await mkdir(caseDir, { recursive: true })
  const source = new JSZip()
  const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
  source.file('[Content_Types].xml', '<Types/>')
  source.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph('Source contract clause.')}${paragraph('Unrelated provision.') }<w:sectPr/></w:body></w:document>`)
  await writeFile(path.join(caseDir, 'source.docx'), Buffer.from(await source.generateAsync({ type: 'uint8array' })))
  await writeFile(path.join(caseDir, 'input.json'), JSON.stringify({
    id: 'case-offline', sourceDocx: 'source.docx', generationDate: '25.09.2026',
    weddingFacts: { bride: { name: 'Ada', phone: '', email: '' }, groom: { name: 'Bar', phone: '' }, weddingDate: '20.09.2027', contractAddress: '', contractValuePln: 10000, depositPln: 1000 },
    expectedProductRules: { preserveSourcePackageExactly: true },
  }))

  const prepared = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out') })
  assert.equal(prepared.overall, 'READY')
  assert.ok(prepared.normalizedInput)
  assert.equal(prepared.normalizedInput.wedding.date.value, '20.09.2027')
  assert.equal(prepared.normalizedInput.parties[0]?.fullName?.value, 'Ada')
  assert.deepEqual(prepared.providerCalls, { generator: 0, reviewer: 0, total: 0 })
  assert.deepEqual(ACCEPTANCE_PROVIDER_BUDGET, { generator: 1, reviewer: 1, total: 2 })
  assert.equal(prepared.candidatePath, null)
  assert.equal(prepared.reviewResult, 'NOT_RUN')

  let generationCalls = 0
  let capturedInstructions = ''
  let capturedSourceBlocks: unknown[] = []
  let capturedRules: readonly string[] = []
  const missingProvider: AcceptanceProvider = {
    async generate({ instructions, sourceBlocks, authorityContext, productRules }) {
      generationCalls++
      capturedInstructions = instructions
      capturedSourceBlocks = sourceBlocks
      capturedRules = productRules
      assert.equal(authorityContext.wedding.date.value, '20.09.2027')
      return { status: 'MISSING_INPUT', missingInputs: ['What is the required client PESEL?'] }
    },
    async review() { throw new Error('Reviewer must not run for MISSING_INPUT') },
  }
  const missing = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'missing', provider: missingProvider })
  assert.equal(missing.overall, 'MISSING_INPUT')
  assert.deepEqual(missing.missingInputs, ['What is the required client PESEL?'])
  assert.equal(missing.candidatePath, null)
  assert.deepEqual(missing.providerCalls, { generator: 1, reviewer: 0, total: 1 })
  assert.equal(generationCalls, 1)
  assert.match(capturedInstructions, /source defines the contract's clauses/i)
  assert.deepEqual(capturedRules, GENERIC_CONTRACT_PRODUCT_RULES)
  assert.ok(capturedSourceBlocks.length > 0)
  for (const value of capturedSourceBlocks) {
    const block = value as Record<string, unknown>
    assert.equal(typeof block.blockId, 'string')
    assert.equal(typeof block.text, 'string')
    assert.equal('part' in block, false)
    assert.equal('index' in block, false)
    assert.equal('context' in block, false)
    assert.doesNotMatch(block.blockId as string, /word\/|#p\d+/)
  }
  const savedInput = JSON.parse(await readFile(missing.generationInputPath!, 'utf8'))
  assert.deepEqual(savedInput.authorityContext, missing.normalizedInput)
  assert.deepEqual(savedInput.productRules, GENERIC_CONTRACT_PRODUCT_RULES)
  assert.equal((await readFile(path.join(temp, 'out', 'case-offline', 'missing', 'result.json'), 'utf8')).includes('sourceInventory'), false)

  let conflictCalls = 0
  const conflictProvider: AcceptanceProvider = {
    async generate() { conflictCalls++; return { status: 'CONFLICT_INPUT', conflicts: ['Two authoritative dates disagree.'] } },
    async review() { throw new Error('Reviewer must not run for CONFLICT_INPUT') },
  }
  const conflict = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'conflict', provider: conflictProvider })
  assert.equal(conflict.overall, 'CONFLICT_INPUT')
  assert.deepEqual(conflict.conflictFindings, ['Two authoritative dates disagree.'])
  assert.equal(conflict.candidatePath, null)
  assert.equal(conflictCalls, 1)
  assert.deepEqual(conflict.providerCalls, { generator: 1, reviewer: 0, total: 1 })

  const unsafeTargetProvider: AcceptanceProvider = {
    async generate() { return { status: 'READY', edits: [{ kind: 'replace', blockId: 'unknown-handle', text: 'Unsafe edit.' }] } },
    async review() { throw new Error('Reviewer must not run after a mechanical failure') },
  }
  const unsafeTarget = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'unsafe-target', provider: unsafeTargetProvider })
  assert.equal(unsafeTarget.overall, 'FAIL')
  assert.equal(unsafeTarget.candidatePath, null)
  assert.equal(unsafeTarget.providerCalls.total, 1)
  assert.ok(unsafeTarget.deterministicFindings.some((finding) => /Unknown generation block ID/.test(finding)))

  const makeReadyProvider = (reviewStatus: 'PASS' | 'FAIL', captured?: { reviewArgs?: Parameters<AcceptanceProvider['review']>[0]; calls: string[] }): AcceptanceProvider => ({
    async generate({ sourceBlocks }) {
      captured?.calls.push('generator')
      assert.ok(sourceBlocks.some((block) => block.text.trim()))
      return { status: 'READY', edits: [] }
    },
    async review(args) {
      captured?.calls.push('reviewer')
      if (captured) captured.reviewArgs = args
      return reviewStatus === 'PASS' ? { status: 'PASS' } : { status: 'FAIL', findings: ['A material obligation changed.'] }
    },
  })

  const passCapture: { reviewArgs?: Parameters<AcceptanceProvider['review']>[0]; calls: string[] } = { calls: [] }
  const readyPass = await runMultiTemplateAcceptance('case-offline', {
    casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'ready-pass', provider: makeReadyProvider('PASS', passCapture),
    render: async () => ({ pdfPath: path.join(temp, 'candidate.pdf'), pageCount: 1 }),
  })
  assert.equal(readyPass.overall, 'PASS', JSON.stringify(readyPass))
  assert.equal(readyPass.candidateAccepted, true)
  assert.equal(readyPass.acceptedCandidatePath, readyPass.candidatePath)
  assert.deepEqual(readyPass.providerCalls, { generator: 1, reviewer: 1, total: 2 })
  assert.deepEqual(passCapture.calls, ['generator', 'reviewer'])
  assert.ok(passCapture.reviewArgs)
  assert.ok(passCapture.reviewArgs.source.length > 0)
  assert.equal(passCapture.reviewArgs.authorityContext.wedding.date.value, '20.09.2027')
  assert.deepEqual(passCapture.reviewArgs.productRules, GENERIC_CONTRACT_PRODUCT_RULES)
  assert.ok(passCapture.reviewArgs.candidate.length > 0)
  assert.deepEqual(passCapture.reviewArgs.mechanicalDiff, [])
  for (const key of ['inventory', 'factChanges', 'occurrences', 'atomicPatches', 'reasoning']) {
    assert.equal(key in passCapture.reviewArgs, false)
  }

  const failCapture: { reviewArgs?: Parameters<AcceptanceProvider['review']>[0]; calls: string[] } = { calls: [] }
  const readyFail = await runMultiTemplateAcceptance('case-offline', {
    casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'ready-fail', provider: makeReadyProvider('FAIL', failCapture),
  })
  assert.equal(readyFail.overall, 'FAIL')
  assert.equal(readyFail.candidateAccepted, false)
  assert.equal(readyFail.acceptedCandidatePath, null)
  assert.deepEqual(readyFail.reviewFindings, ['A material obligation changed.'])
  assert.deepEqual(readyFail.providerCalls, { generator: 1, reviewer: 1, total: 2 })
  assert.deepEqual(failCapture.calls, ['generator', 'reviewer'])
} finally { await rm(temp, { recursive: true, force: true }) }
console.log('PASS mocked Option B generation harness boundary')
