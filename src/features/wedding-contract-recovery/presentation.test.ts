import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildRecoveryConfirmationGroups, buildRecoveryDecisionGroups, buildRecoveryReviewGroups, formatRecoveryValue, prepareRecoveryProposalForReview, recoveryLogicalSelectionCount } from './presentation'
import type { RecoveryFieldComparison, RecoveryProposal } from './types'

function field(
  fieldKey: string,
  state: RecoveryFieldComparison['state'],
  currentValue: string | number | null,
  extractedValue: string | number | null,
  selectedAction: RecoveryFieldComparison['selectedAction'] = state === 'missing_current' ? 'use_extracted' : state === 'different' ? 'keep_current' : 'skip',
): RecoveryFieldComparison {
  const sectionKey = fieldKey.startsWith('document.') ? 'source_document'
    : fieldKey.startsWith('partner') ? fieldKey.includes('email') || fieldKey.includes('phone') || fieldKey.includes('address') || fieldKey.includes('postal') || fieldKey.includes('.city') ? 'contact' : 'clients'
    : fieldKey.startsWith('wedding.') ? 'wedding' : fieldKey.startsWith('location.') ? 'locations' : fieldKey.startsWith('finances.') ? 'finances' : 'other'
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
const emptyEmail = field('partner2.email', 'same', null, null)
const emptyContractNumber = field('document.contractNumber', 'unsupported', null, null)
const sourceOnlySigningDate = field('document.signingDate', 'unsupported', null, '2026-09-22')
const emptyWeddingTime = field('wedding.ceremonyTime', 'same', null, null)

const fields = [identity, ...identityParts, email, phone, addressLine, postal, city, travel, deadline, emptyEmail, emptyContractNumber, sourceOnlySigningDate]
const originalFieldData = JSON.stringify(fields)
const decisions = buildRecoveryDecisionGroups(fields)
const reviewDecisions = buildRecoveryReviewGroups(fields)
const person = decisions.find((item) => item.id === 'partner1.fullName')!
assert.equal(person.label, 'Osoba 1')
assert.deepEqual(person.fields.map((item) => item.fieldKey), ['partner1.fullName'])
assert.equal(decisions.some((item) => item.id.includes('firstName') || item.id.includes('lastName')), false)
assert.ok(decisions.some((item) => item.id === 'partner1.email'))
assert.ok(decisions.some((item) => item.id === 'partner1.phone'))
assert.ok(decisions.some((item) => item.id === 'partner2.email'), 'empty values remain in the underlying decision model')
assert.equal(decisions.find((item) => item.id === 'finances.travelStatus')?.sectionKey, 'travel')
assert.equal(decisions.find((item) => item.id === 'delivery.dueDate')?.sectionKey, 'deadlines')
assert.equal(reviewDecisions.some((item) => item.id === 'partner2.email'), false, 'empty-to-empty contact values are hidden in review')
assert.equal(reviewDecisions.some((item) => item.id === 'document.contractNumber'), false, 'empty-to-empty source identifiers are hidden in review')
assert.equal(reviewDecisions.find((item) => item.id === 'document.signingDate')?.extractedValue, '2026-09-22', 'source-only read-only facts remain visible')
assert.deepEqual(reviewDecisions.find((item) => item.id === 'partner1.address')?.fields.map((item) => item.fieldKey), ['partner1.addressLine', 'partner1.postalCode', 'partner1.city'], 'address grouping remains intact')
assert.equal(reviewDecisions.find((item) => item.id === 'partner1.fullName')?.actionableFields.length, 1, 'identity authority remains intact')
assert.equal(JSON.stringify(fields), originalFieldData, 'presentation filtering does not alter persisted proposal values')
const reviewSections = new Set(reviewDecisions.map((item) => item.sectionKey))
assert.equal(reviewSections.has('source_document'), true, 'the source-only date keeps its section visible')
assert.equal(reviewSections.has('other'), false, 'empty review-only sections are not introduced')
assert.deepEqual(buildRecoveryReviewGroups([emptyWeddingTime]), [], 'a section containing only empty-to-empty rows disappears after presentation filtering')
assert.equal(new Set(buildRecoveryReviewGroups([emptyWeddingTime]).map((item) => item.sectionKey)).has('wedding'), false, 'empty-only sections do not leave a heading behind')

const address = decisions.find((item) => item.id === 'partner1.address')!
assert.deepEqual(address.actionableFields.map((item) => item.fieldKey), ['partner1.addressLine', 'partner1.postalCode'])
assert.equal(address.action, 'mixed', 'existing safe defaults remain represented as an explicit mixed decision')
assert.match(address.extractedValue, /Ulica: ul\. Leśna 4/)
assert.match(address.extractedValue, /Miejscowość: Warszawa/)

assert.equal(recoveryLogicalSelectionCount(fields, { ...proposal, noteProposals: [] }, false), 2, 'selected phone and address count as decisions, while unchanged fields do not count')
assert.equal(recoveryLogicalSelectionCount(fields, { ...proposal, noteProposals: [] }, false), recoveryLogicalSelectionCount(fields.filter((item) => item !== emptyEmail && item !== emptyContractNumber), { ...proposal, noteProposals: [] }, false), 'hidden empty values do not affect the Apply count')
assert.equal(formatRecoveryValue(field('finances.contractValue', 'different', 13250, 11100), 13250), '13 250 zł')
assert.equal(formatRecoveryValue(field('wedding.date', 'different', null, '2027-05-21'), '2027-05-21'), '21 maja 2027')

const confirmationFields = [
  field('partner1.fullName', 'different', 'Julia Zielińska', 'Iryna Malashchenko', 'use_extracted'),
  field('location.reception', 'different', 'Lwowska 78', 'Pałac Czosnowskich', 'use_extracted'),
  field('finances.contractValue', 'different', 13250, 22100, 'use_extracted'),
  field('wedding.ceremonyTime', 'different', null, '14:00', 'skip'),
  field('document.contractNumber', 'unsupported', null, null),
]
const confirmationGroups = buildRecoveryConfirmationGroups(confirmationFields)
assert.deepEqual(confirmationGroups.map((item) => item.id), ['partner1.fullName', 'location.reception', 'finances.contractValue'], 'confirmation contains selected applicable decisions only')
assert.equal(confirmationGroups.filter((item) => item.id === 'location.reception').length, 1, 'each selected scalar decision appears once')
const confirmationProposal = {
  ...proposal,
  extraProposals: [
    { name: 'Dodatkowa godzina', description: null, price: 900, currency: 'PLN', applicable: true, selected: true, sourceIndex: 0 },
    { name: 'Unselected extra', description: null, price: 200, currency: 'PLN', applicable: true, selected: false, sourceIndex: 1 },
  ],
  noteProposals: [
    { text: 'One selected fact', selected: true, sourceIndex: 0 },
    { text: 'Unselected fact', selected: false, sourceIndex: 1 },
  ],
  packageSnapshotProposal: {
    name: 'Photo + Video Standard', originalDescription: 'Zakres usług', includedItems: ['Film', 'Zdjęcia'],
    coverageHours: 12, coverageTimeRange: 'do 12 h', deliveryDeadlineText: '30 dni', basePrice: 22100,
    currency: 'PLN', selectedAction: 'use_extracted',
  },
} as unknown as RecoveryProposal
const canonicalCount = recoveryLogicalSelectionCount(confirmationFields, confirmationProposal, true)
assert.equal(canonicalCount, 6, 'confirmation count uses the canonical Apply decision calculation')
assert.equal(confirmationGroups.length + 1 + confirmationProposal.extraProposals.filter((item) => item.selected && item.applicable).length + confirmationProposal.noteProposals.filter((item) => item.selected).length, canonicalCount, 'visible rows plus package, extras, and selected notes match canonical count')

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
assert.match(page, /selectedExtraIndexes: proposal\?\.extraProposals\.flatMap/, 'Apply extra selection payload remains unchanged')
assert.match(page, /selectedNoteIndexes: proposal\?\.noteProposals\.flatMap/, 'Apply note selection payload remains unchanged')
assert.match(confirmation, /disabled=\{applying \|\| count === 0\}/, 'Apply remains disabled when there are zero selected changes')
assert.match(page, /onBack=\{\(\) => \{[\s\S]*setStep\('review'\)/, 'returning to Review preserves the current selection state')
assert.match(page, /selectProposed/, 'bulk selection remains available')
assert.match(page, /clearSelections/, 'deselect all remains available')
assert.match(page, /prepareRecoveryProposalForReview\(row\.comparisonProposal\)/, 'reopened review also keeps notes opt-in')
assert.match(page, /prepareRecoveryProposalForReview\(extractedProposal\)/, 'new analysis keeps notes opt-in')
assert.match(confirmation, /buildRecoveryConfirmationGroups\(fields\)/, 'confirmation uses the selected logical review groups')
assert.match(confirmation, /extraProposals\.filter\(\(item\) => item\.selected && item\.applicable\)/, 'confirmation excludes unselected and non-applicable extras')
assert.match(confirmation, /noteProposals\.filter\(\(item\) => item\.selected\)/, 'confirmation excludes unselected notes')
assert.match(confirmation, /group\.id === 'package\.name'/, 'package name is represented inside the selected compound package block')
assert.match(confirmation, /selectedExtras\.map/, 'selected extras render as compact confirmation rows')
assert.match(confirmation, /selectedNotes\.map/, 'selected notes alone render in the combined-note receipt')
assert.match(confirmation, /Zapisane razem jako jedna notatka/, 'notes are described according to Apply persistence semantics')
assert.match(confirmation, /variant="primary"/, 'Apply uses the established primary button style')
assert.match(confirmation, /Po zmianie/, 'confirmation explicitly labels the after value')
assert.match(confirmation, /data-side="current"[\s\S]*data-side="after"/, 'current and after values use consistent axes')
assert.doesNotMatch(confirmation, /Pokaż fragment|aria-expanded|Wybrano/, 'read-only confirmation has no evidence controls or selection labels')
assert.doesNotMatch(confirmation, /sourceFileName/, 'confirmation omits source metadata')
assert.match(confirmation, /Wróć do sprawdzenia/, 'confirmation returns to review')
assert.match(readFileSync('src/features/wedding-contract-recovery/components/PackageSnapshotCard.tsx', 'utf8'), /Pokaż oryginalny zapis z umowy/, 'package source details remain available in Review')
assert.match(readFileSync('src/features/wedding-contract-recovery/components/RecoveryFieldComparisonRow.tsx', 'utf8'), /aria-label=\{`Zastosuj zmianę:/, 'selection control has a user-facing accessible label')
assert.match(packageCard, /confirmationMode \? \(/, 'package confirmation has a read-only presentation')
assert.match(packageCard, /confirmationCurrentName/, 'package confirmation includes current-to-after context')
assert.match(confirmation, /sectionKey === 'package' && packageModel[\s\S]*PackageSnapshotCard confirmationMode/, 'selected package is represented by one rich confirmation block')
assert.match(confirmation, /group\.id === 'package\.name'/, 'package scalar comparison is suppressed when represented by the rich package block')
const confirmationPackageBranch = packageCard.slice(packageCard.indexOf('confirmationMode ? ('), packageCard.indexOf(': (\n        <>'))
assert.doesNotMatch(confirmationPackageBranch, /Pokaż szczegóły pakietu|Zapiszemy ten pakiet|sourceFileName/, 'package confirmation omits evidence controls and source metadata')
assert.match(comparisonStyles, /\.mainRow\s*\{[\s\S]*grid-template-columns:\s*minmax\(11rem, 14rem\) minmax\(0, 1fr\) 1\.25rem minmax\(0, 1fr\) minmax\(6\.25rem, 7\.25rem\) minmax\(7\.25rem, 7\.75rem\)/, 'desktop comparisons share six aligned column axes')
assert.match(comparisonStyles, /\.comparison\s*\{[^}]*display:\s*contents/, 'comparison values participate in the shared grid')
assert.match(comparisonStyles, /\.rowActions\s*\{[^}]*display:\s*contents/, 'evidence and selection participate in the shared grid')
assert.doesNotMatch(pageStyles, /\.fieldList\s*\{[^}]*repeat\(2/, 'review sections never use a two-decision desktop grid')
assert.match(comparisonCard, /aria-expanded=\{evidenceOpen\}[\s\S]*className=\{styles\.evidenceContent\}/, 'evidence toggles inline inside its owning decision row')
assert.match(comparisonCard, /selected \? 'Wybrano' : 'Zastosuj'/, 'selection labels stay concise without a second status block')
assert.match(pageStyles, /\.selectableFact\s*\{[\s\S]*min-height:\s*2\.75rem/, 'extras and notes use compact full-width rows')
assert.match(pageStyles, /\.fieldList\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*minmax\(0, 1fr\)/, 'review list remains one decision per row at every viewport')
assert.match(packageCard, /className=\{styles\.choice\}[\s\S]*Zapisz pakiet/, 'package selection stays in the rich block header')
assert.match(readFileSync('src/features/wedding-contract-recovery/components/PackageSnapshotCard.module.css', 'utf8'), /\.card\s*\{[\s\S]*background:\s*var\(--color-surface, #fff\)/, 'package card has a defined neutral surface')
assert.match(page, /buildRecoveryReviewGroups\(fields\)/, 'review uses a presentation-only group filter')
assert.match(pageStyles, /\.reviewFooter\s*\{[\s\S]*width:\s*min\(100%, 76rem\)/, 'sticky review footer shares the review content frame')
assert.doesNotMatch(comparisonCard, /Strona \{/, 'evidence does not display model-supplied page numbers')

console.log('Source Contract presentation acceptance passed')
