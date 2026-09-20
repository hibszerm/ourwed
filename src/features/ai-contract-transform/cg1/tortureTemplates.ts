/**
 * CG1 DOCX builders — synthetic Polish wedding-contract templates (QA only).
 * Valid OOXML via JSZip. No copyrighted third-party content.
 */

import JSZip from 'jszip'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function p(text: string, opts?: { bold?: boolean; empty?: boolean }): string {
  if (opts?.empty) return '<w:p/>'
  const t = escapeXml(text)
  if (opts?.bold) {
    return `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`
  }
  return `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`
}

function splitRuns(parts: string[]): string {
  const runs = parts
    .map((part, i) => {
      const t = escapeXml(part)
      const bold = i === 0 ? '<w:rPr><w:b/></w:rPr>' : ''
      return `<w:r>${bold}<w:t xml:space="preserve">${t}</w:t></w:r>`
    })
    .join('')
  return `<w:p>${runs}</w:p>`
}

function pageBreak(): string {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
}

function table(rows: string[][]): string {
  const tr = rows
    .map(
      (row) =>
        `<w:tr>${row
          .map(
            (cell) =>
              `<w:tc><w:p><w:r><w:t xml:space="preserve">${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`,
          )
          .join('')}</w:tr>`,
    )
    .join('')
  return `<w:tbl>${tr}</w:tbl>`
}

async function pack(bodyXml: string): Promise<ArrayBuffer> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr/>
  </w:body>
</w:document>`

  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  )
  zip.folder('_rels')!.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  )
  zip.folder('word')!.file('document.xml', documentXml)
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}

const COMMON_TAIL = [
  p('§ Wynagrodzenie', { bold: true }),
  p(
    'Strony ustalają wynagrodzenie w wysokości PLACEHOLDER_CENA zł brutto (słownie: PLACEHOLDER_SLOWNIE).',
  ),
  p('§ Płatności', { bold: true }),
  p(
    'Zadatek wynosi PLACEHOLDER_ZADATEK zł. Pozostała kwota płatna najpóźniej 14 dni przed uroczystością.',
  ),
  p('§ RODO / dane osobowe', { bold: true }),
  p(
    'Wykonawca przetwarza dane osobowe Zamawiającego wyłącznie w celu realizacji umowy, zgodnie z obowiązującymi przepisami o ochronie danych.',
  ),
  p('§ Odpowiedzialność', { bold: true }),
  p(
    'Wykonawca odpowiada za należyte wykonanie usług w granicach obowiązującego prawa.',
  ),
  p('§ Odstąpienie od umowy', { bold: true }),
  p(
    'W przypadku odstąpienia od umowy zadatek może zostać zatrzymany na zasadach określonych w niniejszej umowie.',
  ),
  p('§ Prawa autorskie', { bold: true }),
  p(
    'Prawa autorskie do utworów powstałych w ramach umowy przysługują Wykonawcy, z zastrzeżeniem licencji udzielonej Zamawiającemu.',
  ),
  p('§ Podpisy', { bold: true }),
  p('Zamawiający'),
  p('Wykonawca'),
]

export type TortureTemplateId =
  | 'T01'
  | 'T02'
  | 'T03'
  | 'T04'
  | 'T05'
  | 'T06'
  | 'T07'
  | 'T08'
  | 'T09'
  | 'T10'

export type TortureTemplateMeta = {
  id: TortureTemplateId
  title: string
  structure: string
  hasExplicitExtrasSection: boolean
  expectedPlacementModes: Array<
    | 'existing_section'
    | 'package_deliverables'
    | 'package_scope'
    | 'before_payment'
    | 'safe_placement_not_found'
  >
  partiesDefault: 1 | 2
  notes: string
}

export const TORTURE_TEMPLATE_META: TortureTemplateMeta[] = [
  {
    id: 'T01',
    title: 'CLEAN_SEMANTIC',
    structure: 'clear paragraphs + explicit extras',
    hasExplicitExtrasSection: true,
    expectedPlacementModes: ['existing_section'],
    partiesDefault: 2,
    notes: 'Happy-path-like clean structure',
  },
  {
    id: 'T02',
    title: 'NO_EXTRAS_SECTION',
    structure: 'scope + compensation, no extras heading',
    hasExplicitExtrasSection: false,
    expectedPlacementModes: ['package_deliverables', 'package_scope', 'before_payment'],
    partiesDefault: 1,
    notes: 'Must fallback to scope/commercial area',
  },
  {
    id: 'T03',
    title: 'TABLE_HEAVY',
    structure: 'parties/package/price/payments in tables',
    hasExplicitExtrasSection: false,
    expectedPlacementModes: ['package_scope', 'before_payment', 'package_deliverables'],
    partiesDefault: 2,
    notes: 'Table-first commercial layout',
  },
  {
    id: 'T04',
    title: 'HYBRID',
    structure: 'legal paragraphs + commercial tables',
    hasExplicitExtrasSection: false,
    expectedPlacementModes: ['package_deliverables', 'package_scope', 'before_payment'],
    partiesDefault: 1,
    notes: 'Mixed layout',
  },
  {
    id: 'T05',
    title: 'MINIMAL',
    structure: 'short, weak anchors',
    hasExplicitExtrasSection: false,
    expectedPlacementModes: ['before_payment', 'safe_placement_not_found', 'package_scope'],
    partiesDefault: 1,
    notes: 'Weak semantic anchors',
  },
  {
    id: 'T06',
    title: 'LONG_LEGAL',
    structure: 'many numbered § sections including extras',
    hasExplicitExtrasSection: true,
    expectedPlacementModes: ['existing_section'],
    partiesDefault: 2,
    notes: 'Precision among many legal sections',
  },
  {
    id: 'T07',
    title: 'EXTRAS_PLACEHOLDER',
    structure: 'explicit extras destination already present',
    hasExplicitExtrasSection: true,
    expectedPlacementModes: ['existing_section'],
    partiesDefault: 2,
    notes: 'Must reuse, not duplicate section',
  },
  {
    id: 'T08',
    title: 'MULTI_COMMERCIAL',
    structure: 'price/payment repeated in multiple places',
    hasExplicitExtrasSection: false,
    expectedPlacementModes: ['package_deliverables', 'package_scope', 'before_payment'],
    partiesDefault: 1,
    notes: 'Consistency without over-replacement',
  },
  {
    id: 'T09',
    title: 'MESSY_VALID',
    structure: 'empty paras, lists, page break, split runs',
    hasExplicitExtrasSection: false,
    expectedPlacementModes: ['package_deliverables', 'package_scope', 'before_payment'],
    partiesDefault: 2,
    notes: 'Authoring mess but valid DOCX',
  },
  {
    id: 'T10',
    title: 'ADVERSARIAL',
    structure: 'mixed + ambiguous commercial + long body',
    hasExplicitExtrasSection: false,
    expectedPlacementModes: ['package_deliverables', 'package_scope', 'before_payment'],
    partiesDefault: 2,
    notes: 'Hard realistic placement stress',
  },
]

async function buildT01(): Promise<ArrayBuffer> {
  const body = [
    p('UMOWA O ŚWIADCZENIE USŁUG FILMOWYCH', { bold: true }),
    p(
      'zawarta w dniu PLACEHOLDER_DATA pomiędzy PLACEHOLDER_STRONY, zwanymi dalej „Zamawiającymi”.',
    ),
    p('§1 Przedmiot umowy', { bold: true }),
    p('Przedmiotem umowy jest wykonanie reportażu filmowego z uroczystości ślubnej.'),
    p('§2 Zakres pakietu', { bold: true }),
    p('Zamawiający wybiera pakiet, który obejmuje wykonanie następujących usług:'),
    p('– film ślubny do 25 minut'),
    p('– teledysk'),
    p('– galeria online'),
    p('Usługi dodatkowe', { bold: true }),
    p('Dodatkowo Zamawiający może zamówić:'),
    p('§3 Wynagrodzenie', { bold: true }),
    p('Wynagrodzenie wynosi PLACEHOLDER_CENA zł brutto.'),
    p('§4 Płatności', { bold: true }),
    p('Zadatek PLACEHOLDER_ZADATEK zł. Pozostała kwota przed uroczystością.'),
    p('§5 Dane osobowe', { bold: true }),
    p('Przetwarzanie danych osobowych wyłącznie w celu realizacji umowy.'),
    p('§6 Podpisy', { bold: true }),
    p('Zamawiający'),
    p('Wykonawca'),
  ].join('')
  return pack(body)
}

async function buildT02(): Promise<ArrayBuffer> {
  const body = [
    p('Umowa o świadczenie usług fotograficznych', { bold: true }),
    p('zawarta z PLACEHOLDER_STRONY.'),
    p('Pakiet obejmuje:'),
    p('– reportaż fotograficzny'),
    p('– album 30×30'),
    p('– odbitki 15×21'),
    p('Wynagrodzenie wynosi PLACEHOLDER_CENA zł.'),
    p('Zadatek PLACEHOLDER_ZADATEK zł.'),
    p('Ochrona danych osobowych zgodnie z RODO.'),
    p('Prawa autorskie przysługują Wykonawcy.'),
    p('Podpisy stron'),
    p('Zamawiający'),
    p('Wykonawca'),
  ].join('')
  return pack(body)
}

async function buildT03(): Promise<ArrayBuffer> {
  const body = [
    p('Umowa — wariant tabelaryczny', { bold: true }),
    table([
      ['Strona', 'Dane'],
      ['Zamawiający', 'PLACEHOLDER_STRONY'],
      ['Adres', 'PLACEHOLDER_ADRES'],
    ]),
    table([
      ['Element pakietu', 'Opis'],
      ['Film', 'reportaż do 20 min'],
      ['Trailer', 'do 60 s'],
      ['Galeria', '12 miesięcy'],
    ]),
    table([
      ['Pozycja', 'Kwota'],
      ['Wynagrodzenie', 'PLACEHOLDER_CENA zł'],
      ['Zadatek', 'PLACEHOLDER_ZADATEK zł'],
      ['Pozostało', 'PLACEHOLDER_RESTA zł'],
    ]),
    p('Płatności realizowane przelewem przed uroczystością.'),
    p('Dane osobowe przetwarzane wyłącznie w celu umowy.'),
    p('Podpisy'),
    p('Zamawiający'),
    p('Wykonawca'),
  ].join('')
  return pack(body)
}

async function buildT04(): Promise<ArrayBuffer> {
  const body = [
    p('Umowa hybrydowa', { bold: true }),
    p('Strony: PLACEHOLDER_STRONY.'),
    p('Przedmiotem umowy jest wykonanie usług filmowych.'),
    p('Zamawiający wybiera pakiet, który obejmuje wykonanie:'),
    p('– film ślubny'),
    p('– mini sesja'),
    table([
      ['Opłata', 'Wartość'],
      ['Cena pakietu', 'PLACEHOLDER_CENA zł'],
      ['Zadatek', 'PLACEHOLDER_ZADATEK zł'],
    ]),
    p('§ Odpowiedzialność'),
    p('Wykonawca odpowiada za należyte wykonanie usług.'),
    p('§ Dane osobowe'),
    p('RODO — dane tylko do realizacji umowy.'),
    p('Podpisy'),
    p('Zamawiający'),
    p('Wykonawca'),
  ].join('')
  return pack(body)
}

async function buildT05(): Promise<ArrayBuffer> {
  const body = [
    p('Umowa krotka', { bold: true }),
    p('Zamawiający: PLACEHOLDER_STRONY.'),
    p('Usługa: reportaż ślubny.'),
    p('Cena: PLACEHOLDER_CENA zł.'),
    p('Podpis Zamawiającego'),
    p('Podpis Wykonawcy'),
  ].join('')
  return pack(body)
}

async function buildT06(): Promise<ArrayBuffer> {
  const body = [
    p('UMOWA DŁUGA — wzór QA', { bold: true }),
    p('§1 Strony', { bold: true }),
    p('Umowę zawierają PLACEHOLDER_STRONY.'),
    p('§2 Przedmiot', { bold: true }),
    p('Przedmiotem jest filmowanie uroczystości ślubnej.'),
    p('§3 Zakres', { bold: true }),
    p('Pakiet obejmuje: film, teledysk, galerię.'),
    p('§4 Usługi dodatkowe', { bold: true }),
    p('Zakres dodatkowy może obejmować poniższe pozycje:'),
    p('§5 Wynagrodzenie', { bold: true }),
    p('Wynagrodzenie PLACEHOLDER_CENA zł.'),
    p('§6 Płatności', { bold: true }),
    p('Zadatek PLACEHOLDER_ZADATEK zł.'),
    p('§7 Dostawa', { bold: true }),
    p('Materiał zostanie przekazany w terminie uzgodnionym przez strony.'),
    p('§8 Prawa autorskie', { bold: true }),
    p('Prawa autorskie przysługują Wykonawcy.'),
    p('§9 Odstąpienie', { bold: true }),
    p('Odstąpienie od umowy reguluje niniejszy paragraf.'),
    p('§10 Odpowiedzialność', { bold: true }),
    p('Odpowiedzialność stron ogranicza się do szkód rzeczywistych.'),
    p('§11 Dane osobowe', { bold: true }),
    p('RODO — dane osobowe wyłącznie w celu umowy.'),
    p('§12 Postanowienia końcowe', { bold: true }),
    p('W sprawach nieuregulowanych stosuje się przepisy Kodeksu cywilnego.'),
    p('§13 Podpisy', { bold: true }),
    p('Zamawiający'),
    p('Wykonawca'),
  ].join('')
  return pack(body)
}

async function buildT07(): Promise<ArrayBuffer> {
  const body = [
    p('Umowa z miejscem na usługi dodatkowe', { bold: true }),
    p('Zamawiający: PLACEHOLDER_STRONY.'),
    p('Pakiet obejmuje reportaż filmowy i galerię.'),
    p('Usługi dodatkowe', { bold: true }),
    p('(miejsce na uzupełnienie zakresu dodatkowego)'),
    p('Wynagrodzenie PLACEHOLDER_CENA zł. Zadatek PLACEHOLDER_ZADATEK zł.'),
    p('Płatności przed uroczystością.'),
    p('RODO / dane osobowe — wyłącznie cel umowy.'),
    p('Podpisy'),
    p('Zamawiający'),
    p('Wykonawca'),
  ].join('')
  return pack(body)
}

async function buildT08(): Promise<ArrayBuffer> {
  const body = [
    p('Umowa — wielokrotne dane handlowe', { bold: true }),
    p('Strony: PLACEHOLDER_STRONY.'),
    p('Pakiet Premium obejmuje film i album.'),
    p('Łączne wynagrodzenie: PLACEHOLDER_CENA zł brutto.'),
    p('Podsumowanie: cena PLACEHOLDER_CENA zł, zadatek PLACEHOLDER_ZADATEK zł.'),
    table([
      ['Pozycja', 'Kwota'],
      ['Pakiet', 'PLACEHOLDER_CENA zł'],
      ['Zadatek', 'PLACEHOLDER_ZADATEK zł'],
    ]),
    p('Termin płatności pozostałej kwoty: 14 dni przed datą uroczystości.'),
    p('Ochrona danych osobowych (RODO).'),
    p('Podpisy stron'),
    p('Zamawiający'),
    p('Wykonawca'),
  ].join('')
  return pack(body)
}

async function buildT09(): Promise<ArrayBuffer> {
  const body = [
    p('Umowa — dokument roboczy QA', { bold: true }),
    p('', { empty: true }),
    splitRuns(['Zamawiający: ', 'PLACEHOLDER_STRONY']),
    p('', { empty: true }),
    p('Zamawiający wybiera pakiet, który obejmuje wykonanie:'),
    p('– film ślubny'),
    p('– trailer'),
    p('', { empty: true }),
    pageBreak(),
    p('Uwagi techniczne (lista):'),
    p('• montaż kolor'),
    p('• korekcja dźwięku'),
    p('Wynagrodzenie PLACEHOLDER_CENA zł.'),
    p('Zadatek PLACEHOLDER_ZADATEK zł.'),
    p('Dane osobowe — RODO.'),
    p('Prawa autorskie.'),
    p('Podpisy'),
    p('Zamawiający'),
    p('Wykonawca'),
  ].join('')
  return pack(body)
}

async function buildT10(): Promise<ArrayBuffer> {
  const body = [
    p('Umowa adversarialna QA', { bold: true }),
    p('Zawarta z PLACEHOLDER_STRONY pod adresem PLACEHOLDER_ADRES.'),
    p('Przedmiotem umowy jest kompleksowa dokumentacja uroczystości.'),
    table([
      ['Zakres', 'Uwagi'],
      ['Film główny', 'do 30 min'],
      ['Teledysk', 'opcjonalnie w cenie pakietu'],
    ]),
    p('W ramach wybranego pakietu Wykonawca wykona raport filmowy.'),
    p('Koszt bazowy wskazano jako PLACEHOLDER_CENA zł; zadatek PLACEHOLDER_ZADATEK zł.'),
    p('Dodatkowa godzina pracy: według ustaleń stron (nie jest usługą dodatkową z katalogu).'),
    pageBreak(),
    p('§ Siła wyższa', { bold: true }),
    p('Strony nie odpowiadają za niewykonanie wskutek siły wyższej.'),
    p('§ Spory', { bold: true }),
    p('Spory rozstrzyga sąd właściwy dla siedziby Wykonawcy.'),
    p('§ Dane osobowe', { bold: true }),
    p('RODO — wyłącznie cel realizacji umowy.'),
    p('§ Odstąpienie', { bold: true }),
    p('Odstąpienie regulują odrębne postanowienia.'),
    ...COMMON_TAIL.slice(0, 4),
    p('Podpisy'),
    p('Zamawiający'),
    p('Wykonawca'),
  ].join('')
  return pack(body)
}

const BUILDERS: Record<TortureTemplateId, () => Promise<ArrayBuffer>> = {
  T01: buildT01,
  T02: buildT02,
  T03: buildT03,
  T04: buildT04,
  T05: buildT05,
  T06: buildT06,
  T07: buildT07,
  T08: buildT08,
  T09: buildT09,
  T10: buildT10,
}

export async function buildTortureTemplate(
  id: TortureTemplateId,
): Promise<ArrayBuffer> {
  return BUILDERS[id]()
}

export async function writeAllTortureTemplates(
  outDir: string,
): Promise<Array<{ id: TortureTemplateId; path: string; bytes: number }>> {
  mkdirSync(outDir, { recursive: true })
  const written: Array<{ id: TortureTemplateId; path: string; bytes: number }> =
    []
  for (const meta of TORTURE_TEMPLATE_META) {
    const bytes = await buildTortureTemplate(meta.id)
    const path = join(outDir, `${meta.id}_${meta.title}.docx`)
    writeFileSync(path, Buffer.from(bytes))
    written.push({ id: meta.id, path, bytes: bytes.byteLength })
  }
  return written
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url))
  const out = join(
    here,
    '../../../../tests/fixtures/contracts/templates',
  )
  writeAllTortureTemplates(out).then((rows) => {
    console.log(JSON.stringify(rows, null, 2))
  })
}
