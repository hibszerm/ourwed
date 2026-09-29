import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const source = await readFile(fileURLToPath(new URL('./generator.ts', import.meta.url)), 'utf8')
for (const helper of ['isReservationPayment','postReservationPaymentObligations','paymentTimingSignature','formalClientIdentity','identityAttributeGroups','authoritativeValueForParty','sourcePackageDefinitionBlocks','sourceDocumentIdentifierValues','conclusionDateInText','conclusionPlaceInText','sourceContainsPartyPhone','customerPartyNames']) assert.ok(!source.includes(helper), `${helper} is removed from shared runtime`)
assert.doesNotMatch(source, /(?:zaliczk|zadatk|rezerwacyj|partyRoleLabel|documentReferenceLabel|scopeHeading)/iu)
console.log('PASS shared generator contains no prose semantic classifiers')
