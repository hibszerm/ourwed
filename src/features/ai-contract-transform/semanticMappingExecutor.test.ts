import { extractCanonicalParagraphText } from '../documents/template/canonicalParagraph'
import type { ContractTransformationDataset } from './types'
import { resolveSemanticMappings, type SemanticMapping } from './semanticMapping'
import { executeSemanticMappings, type CustomerNameFormResolver } from './semanticMappingExecutor'
import { polishContractMoneyWords } from './polishContractMoneyWords'
import { applyDeterministicRepairs, repairMoneyWordsInText } from './quality/deterministicRepairs'

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message)
}
function run(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}
const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
const map = (sourceBlockId: string, concept: SemanticMapping['concept'], anchor: string, occurrence?: number, nameForm: SemanticMapping['nameForm'] = 'BASE'): SemanticMapping => ({
  sourceBlockId, concept, anchor, ...(occurrence === undefined ? {} : { occurrence }),
  ...(concept === 'customer_address' || concept === 'customer_phone' ? { customerIndex: 0 as const } : {}),
  ...(concept === 'customer_1_name' || concept === 'customer_2_name' ? { nameForm } : {}),
})
const dataset: ContractTransformationDataset = {
  clients: {
    displayNames: 'Maria Kowalska i Ewa Nowak', personCount: 2, address: 'Kwiatowa 8, 00-001 Warszawa', phone: '+48 555 666 777',
    customers: [
      { displayName: 'Maria Kowalska', address: 'ul. Kwiatowa 8, 00-001 Warszawa', phone: '+48 555 666 777', email: 'maria@example.com' },
      { displayName: 'Ewa Nowak', address: 'ul. Leśna 3, 90-001 Łódź', phone: '+48 555 666 888', email: 'ewa@example.com' },
    ],
  },
  dates: { weddingDate: '2026-08-14', contractExecutionDate: '2026-07-01' },
  finances: {
    contractValueFormatted: '4 800 zł',
    contractValueWords: 'ignored because words derive from numeric total',
    depositFormatted: '1 200 zł',
    depositWords: 'ignored because words derive from numeric deposit',
    remainingFormatted: '3 600 zł',
    remainingWords: 'ignored because words derive from numeric remaining',
  },
  locations: {
    preparation: { displayName: 'New Preparation House', city: 'Warszawa' },
    preparationLocations: [
      { person: 'bride', label: 'Panny Młodej', fullAddress: 'ul. Brzozowa 2, Warszawa' },
      { person: 'groom', label: 'Pana Młodego', fullAddress: 'ul. Leśna 3, Łódź' },
      { person: 'shared', label: 'wspólne', fullAddress: 'ul. Polna 4, Gdańsk' },
    ],
    ceremony: { displayName: 'New Ceremony Hall', city: 'Gdańsk' },
    reception: { fullAddress: 'ul. Radosna 10, Gdańsk' },
  },
}

function execute(
  mappings: SemanticMapping[],
  sourceParagraphs: Array<{ blockId: string; paragraphXml: string }>,
  canonicalDataset = dataset,
  sourceCustomerIdentities?: readonly (string | undefined)[],
) {
  const grounded = resolveSemanticMappings({ mappings, sourceBlocks: sourceParagraphs })
  assert(grounded.ok, grounded.ok ? '' : `grounding failed: ${grounded.code}`)
  return executeSemanticMappings({ resolvedMappings: grounded.mappings, canonicalDataset, sourceParagraphs, sourceCustomerIdentities })
}
function visible(result: ReturnType<typeof executeSemanticMappings>, id: string): string {
  assert(result.ok, result.ok ? '' : `execution failed: ${result.code}`)
  const block = result.paragraphs.find((row) => row.blockId === id)
  assert(block, `output block ${id} exists`)
  return extractCanonicalParagraphText(block.paragraphXml)
}

run('unavailable customer morphology falls back to the exact canonical CRM name', () => {
  for (const [anchor, form] of [['Leny Fikcyjnej', 'GENITIVE'], ['Kacprem Modelowym', 'INSTRUMENTAL']] as const) {
    const result = execute([map('party', 'customer_1_name', anchor, undefined, form)], [{ blockId: 'party', paragraphXml: p(anchor) }])
    assert(result.ok, `${form} without a morphology engine continues safely`)
    assert(visible(result, 'party') === 'Maria Kowalska', `${form} uses the exact canonical CRM value`)
  }
})

run('production morphology uses only resolved forms and falls back on ambiguous, unsupported, or blank results', () => {
  const resolve = (form: 'GENITIVE' | 'INSTRUMENTAL', resolver: CustomerNameFormResolver) => {
    const anchor = form === 'GENITIVE' ? 'Old genitive' : 'Old instrumental'
    const sourceParagraphs = [{ blockId: form, paragraphXml: p(anchor) }]
    const grounded = resolveSemanticMappings({ mappings: [map(form, 'customer_1_name', anchor, undefined, form)], sourceBlocks: sourceParagraphs })
    assert(grounded.ok, 'name mapping grounds')
    if (!grounded.ok) throw new Error('name mapping grounding failed')
    return executeSemanticMappings({ resolvedMappings: grounded.mappings, canonicalDataset: dataset, sourceParagraphs, customerNameFormResolver: resolver })
  }
  const genitive = resolve('GENITIVE', () => ({ status: 'RESOLVED', value: 'Marii Kowalskiej' }))
  assert(visible(genitive, 'GENITIVE') === 'Marii Kowalskiej', 'resolved GENITIVE is used')
  const instrumental = resolve('INSTRUMENTAL', () => ({ status: 'RESOLVED', value: 'Marią Kowalską' }))
  assert(visible(instrumental, 'INSTRUMENTAL') === 'Marią Kowalską', 'resolved INSTRUMENTAL is used')
  for (const result of [
    resolve('GENITIVE', () => ({ status: 'AMBIGUOUS' })),
    resolve('INSTRUMENTAL', () => ({ status: 'UNSUPPORTED' })),
    resolve('GENITIVE', () => ({ status: 'RESOLVED', value: '  ' })),
    resolve('INSTRUMENTAL', () => { throw new Error('morphology unavailable') }),
  ]) {
    assert(result.ok, 'unresolved morphology never blocks generation')
    if (result.ok) assert(extractCanonicalParagraphText(result.paragraphs[0]!.paragraphXml) === 'Maria Kowalska', 'unresolved morphology falls back to BASE')
  }
})

run('name-form fallback does not mutate CRM data or cross customer ownership', () => {
  const canonicalDataset = structuredClone(dataset)
  const before = structuredClone(canonicalDataset.clients)
  const sourceParagraphs = [
    { blockId: 'customer-1', paragraphXml: p('Old first name') },
    { blockId: 'customer-2', paragraphXml: p('Old second name') },
  ]
  const grounded = resolveSemanticMappings({ mappings: [
    map('customer-1', 'customer_1_name', 'Old first name', undefined, 'GENITIVE'),
    map('customer-2', 'customer_2_name', 'Old second name', undefined, 'INSTRUMENTAL'),
  ], sourceBlocks: sourceParagraphs })
  assert(grounded.ok, 'both customer mappings ground')
  if (!grounded.ok) throw new Error('customer mappings failed to ground')
  const result = executeSemanticMappings({ resolvedMappings: grounded.mappings, canonicalDataset, sourceParagraphs })
  assert(visible(result, 'customer-1') === 'Maria Kowalska', 'first customer gets first canonical name')
  assert(visible(result, 'customer-2') === 'Ewa Nowak', 'second customer gets second canonical name')
  assert(JSON.stringify(canonicalDataset.clients) === JSON.stringify(before), 'canonical CRM customer data remains unchanged')
})

run('exact source identities use the mapped canonical customer without cross-customer replacement', () => {
  const sources = [
    { blockId: 'c1-exact', paragraphXml: p('Kacper Modelowy') },
    { blockId: 'c2-exact', paragraphXml: p('Iga Makieta') },
  ]
  const twoCustomerDataset = {
    ...dataset,
    clients: {
      ...dataset.clients,
      displayNames: 'Filip Brzegowy i Julia Siatkowa',
      customers: [
        { displayName: 'Filip Brzegowy' },
        { displayName: 'Julia Siatkowa' },
      ],
    },
  }
  const result = execute([
    map('c1-exact', 'customer_1_name', 'Kacper Modelowy'),
    map('c2-exact', 'customer_2_name', 'Iga Makieta'),
  ], sources, twoCustomerDataset, ['Kacper Modelowy', 'Iga Makieta'])
  assert(visible(result, 'c1-exact') === 'Filip Brzegowy', 'customer 1 receives its CRM identity')
  assert(visible(result, 'c2-exact') === 'Julia Siatkowa', 'customer 2 receives its CRM identity')
  assert(!visible(result, 'c1-exact').includes('Julia') && !visible(result, 'c2-exact').includes('Filip'), 'customer identities never cross')
})

run('exact path rejects source-name surfaces without a proven complete identity', () => {
  const exactSource = [{ blockId: 'exact', paragraphXml: p('Kacper Modelowy') }]
  const twoCustomerDataset = {
    ...dataset,
    clients: { ...dataset.clients, displayNames: 'Filip Brzegowy i Julia Siatkowa', customers: [{ displayName: 'Filip Brzegowy' }, { displayName: 'Julia Siatkowa' }] },
  }
  const exact = execute([map('exact', 'customer_1_name', 'Kacper Modelowy')], exactSource, twoCustomerDataset, ['Kacper Modelowy', 'Iga Makieta'])
  assert(visible(exact, 'exact') === 'Filip Brzegowy', 'both first and surname may differ')

  for (const unproven of ['Kacper', 'Modelowy', 'Kacper Modelov', 'Kacprem Modelowym']) {
    const xml = [{ blockId: 'unproven', paragraphXml: p(unproven) }]
    const result = execute([map('unproven', 'customer_2_name', unproven)], xml, twoCustomerDataset, ['Kacper Modelowy', 'Kacper Modelowy'])
    assert(!result.ok && result.code === 'unrenderable_surface', `${unproven} is not accepted as an exact customer identity`)
  }
  const noReference = execute([map('exact', 'customer_1_name', 'Kacper Modelowy')], exactSource, twoCustomerDataset)
  assert(!noReference.ok && noReference.code === 'unrenderable_surface', 'unknown source identity fails closed')
})

run('mixed customer/provider paragraph changes only grounded customer text', () => {
  const paragraphXml = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Anna</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve"> Nowak</w:t></w:r><w:r><w:t>, client, Video Productions Marcin Hibszer — provider/legal text.</w:t></w:r></w:p>'
  const sources = [{ blockId: 'mixed', paragraphXml }]
  const result = execute([map('mixed', 'customer_1_name', 'Anna Nowak')], sources, dataset, ['Anna Nowak'])
  const output = result.ok ? result.paragraphs[0]!.paragraphXml : ''
  assert(extractCanonicalParagraphText(output) === 'Maria Kowalska, client, Video Productions Marcin Hibszer — provider/legal text.', 'surrounding provider/legal text stays unchanged')
  assert(output.includes('<w:rPr><w:b/></w:rPr><w:t>Maria Kowalska</w:t>'), 'multi-run anchor replacement inherits first run formatting')
  assert(output.includes('<w:rPr><w:i/></w:rPr>'), 'covered styled run formatting remains structurally intact')
  assert(output.includes('Video Productions Marcin Hibszer — provider/legal text.'), 'provider text retained in XML')
})

run('wedding and execution dates preserve supported source formats', () => {
  const sources = [
    { blockId: 'wedding', paragraphXml: p('12.07.2025') },
    { blockId: 'execution', paragraphXml: p('12 lipca 2025 r.') },
  ]
  const result = execute([
    map('wedding', 'wedding_date', '12.07.2025'),
    map('execution', 'execution_date', '12 lipca 2025 r.'),
  ], sources)
  assert(visible(result, 'wedding') === '14.08.2026', 'wedding date uses dotted style')
  assert(visible(result, 'execution') === '1 lipca 2026 r.', 'execution date uses long Polish style')
})

run('total, deposit, remaining, and words derive from canonical numeric amounts', () => {
  const sources = [
    { blockId: 'total', paragraphXml: p('3 500,00 zł (słownie: old words)') },
    { blockId: 'deposit', paragraphXml: p('800 zł (słownie: old deposit words)') },
    { blockId: 'remaining', paragraphXml: p('2 700 zł (słownie: old remaining words)') },
  ]
  const result = execute([
    map('total', 'total', '3 500,00 zł'),
    map('total', 'total_words', 'old words'),
    map('deposit', 'deposit', '800 zł'),
    map('deposit', 'deposit_words', 'old deposit words'),
    map('remaining', 'remaining', '2 700 zł'),
    map('remaining', 'remaining_words', 'old remaining words'),
  ], sources)
  const total = visible(result, 'total')
  assert(total === `4 800,00 zł (słownie: ${polishContractMoneyWords(4800)})`, 'numeric and words total share canonical amount')
  assert(visible(result, 'deposit') === `1 200 zł (słownie: ${polishContractMoneyWords(1200)})`, 'deposit and words use canonical deposit')
  assert(visible(result, 'remaining') === `3 600 zł (słownie: ${polishContractMoneyWords(3600)})`, 'remaining and words use canonical remaining')
})

run('money-word suffix inside the mapped span stays outside the replacement with punctuation intact', () => {
  const sourceText = 'osiem tysięcy czterysta złotych 00/100.'
  const source = [{ blockId: 'money-inside', paragraphXml: p(sourceText) }]
  const target = {
    ...dataset,
    finances: {
      ...dataset.finances,
      contractValueFormatted: '11 200 zł',
      contractValueWords: 'ignored',
    },
  }
  const result = execute([map('money-inside', 'total_words', 'osiem tysięcy czterysta złotych 00/100')], source, target)
  assert(visible(result, 'money-inside') === 'jedenaście tysięcy dwieście złotych 00/100.', 'source suffix and terminal punctuation remain exactly once')
  assert(result.ok && result.spanEdits[0]!.span.end < sourceText.indexOf('00/100'), 'effective replacement boundary stops before source suffix')
})

run('money-word suffix adjacent to the mapped span remains exactly once', () => {
  const source = [{ blockId: 'money-adjacent', paragraphXml: p('osiem tysięcy czterysta złotych 00/100.') }]
  const target = { ...dataset, finances: { ...dataset.finances, contractValueFormatted: '11 200 zł' } }
  const result = execute([map('money-adjacent', 'total_words', 'osiem tysięcy czterysta złotych')], source, target)
  assert(visible(result, 'money-adjacent') === 'jedenaście tysięcy dwieście złotych 00/100.', 'adjacent suffix remains in its source position')
  assert((visible(result, 'money-adjacent').match(/00\/100/g) ?? []).length === 1, 'adjacent suffix is not duplicated')
})

run('money words do not introduce a source-absent fraction suffix', () => {
  const source = [{ blockId: 'money-no-suffix', paragraphXml: p('osiem tysięcy czterysta złotych.') }]
  const target = { ...dataset, finances: { ...dataset.finances, contractValueFormatted: '11 200 zł' } }
  const result = execute([map('money-no-suffix', 'total_words', 'osiem tysięcy czterysta złotych')], source, target)
  assert(visible(result, 'money-no-suffix') === 'jedenaście tysięcy dwieście złotych.', 'source without convention stays without it')
  assert(!visible(result, 'money-no-suffix').includes('/100'), 'no suffix invented')
})

run('suffix in a separate DOCX run retains its original run formatting', () => {
  const suffixRun = '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> 00/100.</w:t></w:r>'
  const source = [{ blockId: 'money-runs', paragraphXml: `<w:p><w:r><w:t>osiem tysięcy czterysta złotych</w:t></w:r>${suffixRun}</w:p>` }]
  const target = { ...dataset, finances: { ...dataset.finances, contractValueFormatted: '11 200 zł' } }
  const result = execute([map('money-runs', 'total_words', 'osiem tysięcy czterysta złotych 00/100')], source, target)
  assert(visible(result, 'money-runs') === 'jedenaście tysięcy dwieście złotych 00/100.', 'split-run suffix survives')
  assert(result.ok && result.paragraphs[0]!.paragraphXml.includes(suffixRun), 'separate suffix run and its bold formatting are byte-preserved')
})

run('table-cell total, deposit, and remaining words independently preserve source convention', () => {
  const sources = [
    { blockId: 'table-5-row-1-cell-1-p-0', paragraphXml: p('osiem tysięcy czterysta złotych 00/100') },
    { blockId: 'table-5-row-2-cell-1-p-0', paragraphXml: p('tysiąc pięćset złotych') },
    { blockId: 'table-5-row-3-cell-1-p-0', paragraphXml: p('sześć tysięcy dziewięćset złotych 00/100') },
  ]
  const target = {
    ...dataset,
    finances: {
      ...dataset.finances,
      contractValueFormatted: '11 200 zł',
      depositFormatted: '1 500 zł',
      remainingFormatted: '9 700 zł',
    },
  }
  const result = execute([
    map(sources[0]!.blockId, 'total_words', 'osiem tysięcy czterysta złotych 00/100'),
    map(sources[1]!.blockId, 'deposit_words', 'tysiąc pięćset złotych'),
    map(sources[2]!.blockId, 'remaining_words', 'sześć tysięcy dziewięćset złotych 00/100'),
  ], sources, target)
  assert(visible(result, sources[0]!.blockId) === 'jedenaście tysięcy dwieście złotych 00/100', 'G03-shaped table total retains suffix in its own cell')
  assert(visible(result, sources[1]!.blockId) === 'tysiąc pięćset złotych', 'deposit keeps absent suffix absent')
  assert(visible(result, sources[2]!.blockId) === 'dziewięć tysięcy siedemset złotych 00/100', 'remaining independently retains suffix')
  assert(result.ok && result.paragraphs.length === 3 && result.paragraphs.every((row, index) => row.blockId === sources[index]!.blockId), 'no table-cell movement')
})

run('legacy money-word repair is idempotent and cannot duplicate a preserved suffix', () => {
  const target = { ...dataset, finances: { ...dataset.finances, contractValueFormatted: '11 200 zł', contractValueWords: polishContractMoneyWords(11_200) } }
  const once = repairMoneyWordsInText('11 200 zł brutto, słownie: stare słowa 00/100.', target.finances)
  const twice = repairMoneyWordsInText(once, target.finances)
  assert(once === twice, 'legacy normalizer is idempotent')
  assert(once.includes('jedenaście tysięcy dwieście złotych 00/100.'), 'legacy normalizer preserves source fraction')
  assert((once.match(/00\/100/g) ?? []).length === 1, 'legacy normalizer leaves exactly one suffix')

  const blockId = 'legacy-total-words'
  const sourceText = '11 200 zł brutto, słownie: stare słowa 00/100.'
  const sourceBlocks = [{ blockId, paragraphIndex: 0, kind: 'paragraph' as const, text: sourceText }]
  const manifest = {
    requiredFields: [],
    protectedFields: [],
    consistencyRules: [],
    sourceSpecificValues: [],
    requiredReplacements: [{
      canonicalField: 'contract.totalPriceWords' as const,
      sourceValues: ['stare słowa'],
      targetRenderedValues: [polishContractMoneyWords(11_200)],
      sourceBlockIds: [blockId],
      requiredContextBlockIds: [blockId],
      replacementPolicy: 'replace_in_contexts' as const,
    }],
  }
  const legacyOnce = applyDeterministicRepairs({ blocks: [{ blockId, text: sourceText }], dataset: target, manifest, sourceBlocks })
  const legacyTwice = applyDeterministicRepairs({ blocks: legacyOnce.blocks, dataset: target, manifest, sourceBlocks })
  assert(legacyOnce.blocks[0]!.text === legacyTwice.blocks[0]!.text, 'total-word source repair remains idempotent')
  assert((legacyOnce.blocks[0]!.text.match(/00\/100/g) ?? []).length === 1, 'source-aware total repair emits exactly one suffix')
})

run('table-cell finance, locations, phone, and address inject available canonical data', () => {
  const sources = [
    { blockId: 'cell', paragraphXml: p('900 zł') },
    { blockId: 'prep', paragraphXml: p('Old Preparation') },
    { blockId: 'bride-prep', paragraphXml: p('Old Bride Address') },
    { blockId: 'groom-prep', paragraphXml: p('Old Groom Address') },
    { blockId: 'shared-prep', paragraphXml: p('Old Shared Address') },
    { blockId: 'ceremony', paragraphXml: p('Old Ceremony') },
    { blockId: 'reception', paragraphXml: p('Old Reception') },
    { blockId: 'phone', paragraphXml: p('000') },
    { blockId: 'address', paragraphXml: p('Old Street') },
  ]
  const result = execute([
    map('cell', 'total', '900 zł'),
    map('prep', 'preparation_location', 'Old Preparation'),
    map('bride-prep', 'bride_preparation_location', 'Old Bride Address'),
    map('groom-prep', 'groom_preparation_location', 'Old Groom Address'),
    map('shared-prep', 'shared_preparation_location', 'Old Shared Address'),
    map('ceremony', 'ceremony_location', 'Old Ceremony'),
    map('reception', 'reception_location', 'Old Reception'),
    map('phone', 'customer_phone', '000'),
    map('address', 'customer_address', 'Old Street'),
  ], sources)
  assert(visible(result, 'cell') === '4 800 zł', 'table-cell numeric amount rendered')
  assert(visible(result, 'prep') === 'New Preparation House, Warszawa', 'preparation summary rendered')
  assert(visible(result, 'bride-prep') === 'ul. Brzozowa 2, Warszawa', 'bride preparation value rendered')
  assert(visible(result, 'groom-prep') === 'ul. Leśna 3, Łódź', 'groom preparation value rendered')
  assert(visible(result, 'shared-prep') === 'ul. Polna 4, Gdańsk', 'shared preparation value rendered')
  assert(visible(result, 'ceremony') === 'New Ceremony Hall, Gdańsk', 'ceremony summary rendered')
  assert(visible(result, 'reception') === 'ul. Radosna 10, Gdańsk', 'reception address rendered')
  assert(visible(result, 'phone') === '+48 555 666 777', 'canonical phone rendered')
  assert(visible(result, 'address') === 'ul. Kwiatowa 8, 00-001 Warszawa', 'canonical address rendered')
})

run('structured CRM targets fill cross-break address and location slots without consuming breaks', () => {
  const structured = {
    ...dataset,
    clients: {
      ...dataset.clients,
      customers: [
        { ...dataset.clients.customers![0]!, addressTarget: { text: 'ul. Nowa 1, 00-001 Warszawa', segments: ['ul. Nowa 1', '00-001 Warszawa'] } },
        dataset.clients.customers![1]!,
      ],
    },
    locations: {
      ...dataset.locations,
      ceremony: { displayName: 'Pałac Goetz, ul. Brzeska 7, Brzesko', fullAddress: 'Pałac Goetz, ul. Brzeska 7, Brzesko', target: { text: 'Pałac Goetz, ul. Brzeska 7, Brzesko', segments: ['Pałac Goetz', 'ul. Brzeska 7, Brzesko'] } },
    },
  }
  const sources = [
    { blockId: 'address-lines', paragraphXml: '<w:p><w:r><w:t>Old Name</w:t><w:br/><w:t>ul. Old 1</w:t><w:br/><w:t>90-001 Łódź</w:t><w:br/><w:t>PESEL 123</w:t></w:r></w:p>' },
    { blockId: 'location-lines', paragraphXml: '<w:p><w:r><w:t>Old Venue</w:t><w:br/><w:t>Old Address</w:t></w:r></w:p>' },
  ]
  const result = execute([
    map('address-lines', 'customer_address', 'ul. Old 190-001 Łódź'),
    map('location-lines', 'ceremony_location', 'Old VenueOld Address'),
  ], sources, structured)
  assert(result.ok, result.ok ? '' : `structured replacement failed: ${result.code}`)
  const addressXml = result.paragraphs.find((row) => row.blockId === 'address-lines')!.paragraphXml
  const locationXml = result.paragraphs.find((row) => row.blockId === 'location-lines')!.paragraphXml
  assert(addressXml.includes('<w:t>Old Name</w:t><w:br/><w:t>ul. Nowa 1</w:t><w:br/><w:t>00-001 Warszawa</w:t><w:br/><w:t>PESEL 123</w:t>'), 'customer components fill corresponding slots while name and PESEL survive')
  assert(locationXml.includes('<w:t>Pałac Goetz</w:t><w:br/><w:t>ul. Brzeska 7, Brzesko</w:t>'), 'location label and address fill same existing slots')
  assert((addressXml.match(/<w:br\b/g) ?? []).length === 3, 'customer structural separators survive')
  assert((locationXml.match(/<w:br\b/g) ?? []).length === 1, 'location structural separator survives')
})

run('cross-break targets with absent or incompatible authoritative components fail closed', () => {
  const source = [{ blockId: 'multi-slot', paragraphXml: '<w:p><w:r><w:t>Old label</w:t><w:br/><w:t>Old address</w:t></w:r></w:p>' }]
  const oneComponent = {
    ...dataset,
    locations: { ...dataset.locations, reception: { displayName: 'Grand Hotel Sopot — sala balowa', fullAddress: 'Grand Hotel Sopot — sala balowa', target: { text: 'Grand Hotel Sopot — sala balowa', segments: ['Grand Hotel Sopot — sala balowa'] } } },
  }
  const result = execute([map('multi-slot', 'reception_location', 'Old labelOld address')], source, oneComponent)
  assert(!result.ok && result.code === 'unrenderable_surface', 'missing second target component cannot be guessed')
})

run('contact mappings use the indexed canonical customer without cross-customer fallback', () => {
  const sources = [
    { blockId: 'c1-address', paragraphXml: p('Old address one') },
    { blockId: 'c1-phone', paragraphXml: p('Old phone one') },
    { blockId: 'c2-address', paragraphXml: p('Old address two') },
    { blockId: 'c2-phone', paragraphXml: p('Old phone two') },
  ]
  const result = execute([
    map('c1-address', 'customer_address', 'Old address one'),
    map('c1-phone', 'customer_phone', 'Old phone one'),
    { ...map('c2-address', 'customer_address', 'Old address two'), customerIndex: 1 },
    { ...map('c2-phone', 'customer_phone', 'Old phone two'), customerIndex: 1 },
  ], sources)
  assert(visible(result, 'c1-address') === 'ul. Kwiatowa 8, 00-001 Warszawa', 'customer 1 address applied')
  assert(visible(result, 'c1-phone') === '+48 555 666 777', 'customer 1 phone applied')
  assert(visible(result, 'c2-address') === 'ul. Leśna 3, 90-001 Łódź', 'customer 2 address applied')
  assert(visible(result, 'c2-phone') === '+48 555 666 888', 'customer 2 phone applied')
  assert(!visible(result, 'c2-address').includes('Kwiatowa') && !visible(result, 'c2-phone').includes('777'), 'customer 2 never receives customer 1 contacts')

  const outOfRange = resolveSemanticMappings({ mappings: [{ ...map('c2-phone', 'customer_phone', 'Old phone two'), customerIndex: 2 }], sourceBlocks: sources })
  assert(!outOfRange.ok && outOfRange.code === 'invalid_mapping', 'out-of-range customer fails closed at grounding')
  const missingAddressDataset = { ...dataset, clients: { ...dataset.clients, customers: [dataset.clients.customers![0]!, { displayName: 'Ewa Nowak', phone: '+48 555 666 888' }] } }
  const missingAddress = execute([{ ...map('c2-address', 'customer_address', 'Old address two'), customerIndex: 1 }], sources, missingAddressDataset)
  assert(!missingAddress.ok && missingAddress.code === 'missing_canonical_value', 'missing address fails closed without customer 1 fallback')
  const missingPhoneDataset = { ...dataset, clients: { ...dataset.clients, customers: [dataset.clients.customers![0]!, { displayName: 'Ewa Nowak', address: 'ul. Leśna 3' }] } }
  const missingPhone = execute([{ ...map('c2-phone', 'customer_phone', 'Old phone two'), customerIndex: 1 }], sources, missingPhoneDataset)
  assert(!missingPhone.ok && missingPhone.code === 'missing_canonical_value', 'missing phone fails closed without customer 1 fallback')
})

run('shared addresses render once only when both customers have the same canonical value', () => {
  const sharedDataset: ContractTransformationDataset = {
    ...dataset,
    clients: {
      ...dataset.clients,
      customers: [
        { displayName: 'Maria Kowalska', address: 'ul. Kwiatowa 8, 00-001 Warszawa', phone: '+48 555 666 777' },
        { displayName: 'Ewa Nowak', address: 'Kwiatowa 8, 00-001 Warszawa', phone: '+48 555 666 888' },
      ],
    },
  }
  const sharedMap = { sourceBlockId: 'shared-address', concept: 'customer_address', anchor: 'Old shared address', customerIndexes: [0, 1] as const }
  const source = [{ blockId: 'shared-address', paragraphXml: p('Old shared address') }]
  const result = execute([sharedMap], source, sharedDataset)
  assert(visible(result, 'shared-address') === 'ul. Kwiatowa 8, 00-001 Warszawa', 'equal canonical addresses replace the common surface')
  assert(result.ok && result.spanEdits.length === 1, 'common address is rendered with one span edit')

  const mismatch = execute([sharedMap], source, dataset)
  assert(!mismatch.ok && mismatch.code === 'shared_canonical_values_mismatch', 'different addresses fail closed')
  const missingSecond = { ...sharedDataset, clients: { ...sharedDataset.clients, customers: [sharedDataset.clients.customers![0]!, { displayName: 'Ewa Nowak' }] } }
  const missing = execute([sharedMap], source, missingSecond)
  assert(!missing.ok && missing.code === 'missing_canonical_value', 'missing value for either owner fails closed')
  const invalidTuple = resolveSemanticMappings({ mappings: [{ ...sharedMap, customerIndexes: [1, 0] }], sourceBlocks: source })
  assert(!invalidTuple.ok && invalidTuple.code === 'invalid_mapping', 'invalid owner tuple fails closed at grounding')
  const sharedPhone = executeSemanticMappings({
    resolvedMappings: [{ ...sharedMap, concept: 'customer_phone', anchor: 'Old shared phone', occurrence: 0, span: { start: 0, end: 'Old shared phone'.length } } as never],
    canonicalDataset: sharedDataset,
    sourceParagraphs: [{ blockId: 'shared-address', paragraphXml: p('Old shared phone') }],
  })
  assert(sharedPhone.ok && visible(sharedPhone, 'shared-address') === '+48 555 666 777', 'shared phone chooses first available owner in stable customer order')
  assert(sharedPhone.ok && sharedPhone.spanEdits.length === 1, 'shared phone renders once into the single source surface')

  const sharedPhoneMapping = { ...sharedMap, concept: 'customer_phone', anchor: 'Old shared phone', occurrence: 0, span: { start: 0, end: 'Old shared phone'.length } } as never
  const renderSharedPhone = (customers: ContractTransformationDataset['clients']['customers']) => executeSemanticMappings({
    resolvedMappings: [sharedPhoneMapping],
    canonicalDataset: { ...sharedDataset, clients: { ...sharedDataset.clients, customers } },
    sourceParagraphs: [{ blockId: 'shared-address', paragraphXml: p('Old shared phone') }],
  })
  const firstMissing = renderSharedPhone([
    { displayName: 'Maria Kowalska' },
    { displayName: 'Ewa Nowak', phone: '+48 555 666 888' },
  ])
  assert(firstMissing.ok && visible(firstMissing, 'shared-address') === '+48 555 666 888', 'shared phone falls through to the next owner only when the first is absent')
  const bothMissing = renderSharedPhone([{ displayName: 'Maria Kowalska' }, { displayName: 'Ewa Nowak' }])
  assert(!bothMissing.ok && bothMissing.code === 'missing_canonical_value', 'shared phone fails closed when all owners lack a phone')

  const singularMissingOwner = execute([
    { ...map('singular-phone', 'customer_phone', 'Old phone'), customerIndex: 1 },
  ], [{ blockId: 'singular-phone', paragraphXml: p('Old phone') }], {
    ...dataset,
    clients: { ...dataset.clients, customers: [{ displayName: 'Maria Kowalska', phone: '+48 555 666 777' }, { displayName: 'Ewa Nowak' }] },
  })
  assert(!singularMissingOwner.ok && singularMissingOwner.code === 'missing_canonical_value', 'singular owner never falls back across customers')

  const invalidSharedTuple = executeSemanticMappings({
    resolvedMappings: [{ ...sharedPhoneMapping, customerIndexes: [1, 0] }],
    canonicalDataset: sharedDataset,
    sourceParagraphs: [{ blockId: 'shared-address', paragraphXml: p('Old shared phone') }],
  })
  assert(!invalidSharedTuple.ok && invalidSharedTuple.code === 'invalid_customer_index', 'invalid shared phone ownership fails closed')

  const g06Phone = executeSemanticMappings({
    resolvedMappings: [{ ...sharedPhoneMapping, sourceBlockId: 'g06-phone', anchor: '+48 000 600 601', span: { start: 0, end: '+48 000 600 601'.length } }],
    canonicalDataset: {
      ...sharedDataset,
      clients: {
        ...sharedDataset.clients,
        customers: [
          { displayName: 'Nina Robocza', phone: '+48 511 700 101' },
          { displayName: 'Kajetan Testowy', phone: '+48 511 700 102' },
        ],
      },
    },
    sourceParagraphs: [{ blockId: 'g06-phone', paragraphXml: p('+48 000 600 601') }],
  })
  assert(g06Phone.ok && visible(g06Phone, 'g06-phone') === '+48 511 700 101', 'captured G06 shared phone renders the first canonical phone once')

  const sharedAddressStillWorks = execute([sharedMap], source, sharedDataset)
  assert(sharedAddressStillWorks.ok && visible(sharedAddressStillWorks, 'shared-address') === 'ul. Kwiatowa 8, 00-001 Warszawa', 'shared address equality behavior remains unchanged')
})

run('customer email ownership renders deterministically without cross-owner fallback', () => {
  const source = [{ blockId: 'email', paragraphXml: p('old@example.com') }]
  const singular = execute([{ ...map('email', 'customer_email', 'old@example.com'), customerIndex: 0 }], source)
  assert(visible(singular, 'email') === 'maria@example.com', 'customer 0 email rendered')
  const singularTwo = execute([{ ...map('email', 'customer_email', 'old@example.com'), customerIndex: 1 }], source)
  assert(visible(singularTwo, 'email') === 'ewa@example.com', 'customer 1 email rendered')
  const missingOwner = execute([{ ...map('email', 'customer_email', 'old@example.com'), customerIndex: 1 }], source, {
    ...dataset, clients: { ...dataset.clients, customers: [{ ...dataset.clients.customers![0]! }, { displayName: 'Ewa Nowak', phone: '+48 555 666 888' }] },
  })
  assert(!missingOwner.ok && missingOwner.code === 'missing_canonical_value', 'singular email does not cross-owner fallback')
  const shared = executeSemanticMappings({
    resolvedMappings: [{ ...map('email', 'customer_email', 'old@example.com'), customerIndexes: [0, 1], customerIndex: undefined, occurrence: 0, span: { start: 0, end: 'old@example.com'.length } } as never],
    canonicalDataset: dataset,
    sourceParagraphs: source,
  })
  assert(shared.ok && visible(shared, 'email') === 'maria@example.com', 'shared email selects customer 0 once')
  const firstMissing = executeSemanticMappings({
    resolvedMappings: [{ ...map('email', 'customer_email', 'old@example.com'), customerIndexes: [0, 1], customerIndex: undefined, occurrence: 0, span: { start: 0, end: 'old@example.com'.length } } as never],
    canonicalDataset: { ...dataset, clients: { ...dataset.clients, customers: [{ displayName: 'Maria Kowalska' }, dataset.clients.customers![1]!] } },
    sourceParagraphs: source,
  })
  assert(firstMissing.ok && visible(firstMissing, 'email') === 'ewa@example.com', 'shared email falls through to customer 1')
  const bothMissing = executeSemanticMappings({
    resolvedMappings: [{ ...map('email', 'customer_email', 'old@example.com'), customerIndexes: [0, 1], customerIndex: undefined, occurrence: 0, span: { start: 0, end: 'old@example.com'.length } } as never],
    canonicalDataset: { ...dataset, clients: { ...dataset.clients, customers: [{ displayName: 'Maria Kowalska' }, { displayName: 'Ewa Nowak' }] } },
    sourceParagraphs: source,
  })
  assert(!bothMissing.ok && bothMissing.code === 'missing_canonical_value', 'shared email fails closed when both are missing')
  const invalid = executeSemanticMappings({
    resolvedMappings: [{ ...map('email', 'customer_email', 'old@example.com'), customerIndexes: [1, 0], customerIndex: undefined, occurrence: 0, span: { start: 0, end: 'old@example.com'.length } } as never],
    canonicalDataset: dataset, sourceParagraphs: source,
  })
  assert(!invalid.ok && invalid.code === 'invalid_customer_index', 'invalid shared email ownership fails closed')
})

run('repeated concept across blocks and same-block occurrences are all replaced', () => {
  const sources = [
    { blockId: 'date-a', paragraphXml: p('Wedding 10.06.2025') },
    { blockId: 'date-b', paragraphXml: p('Again 11/06/2025') },
    { blockId: 'amounts', paragraphXml: p('1200 zł / 1300 zł') },
  ]
  const result = execute([
    map('date-a', 'wedding_date', '10.06.2025'),
    map('date-b', 'wedding_date', '11/06/2025'),
    map('amounts', 'total', '1200 zł'),
    map('amounts', 'total', '1300 zł'),
  ], sources)
  assert(visible(result, 'date-a') === 'Wedding 14.08.2026', 'first wedding surface changed')
  assert(visible(result, 'date-b') === 'Again 14/08/2026', 'second wedding surface preserves slash style')
  assert(visible(result, 'amounts') === '4 800 zł / 4 800 zł', 'both total occurrences changed')
})

run('different-length edits in one paragraph keep source-coordinate spans stable', () => {
  const source = [{ blockId: 'mixed-facts', paragraphXml: '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Anna Nowak / 12.07.2025 / 800 zł</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t> / provider terms</w:t></w:r></w:p>' }]
  const result = execute([
    map('mixed-facts', 'customer_1_name', 'Anna Nowak'),
    map('mixed-facts', 'wedding_date', '12.07.2025'),
    map('mixed-facts', 'deposit', '800 zł'),
  ], source, dataset, ['Anna Nowak'])
  assert(visible(result, 'mixed-facts') === 'Maria Kowalska / 14.08.2026 / 1 200 zł / provider terms', 'all original spans replaced despite length shifts')
  assert(result.ok && result.paragraphs[0]!.paragraphXml.includes('<w:rPr><w:i/></w:rPr><w:t> / provider terms</w:t>'), 'unaffected run formatting retained')
})

run('missing canonical data and unrenderable party forms fail closed', () => {
  const source = [{ blockId: 'deposit', paragraphXml: p('800 zł') }]
  const missingDataset = { ...dataset, finances: { ...dataset.finances, depositFormatted: undefined } }
  const missing = execute([map('deposit', 'deposit', '800 zł')], source, missingDataset)
  assert(!missing.ok && missing.code === 'missing_canonical_value', 'missing deposit rejected')
  const unrenderable = execute([map('deposit', 'customer_1_name', 'Anna Nowak')], [
    { blockId: 'deposit', paragraphXml: p('Anna Nowak') },
  ])
  assert(!unrenderable.ok && unrenderable.code === 'unrenderable_surface', 'unsupported name inflection rejected')
})

run('stale spans, overlap, and unsupported concepts fail closed without fallback', () => {
  const stale = executeSemanticMappings({
    resolvedMappings: [{ ...map('p', 'total', '1200 zł'), occurrence: 0, span: { start: 0, end: 6 } }],
    canonicalDataset: dataset,
    sourceParagraphs: [{ blockId: 'p', paragraphXml: p('900 zł') }],
  })
  assert(!stale.ok && stale.code === 'grounded_span_stale', 'stale source span rejected')
  const overlap = executeSemanticMappings({
    resolvedMappings: [
      { ...map('p', 'total', '1200'), occurrence: 0, span: { start: 0, end: 4 } },
      { ...map('p', 'deposit', '1200 zł'), occurrence: 0, span: { start: 0, end: 7 } },
    ],
    canonicalDataset: dataset,
    sourceParagraphs: [{ blockId: 'p', paragraphXml: p('1200 zł') }],
  })
  assert(!overlap.ok && overlap.code === 'overlapping_spans', 'overlap rejected')
  const unsupported = executeSemanticMappings({
    resolvedMappings: [{ sourceBlockId: 'p', concept: 'future_concept', anchor: '1200 zł', occurrence: 0, span: { start: 0, end: 7 } } as never],
    canonicalDataset: dataset,
    sourceParagraphs: [{ blockId: 'p', paragraphXml: p('1200 zł') }],
  })
  assert(!unsupported.ok && unsupported.code === 'unsupported_concept', `unsupported concept rejected (${unsupported.ok ? 'ok' : unsupported.code})`)
})
