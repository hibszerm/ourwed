import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCEPTANCE_PROVIDER_BUDGET, runMultiTemplateAcceptance, type AcceptanceProvider } from './harness'
import { GENERIC_CONTRACT_PRODUCT_RULES } from '../generator'

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url))
const sourceFixture = path.join(repoRoot, 'src/features/contract-generation-spike/fixtures/source-video-standard.docx')
const temp = await mkdtemp(path.join(os.tmpdir(), 'ourwed-option-b-harness-'))
try {
  const caseDir = path.join(temp, 'cases', 'case-offline')
  await mkdir(caseDir, { recursive: true })
  await writeFile(path.join(caseDir, 'source.docx'), await readFile(sourceFixture))
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
  assert.deepEqual(prepared.providerCalls, { inventory: 0, transformation: 0, review: 0, total: 0, retries: 0, repair: 0 })
  assert.deepEqual(ACCEPTANCE_PROVIDER_BUDGET, { inventory: 0, transformation: 1, review: 0, total: 1, retries: 0, repair: 0 })
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
  }
  const missing = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'missing', provider: missingProvider })
  assert.equal(missing.overall, 'MISSING_INPUT')
  assert.deepEqual(missing.missingInputs, ['What is the required client PESEL?'])
  assert.equal(missing.candidatePath, null)
  assert.deepEqual(missing.providerCalls, { inventory: 0, transformation: 1, review: 0, total: 1, retries: 0, repair: 0 })
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
  }
  const conflict = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'conflict', provider: conflictProvider })
  assert.equal(conflict.overall, 'CONFLICT_INPUT')
  assert.deepEqual(conflict.conflictFindings, ['Two authoritative dates disagree.'])
  assert.equal(conflict.candidatePath, null)
  assert.equal(conflictCalls, 1)
  assert.deepEqual(conflict.providerCalls, { inventory: 0, transformation: 1, review: 0, total: 1, retries: 0, repair: 0 })

  const unsafeTargetProvider: AcceptanceProvider = {
    async generate() { return { status: 'READY', edits: [{ kind: 'replace', blockId: 'unknown-handle', text: 'Unsafe edit.' }] } },
  }
  const unsafeTarget = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'unsafe-target', provider: unsafeTargetProvider })
  assert.equal(unsafeTarget.overall, 'FAIL')
  assert.equal(unsafeTarget.candidatePath, null)
  assert.equal(unsafeTarget.providerCalls.total, 1)
  assert.ok(unsafeTarget.deterministicFindings.some((finding) => /Unknown generation block ID/.test(finding)))
} finally { await rm(temp, { recursive: true, force: true }) }
console.log('PASS mocked Option B generation harness boundary')
