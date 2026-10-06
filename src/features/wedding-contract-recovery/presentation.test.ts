import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildRecoveryDecisionGroups, formatRecoveryValue, prepareRecoveryProposalForReview, recoveryLogicalSelectionCount } from './presentation'
import type { RecoveryFieldComparison, RecoveryProposal } from './types'

function field(
  fieldKey: string,
  state: RecoveryFieldComparison['state'],
  currentValue: string | number | null,
  extractedValue: string | number | null,
  selectedAction: RecoveryFieldComparison['selectedAction'] = state === 'missing_current' ? 'use_extracted' : state === 'different' ? 'keep_current' : 'skip',
): RecoveryFieldComparison {
  const sectionKey = fieldKey.startsWith('partner') ? fieldKey.includes('email') || fieldKey.includes('phone') || fieldKey.includes('address') || fieldKey.includes('postal') || fieldKey.includes('.city') ? 'contact' : 'clients'
    : fieldKey.startsWith('wedding.') ? 'wedding' : fieldKey.startsWith('finances.') ? 'finances' : 'other'
  return {
    fieldKey,
    sectionKey,
    label: fieldKey,
    currentValue,
    extractedValue,
    normalizedCurrentValue: currentValue,
    normalizedExtractedValue: extractedValue,
    state,
    confidence: null,
    evidence: [],
    warnings: [],
    selectedAction,
  }
}

const proposal = {
  extraProposals: [],
  noteProposals: [{ text: 'Operational note', selected: true, sourceIndex: 0 }],
  packageSnapshotProposal: null,
} as unknown as RecoveryProposal

assert.equal(prepareRecoveryProposalForReview(proposal).noteProposals[0]?.selected, false, 'operational notes require an explicit UI choice')

const identity = field('partner1.fullName', 'different', 'Julia Zielińska', 'Iryna Malashchenko')
const identityParts = [
  field('partner1.firstName', 'unsupported', 'Julia', 'Iryna'),
  field('partner1.lastName', 'unsupported', 'Zielińska', 'Malashchenko'),
]
const email = field('partner1.email', 'different', 'julia@example.test', 'iryna@example.test')
const phone = field('partner1.phone', 'missing_current', null, '+48123123123')
const addressLine = field('partner1.addressLine', 'missing_current', null, 'ul. Leśna 4')
const postal = field('partner1.postalCode', 'different', '00-001', '00-002')
const city = field('partner1.city', 'same', 'Warszawa', 'Warszawa')
const travel = field('finances.travelStatus', 'different', 'included', 'charged')
const deadline = field('delivery.dueDate', 'different', '2027-10-21', '2028-03-21')

const fields = [identity, ...identityParts, email, phone, addressLine, postal, city, travel, deadline]
const decisions = buildRecoveryDecisionGroups(fields)
const person = decisions.find((item) => item.id === 'partner1.fullName')!
assert.equal(person.label, 'Osoba 1')
assert.deepEqual(person.fields.map((item) => item.fieldKey), ['partner1.fullName'])
assert.equal(decisions.some((item) => item.id.includes('firstName') || item.id.includes('lastName')), false)
assert.ok(decisions.some((item) => item.id === 'partner1.email'))
assert.ok(decisions.some((item) => item.id === 'partner1.phone'))
assert.equal(decisions.find((item) => item.id === 'finances.travelStatus')?.sectionKey, 'travel')
assert.equal(decisions.find((item) => item.id === 'delivery.dueDate')?.sectionKey, 'deadlines')

const address = decisions.find((item) => item.id === 'partner1.address')!
assert.deepEqual(address.actionableFields.map((item) => item.fieldKey), ['partner1.addressLine', 'partner1.postalCode'])
assert.equal(address.action, 'mixed', 'existing safe defaults remain represented as an explicit mixed decision')
assert.match(address.extractedValue, /Ulica: ul\. Leśna 4/)
assert.match(address.extractedValue, /Miejscowość: Warszawa/)

assert.equal(recoveryLogicalSelectionCount(fields, { ...proposal, noteProposals: [] }, false), 2, 'selected phone and address count as decisions, while unchanged fields do not count')
assert.equal(formatRecoveryValue(field('finances.contractValue', 'different', 13250, 11100), 13250), '13 250 zł')
assert.equal(formatRecoveryValue(field('wedding.date', 'different', null, '2027-05-21'), '2027-05-21'), '21 maja 2027')

const page = readFileSync('src/pages/WeddingContractRecoveryPage.tsx', 'utf8')
const stepper = readFileSync('src/features/wedding-contract-recovery/components/WeddingContractRecoveryStepper.tsx', 'utf8')
const confirmation = readFileSync('src/features/wedding-contract-recovery/components/RecoveryConfirmationPanel.tsx', 'utf8')
const comparisonCard = readFileSync('src/features/wedding-contract-recovery/components/RecoveryFieldComparisonRow.tsx', 'utf8')
const comparisonStyles = readFileSync('src/features/wedding-contract-recovery/components/RecoveryFieldComparisonRow.module.css', 'utf8')
const pageStyles = readFileSync('src/pages/WeddingContractRecoveryPage.module.css', 'utf8')
const packageCard = readFileSync('src/features/wedding-contract-recovery/components/PackageSnapshotCard.tsx', 'utf8')
assert.match(page, /setStep\('review'\)/, 'analysis routes directly to review')
assert.doesNotMatch(page, /step === 'summary'|setStep\('summary'\)/, 'normal flow has no summary stop')
assert.match(stepper, /label: 'Wgraj umowę'[\s\S]*label: 'Analiza'[\s\S]*label: 'Sprawdź dane'[\s\S]*label: 'Potwierdzenie'/)
assert.match(confirmation, /recoveryLogicalSelectionCount/, 'confirmation uses the same logical count as review')
assert.match(page, /fieldKeys\.forEach/, 'one logical action updates only its mapped field keys')
assert.match(page, /decisions: fields\.map/, 'Apply receives the exact selected field decisions')
assert.match(page, /selectProposed/, 'bulk selection remains available')
assert.match(page, /clearSelections/, 'deselect all remains available')
assert.match(page, /prepareRecoveryProposalForReview\(row\.comparisonProposal\)/, 'reopened review also keeps notes opt-in')
assert.match(page, /prepareRecoveryProposalForReview\(extractedProposal\)/, 'new analysis keeps notes opt-in')
assert.match(confirmation, /selectedGroups = buildRecoveryDecisionGroups\(fields\)\.filter/, 'confirmation includes selected logical changes only')
assert.match(confirmation, /extraProposals\.filter\(\(item\) => item\.selected && item\.applicable\)/, 'confirmation excludes unselected and non-applicable extras')
assert.match(confirmation, /noteProposals\.filter\(\(item\) => item\.selected\)/, 'confirmation excludes unselected notes')
assert.match(confirmation, /Wróć do sprawdzenia/, 'confirmation returns to review')
assert.match(readFileSync('src/features/wedding-contract-recovery/components/PackageSnapshotCard.tsx', 'utf8'), /Pokaż szczegóły pakietu/, 'package details remain available by disclosure')
assert.match(readFileSync('src/features/wedding-contract-recovery/components/RecoveryFieldComparisonRow.tsx', 'utf8'), /aria-label=\{`Zastosuj zmianę:/, 'selection control has a user-facing accessible label')
assert.match(packageCard, /Pozycje pakietu:/, 'confirmation avoids extraction-oriented wording')
assert.match(comparisonStyles, /\.mainRow\s*\{[\s\S]*grid-template-columns:\s*minmax\(8\.5rem, \.8fr\)/, 'logical comparisons use a single full-width row grid')
assert.doesNotMatch(pageStyles, /\.fieldList\s*\{[^}]*repeat\(2/, 'review sections never use a two-decision desktop grid')
assert.match(comparisonCard, /aria-expanded=\{evidenceOpen\}[\s\S]*className=\{styles\.evidenceContent\}/, 'evidence toggles inline inside its owning decision row')
assert.match(comparisonCard, /selected \? 'Wybrano' : 'Zastosuj'/, 'selection labels stay concise without a second status block')
assert.match(pageStyles, /\.selectableFact\s*\{[\s\S]*min-height:\s*2\.75rem/, 'extras and notes use compact full-width rows')
assert.match(pageStyles, /\.fieldList\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*minmax\(0, 1fr\)/, 'review list remains one decision per row at every viewport')
assert.match(packageCard, /className=\{styles\.choice\}[\s\S]*Zapisz pakiet/, 'package selection stays in the rich block header')
assert.doesNotMatch(comparisonCard, /Strona \{/, 'evidence does not display model-supplied page numbers')

console.log('Source Contract presentation acceptance passed')
