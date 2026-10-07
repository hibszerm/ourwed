import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyContractRecoveryExtraction } from './schema/extractionSchema'
import { normalizeContractRecoveryExtraction } from './normalizeExtraction'

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

const applyMigration = read('supabase/migrations/20261007160000_source_contract_apply_package_name.sql')
const analysisPrompt = read('supabase/functions/wedding-contract-recovery-analyze/prompt.ts')
const overview = read('src/features/weddings/modern-detail/ModernWeddingOverview.tsx')
const recoveryPage = read('src/pages/WeddingContractRecoveryPage.tsx')
const invalidation = read('src/features/weddings/hooks/useInvalidateWedding.ts')
const weddingMapper = read('src/lib/api/weddings/weddingMappers.ts')
const detailHost = read('src/features/weddings/detail/useWeddingDetailHost.ts')
const finance = read('src/features/weddings/modern-detail/ModernWeddingContractFinanceWorkspace.tsx')

assert.match(applyMigration, /when 'partner1\.fullName' then v_patch := v_patch \|\| jsonb_build_object\('bride_name', v_value\)/)
assert.match(applyMigration, /when 'partner1\.addressLine' then v_patch := v_patch \|\| jsonb_build_object\('contract_address', v_value\)/)
assert.match(applyMigration, /when 'partner1\.postalCode' then v_patch := v_patch \|\| jsonb_build_object\('contract_postal_code', v_value\)/)
assert.match(applyMigration, /when 'partner1\.city' then v_patch := v_patch \|\| jsonb_build_object\('contract_city', v_value\)/)
assert.match(applyMigration, /when 'wedding\.date' then v_patch := v_patch \|\| jsonb_build_object\('wedding_date', v_value\)/)
assert.match(applyMigration, /package_name = coalesce\(v_patch->>'package_name', w\.package_name\)/)
assert.match(applyMigration, /update public\.wedding_places set formatted_address = v_place_text/)
assert.match(applyMigration, /insert into public\.wedding_places/)
assert.doesNotMatch(applyMigration, /insert into public\.packages\b/)
assert.match(applyMigration, /'deliveryDays',p->'deliveryDays'/)
assert.match(applyMigration, /contract_value = coalesce\(\(v_patch->>'contract_value'\)::numeric, w\.contract_value\)/)
assert.doesNotMatch(applyMigration, /contract_value\s*=\s*[^,;]*price_snapshot/)
assert.match(applyMigration, /security invoker/)
assert.match(applyMigration, /auth\.uid\(\)/)
assert.match(applyMigration, /pg_advisory_xact_lock/)

assert.match(weddingMapper, /row\.bride_name/)
assert.match(weddingMapper, /row\.contract_address/)
assert.match(weddingMapper, /row\.contract_postal_code/)
assert.match(weddingMapper, /row\.contract_city/)
assert.match(overview, /wedding-contract-package-snapshots/)
assert.match(overview, /sourcePackageSnapshot\s*\?\s*\(/)
assert.match(overview, /PackageSnapshotCard model=\{packageSnapshotFromRow\(sourcePackageSnapshot\)\}/)
assert.match(read('src/features/wedding-contract-recovery/components/PackageSnapshotCard.tsx'), /W terminie \{model\.deliveryDays\} dni od daty wydarzenia/)
assert.match(detailHost, /queryKey: \['wedding-extras', userId, id\]/)
assert.match(finance, /composeModernAgreementTerms\(wedding, extras\)/)
assert.match(invalidation, /queryKey: \['wedding-places', userId, weddingId\]/)
assert.match(invalidation, /queryKey: \['wedding-extras', userId, weddingId\]/)
assert.match(recoveryPage, /setAppliedChangeCount\(selection\.logicalCount\)/)

assert.match(analysisPrompt, /normalized descriptions, display labels, service names, package conditions, delivery descriptions, and operational notes must be concise Polish/)
assert.match(analysisPrompt, /Keep evidence quotes verbatim in the source language/)
assert.match(analysisPrompt, /Do not translate people's names, addresses, venue names, email addresses, brand names, or package titles/)

const extraction = emptyContractRecoveryExtraction()
extraction.additionalServices = [{
  name: 'Dodatkowa godzina pracy', description: null, price: 800, currency: 'PLN', confidence: 0.9,
  evidence: [{ quote: 'Additional coverage hour — 800 PLN' }], warnings: [],
}]
extraction.contractedPackage.coverageHours.value = 12
extraction.wedding.receptionLocation.value = 'The Grand Hall'
extraction.wedding.receptionLocation.evidence = [{ quote: 'Reception at The Grand Hall' }]
extraction.contractedPackage.includedItems = [{
  text: 'Dodatkowa godzina pracy', confidence: 0.9,
  evidence: [{ quote: 'Additional coverage hour' }],
}]
const normalized = normalizeContractRecoveryExtraction(extraction)
assert.equal(normalized.additionalServices[0]?.name, 'Dodatkowa godzina pracy')
assert.equal(normalized.additionalServices[0]?.evidence[0]?.quote, 'Additional coverage hour — 800 PLN')
assert.equal(normalized.contractedPackage.includedItems[0]?.evidence[0]?.quote, 'Additional coverage hour')
assert.equal(normalized.wedding.receptionLocation.value, 'The Grand Hall', 'venue proper nouns are preserved')

console.log('PASS Source Contract apply persistence/read-path/language acceptance')
