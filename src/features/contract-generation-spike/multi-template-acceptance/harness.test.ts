import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { ACCEPTANCE_PROVIDER_BUDGET, runMultiTemplateAcceptance, type AcceptanceProvider } from './harness'
import { GENERATION_INSTRUCTIONS, GENERIC_CONTRACT_PRODUCT_RULES } from '../generator'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ourwed-option-b-harness-'))
try {
  const caseDir = path.join(temp, 'cases', 'case-offline')
  await mkdir(caseDir, { recursive: true })
  const source = new JSZip()
  const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
  source.file('[Content_Types].xml', '<Types/>')
  source.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph('Source contract clause.')}${paragraph('The source requires facts A and B.')}${paragraph('Unrelated provision.') }<w:sectPr/></w:body></w:document>`)
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
      return { status: 'MISSING_INPUT', missingInputs: [
        { id: 'requirement-a', label: 'Required fact A', answerKind: 'text' },
        { id: 'requirement-b', label: 'Required fact B', answerKind: 'date' },
      ] }
    },
    async review() { throw new Error('Candidate reviewer must not run for MISSING_INPUT') },
    async reviewConflict() { throw new Error('Conflict verifier must not run for MISSING_INPUT') },
  }
  const missing = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'missing', provider: missingProvider })
  assert.equal(missing.overall, 'MISSING_INPUT')
  assert.deepEqual(missing.missingInputs.map((item) => item.label), ['Required fact A', 'Required fact B'])
  assert.equal(missing.candidatePath, null)
  assert.deepEqual(missing.providerCalls, { generator: 1, reviewer: 0, total: 1 })
  assert.equal(missing.reviewResult, 'NOT_RUN')
  assert.equal(missing.reviewResultPath, null)
  assert.equal(missing.semanticReviewRequestPath, null)
  assert.equal(generationCalls, 1)
  assert.match(capturedInstructions, /source defines the contract's clauses/i)
  assert.match(capturedInstructions, /not guaranteed exhaustive/i)
  assert.match(capturedInstructions, /fresh full-context run must re-evaluate/i)
  assert.match(GENERATION_INSTRUCTIONS, /inspect the complete source contract for every currently discoverable source-required fact/i)
  assert.match(GENERATION_INSTRUCTIONS, /return all such gaps together; do not stop at the first/i)
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
    async review() { throw new Error('Candidate reviewer must not run for CONFLICT_INPUT') },
    async reviewConflict({ generationOutcome, instructions }) {
      assert.equal(generationOutcome.status, 'CONFLICT_INPUT')
      assert.match(instructions, /Verify only the conflict or conflicts explicitly claimed/i)
      assert.match(instructions, /stale source transaction-specific value/i)
      assert.match(instructions, /Do not search for additional or unrelated conflicts/i)
      assert.match(instructions, /omitted missing inputs/i)
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
    async generate() { return { status: 'READY', edits: [{ kind: 'replace', blockId: 'unknown-handle', text: 'Unsafe edit.', supersedesSourceBlockId: null, supersededSourceText: null }] } },
    async review() { throw new Error('Reviewer must not run after a mechanical failure') },
    async reviewConflict() { throw new Error('Conflict verifier must not run after a mechanical failure') },
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
    async reviewConflict() { throw new Error('Conflict verifier must not run for READY') },
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

  const runConflict = async (
    conflicts: string[],
    review: { status: 'PASS' } | { status: 'FAIL'; findings: string[] },
    runId: string,
  ) => {
    const calls: string[] = []
    const provider: AcceptanceProvider = {
      async generate() { calls.push('generator'); return { status: 'CONFLICT_INPUT', conflicts } },
      async review() { throw new Error('Candidate review is not part of CONFLICT_INPUT flow') },
      async reviewConflict(args) {
        calls.push('conflict-reviewer')
        assert.deepEqual(Object.keys(args).sort(), ['authorityContext', 'generationOutcome', 'instructions', 'productRules', 'source'])
        assert.deepEqual(args.generationOutcome, { status: 'CONFLICT_INPUT', conflicts })
        assert.equal(args.authorityContext.participantAssociations[0]?.association.value, 'bride')
        assert.equal(args.authorityContext.additionalAnswers[0]?.value, 'already supplied')
        assert.deepEqual(args.productRules, GENERIC_CONTRACT_PRODUCT_RULES)
        assert.match(args.instructions, /Verify only the conflict or conflicts explicitly claimed/i)
        assert.match(args.instructions, /established authority precedence already resolves the difference/i)
        assert.match(args.instructions, /stale source transaction-specific value/i)
        assert.match(args.instructions, /actually missing rather than conflicting/i)
        assert.match(args.instructions, /Do not search for additional or unrelated conflicts/i)
        assert.match(args.instructions, /Do not re-plan the contract/i)
        assert.match(args.instructions, /Do not .*omitted missing inputs/i)
        assert.match(args.instructions, /Do not .*propose BlockEdits/i)
        assert.match(args.instructions, /Do not .*generate a candidate/i)
        assert.match(args.instructions, /Do not .*rewrite the conflict list/i)
        return review
      },
    }
    const result = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId, provider })
    assert.deepEqual(calls, ['generator', 'conflict-reviewer'], 'one Generator and one conflict Reviewer call; no retry')
    assert.deepEqual(result.providerCalls, { generator: 1, reviewer: 1, total: 2 })
    assert.equal(result.candidatePath, null)
    assert.equal(result.blockOperationCounts.generation, 0)
    return result
  }

  const conflictPass = await runConflict(
    ['Two authoritative dates disagree and require user resolution.'],
    { status: 'PASS' }, 'conflict-pass',
  )
  assert.equal(conflictPass.overall, 'CONFLICT_INPUT')
  assert.equal(conflictPass.generationStatus, 'CONFLICT_INPUT')
  assert.equal(conflictPass.reviewResult, 'PASS')
  assert.deepEqual(conflictPass.conflictFindings, ['Two authoritative dates disagree and require user resolution.'])

  const staleTransactionConflict = await runConflict(
    ['The source has an old customer name and event date that differ from current authority.'],
    { status: 'FAIL', findings: ['The old source transaction values are stale and must be replaced by current authority; they are not conflicts.'] }, 'conflict-stale-transaction',
  )
  assert.equal(staleTransactionConflict.overall, 'FAIL')
  assert.equal(staleTransactionConflict.generationStatus, 'FAILED')
  assert.deepEqual(staleTransactionConflict.reviewFindings, ['The old source transaction values are stale and must be replaced by current authority; they are not conflicts.'])

  const missingAuthorityConflict = await runConflict(
    ['The customer PESEL conflicts with authority.'],
    { status: 'FAIL', findings: ['No authoritative PESEL is present; this is missing input, not a conflict.'] }, 'conflict-missing-authority',
  )
  assert.equal(missingAuthorityConflict.overall, 'FAIL')
  assert.equal(missingAuthorityConflict.generationStatus, 'FAILED')
  assert.deepEqual(missingAuthorityConflict.reviewFindings, ['No authoritative PESEL is present; this is missing input, not a conflict.'])

  // Safety fallback: a later full-context run may still discover a gap omitted from an earlier batch.
  const continuationAnswers = [{ id: 'test.authoritative.fact', value: 'already supplied' }]
  const continuationInputPath = path.join(caseDir, 'input.json')
  const writeContinuationAnswers = async (answers: typeof continuationAnswers) => {
    const current = JSON.parse(await readFile(continuationInputPath, 'utf8'))
    current.userProvidedAnswers = answers
    await writeFile(continuationInputPath, JSON.stringify(current))
  }
  const continuationCalls: string[] = []
  const continuationRequests: Array<Parameters<AcceptanceProvider['generate']>[0]> = []
  const continuationProvider: AcceptanceProvider = {
    async generate(args) {
      continuationCalls.push(`generator-${continuationRequests.length + 1}`)
      continuationRequests.push(args)
      assert.deepEqual(Object.keys(args).sort(), ['authorityContext', 'instructions', 'productRules', 'sourceBlocks'])
      assert.ok(args.sourceBlocks.some((block) => block.text === 'The source requires facts A and B.'))
      assert.equal(args.sourceBlocks.length, 3, 'each continuation receives every source block')
      assert.deepEqual(args.productRules, GENERIC_CONTRACT_PRODUCT_RULES)
      assert.equal(args.authorityContext.participantAssociations.length, 2)
      assert.ok(args.authorityContext.wedding.date.source)
      const round = continuationRequests.length
      if (round === 1) return { status: 'MISSING_INPUT', missingInputs: [{ id: 'answer.A', label: 'Fact A', answerKind: 'text' }] }
      if (round === 2) return { status: 'MISSING_INPUT', missingInputs: [{ id: 'answer.B', label: 'Fact B', answerKind: 'text' }] }
      return { status: 'READY', edits: [] }
    },
    async review(args) {
      continuationCalls.push('candidate-reviewer')
      assert.ok(args.source.some((block) => block.text === 'The source requires facts A and B.'))
      assert.ok(args.authorityContext.additionalAnswers.some((answer) => answer.id === 'answer.A' && answer.value === 'A supplied'))
      assert.ok(args.authorityContext.additionalAnswers.some((answer) => answer.id === 'answer.B' && answer.value === 'B supplied'))
      return { status: 'PASS' }
    },
    async reviewConflict() { throw new Error('Conflict verifier must not run during missing-input continuation') },
  }

  const continuationRun1 = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'continuation-1', provider: continuationProvider })
  assert.equal(continuationRun1.overall, 'MISSING_INPUT')
  assert.deepEqual(continuationRun1.missingInputs.map((item) => item.label), ['Fact A'])
  assert.deepEqual(continuationRun1.providerCalls, { generator: 1, reviewer: 0, total: 1 })
  assert.equal(continuationRun1.reviewResult, 'NOT_RUN')

  continuationAnswers.push({ id: 'answer.A', value: 'A supplied' })
  await writeContinuationAnswers(continuationAnswers)
  const continuationRun2 = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'continuation-2', provider: continuationProvider })
  assert.equal(continuationRun2.overall, 'MISSING_INPUT', 'a later MISSING_INPUT round is valid')
  assert.deepEqual(continuationRun2.missingInputs.map((item) => item.label), ['Fact B'])
  assert.deepEqual(continuationRun2.providerCalls, { generator: 1, reviewer: 0, total: 1 })
  assert.deepEqual(continuationRequests[1]!.authorityContext.additionalAnswers.map((answer) => [answer.id, answer.value]), [
    ['test.authoritative.fact', 'already supplied'], ['answer.A', 'A supplied'],
  ])

  continuationAnswers.push({ id: 'answer.B', value: 'B supplied' })
  await writeContinuationAnswers(continuationAnswers)
  const continuationRun3 = await runMultiTemplateAcceptance('case-offline', {
    casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'continuation-3', provider: continuationProvider,
    render: async () => ({ pdfPath: path.join(temp, 'continuation-candidate.pdf'), pageCount: 1 }),
  })
  assert.equal(continuationRun3.overall, 'PASS')
  assert.deepEqual(continuationRun3.providerCalls, { generator: 1, reviewer: 1, total: 2 })
  assert.deepEqual(continuationRequests[2]!.authorityContext.additionalAnswers.map((answer) => [answer.id, answer.value]), [
    ['test.authoritative.fact', 'already supplied'], ['answer.A', 'A supplied'], ['answer.B', 'B supplied'],
  ])
  assert.deepEqual(continuationCalls, ['generator-1', 'generator-2', 'generator-3', 'candidate-reviewer'])
} finally { await rm(temp, { recursive: true, force: true }) }
console.log('PASS mocked Option B generation harness boundary')
