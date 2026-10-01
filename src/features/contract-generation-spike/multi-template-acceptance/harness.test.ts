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
    userProvidedAnswers: [{ id: 'test.authoritative.fact', value: 'already supplied' }],
    expectedProductRules: { preserveSourcePackageExactly: true },
  }))

  const prepared = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out') })
  assert.equal(prepared.overall, 'READY')
  assert.ok(prepared.normalizedInput)
  assert.equal(prepared.normalizedInput.wedding.date.value, '20.09.2027')
  assert.equal(prepared.normalizedInput.parties[0]?.fullName?.value, 'Ada')
  assert.deepEqual(prepared.normalizedInput.participantAssociations, [
    { participant: 'partner1', association: { value: 'bride', source: 'case input weddingFacts.bride' } },
    { participant: 'partner2', association: { value: 'groom', source: 'case input weddingFacts.groom' } },
  ])
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
    async review() { throw new Error('Candidate reviewer must not run for MISSING_INPUT') },
    async reviewNonReady({ generationOutcome, instructions, authorityContext, source }) {
      assert.equal(generationOutcome.status, 'MISSING_INPUT')
      assert.match(instructions, /every requested fact is required/i)
      assert.equal(authorityContext.wedding.date.value, '20.09.2027')
      assert.ok(source.some((block) => block.text === 'Source contract clause.'))
      return { status: 'PASS' }
    },
  }
  const missing = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'missing', provider: missingProvider })
  assert.equal(missing.overall, 'MISSING_INPUT')
  assert.deepEqual(missing.missingInputs, ['What is the required client PESEL?'])
  assert.equal(missing.candidatePath, null)
  assert.deepEqual(missing.providerCalls, { generator: 1, reviewer: 1, total: 2 })
  assert.equal(missing.reviewResult, 'PASS')
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
  const missingReviewRequest = JSON.parse(await readFile(missing.semanticReviewRequestPath!, 'utf8'))
  assert.deepEqual(missingReviewRequest.generationOutcome, { status: 'MISSING_INPUT', missingInputs: ['What is the required client PESEL?'] })
  assert.equal('candidate' in missingReviewRequest, false)
  assert.equal((await readFile(path.join(temp, 'out', 'case-offline', 'missing', 'result.json'), 'utf8')).includes('sourceInventory'), false)

  let conflictCalls = 0
  const conflictProvider: AcceptanceProvider = {
    async generate() { conflictCalls++; return { status: 'CONFLICT_INPUT', conflicts: ['Two authoritative dates disagree.'] } },
    async review() { throw new Error('Candidate reviewer must not run for CONFLICT_INPUT') },
    async reviewNonReady({ generationOutcome }) {
      assert.equal(generationOutcome.status, 'CONFLICT_INPUT')
      return { status: 'PASS' }
    },
  }
  const conflict = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'conflict', provider: conflictProvider })
  assert.equal(conflict.overall, 'CONFLICT_INPUT')
  assert.deepEqual(conflict.conflictFindings, ['Two authoritative dates disagree.'])
  assert.equal(conflict.candidatePath, null)
  assert.equal(conflictCalls, 1)
  assert.deepEqual(conflict.providerCalls, { generator: 1, reviewer: 1, total: 2 })
  assert.equal(conflict.reviewResult, 'PASS')

  const unsafeTargetProvider: AcceptanceProvider = {
    async generate() { return { status: 'READY', edits: [{ kind: 'replace', blockId: 'unknown-handle', text: 'Unsafe edit.' }] } },
    async review() { throw new Error('Reviewer must not run after a mechanical failure') },
    async reviewNonReady() { throw new Error('Semantic reviewer must not run after a mechanical failure') },
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
    async reviewNonReady() { throw new Error('Semantic reviewer must not run for READY') },
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

  const runNonReady = async (
    generation: { status: 'MISSING_INPUT'; missingInputs: string[] } | { status: 'CONFLICT_INPUT'; conflicts: string[] },
    review: { status: 'PASS' } | { status: 'FAIL'; findings: string[] },
    runId: string,
  ) => {
    const calls: string[] = []
    const provider: AcceptanceProvider = {
      async generate() { calls.push('generator'); return generation },
      async review() { throw new Error('Candidate review is not part of non-READY flow') },
      async reviewNonReady({ instructions, generationOutcome, authorityContext, productRules }) {
        calls.push('reviewer')
        assert.match(instructions, /participant associations/i)
        assert.match(instructions, /omitted/i)
        assert.equal(generationOutcome.status, generation.status)
        assert.equal(authorityContext.participantAssociations[0]?.association.value, 'bride')
        assert.equal(authorityContext.additionalAnswers[0]?.value, 'already supplied')
        assert.deepEqual(productRules, GENERIC_CONTRACT_PRODUCT_RULES)
        return review
      },
    }
    const result = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId, provider })
    assert.deepEqual(calls, ['generator', 'reviewer'], 'one Generator and one Reviewer call; no retry')
    assert.deepEqual(result.providerCalls, { generator: 1, reviewer: 1, total: 2 })
    assert.equal(result.candidatePath, null)
    assert.equal(result.blockOperationCounts.generation, 0)
    return result
  }

  const missingPass = await runNonReady(
    { status: 'MISSING_INPUT', missingInputs: ['A source-required fact absent from authority.'] },
    { status: 'PASS' }, 'missing-pass',
  )
  assert.equal(missingPass.overall, 'MISSING_INPUT')
  assert.equal(missingPass.generationStatus, 'MISSING_INPUT')
  assert.equal(missingPass.reviewResult, 'PASS')

  const unnecessaryQuestion = await runNonReady(
    { status: 'MISSING_INPUT', missingInputs: ['A fact already present in authoritative input.'] },
    { status: 'FAIL', findings: ['The requested fact is already established by authority.'] }, 'missing-unnecessary',
  )
  assert.equal(unnecessaryQuestion.overall, 'FAIL')
  assert.equal(unnecessaryQuestion.generationStatus, 'FAILED')
  assert.deepEqual(unnecessaryQuestion.missingInputs, ['A fact already present in authoritative input.'])
  assert.deepEqual(unnecessaryQuestion.reviewFindings, ['The requested fact is already established by authority.'])

  const omittedRequirement = await runNonReady(
    { status: 'MISSING_INPUT', missingInputs: ['One required fact.'] },
    { status: 'FAIL', findings: ['Another source-required fact is absent from authority and was omitted.'] }, 'missing-omitted',
  )
  assert.equal(omittedRequirement.overall, 'FAIL')
  assert.equal(omittedRequirement.generationStatus, 'FAILED')

  const conflictPass = await runNonReady(
    { status: 'CONFLICT_INPUT', conflicts: ['Two authoritative values cannot both apply.'] },
    { status: 'PASS' }, 'conflict-pass',
  )
  assert.equal(conflictPass.overall, 'CONFLICT_INPUT')
  assert.equal(conflictPass.generationStatus, 'CONFLICT_INPUT')
  assert.equal(conflictPass.reviewResult, 'PASS')

  const falseConflict = await runNonReady(
    { status: 'CONFLICT_INPUT', conflicts: ['Current fact differs from a compatible conditional source term.'] },
    { status: 'FAIL', findings: ['The facts can coexist under the source condition; this is not a conflict.'] }, 'conflict-false',
  )
  assert.equal(falseConflict.overall, 'FAIL')
  assert.equal(falseConflict.generationStatus, 'FAILED')
  assert.deepEqual(falseConflict.reviewFindings, ['The facts can coexist under the source condition; this is not a conflict.'])
} finally { await rm(temp, { recursive: true, force: true }) }
console.log('PASS mocked Option B generation harness boundary')
