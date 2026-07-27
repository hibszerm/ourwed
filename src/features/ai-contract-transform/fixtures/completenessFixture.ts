/**
 * Real-shaped regression fixture: table + body clauses + finances.
 * Synthetic data only — no private customer content.
 */

import { blocksFromTableFixture } from '../indexDocxForTransform'
import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from '../types'
import { polishContractMoneyWords } from '../polishContractMoneyWords'
import {
  renderCustomerAddress,
  renderLocationSummary,
  locationFromDatasetEntry,
  renderMultiLocationSummary,
  renderPreparationLocationClause,
  renderCeremonyLocationClause,
  renderReceptionLocationClause,
} from '../quality/locationRendering'

export const COMPLETENESS_DATASET: ContractTransformationDataset = {
  clients: {
    displayNames: 'Ewa Nowak i Piotr Nowak',
    personCount: 2,
    address: 'Juliusza Słowackiego 6/17, 41-800 Zabrze',
    phone: '501 502 503',
  },
  dates: {
    contractExecutionDate: '15.03.2027 r.',
    weddingDate: '24.07.2027 r.',
  },
  locations: {
    preparation: {
      fullAddress: 'ul. Michała Grażyńskiego 5, 41-810 Zabrze',
      city: 'Zabrze',
    },
    ceremony: {
      displayName: 'Bazylika św. Anny',
      city: 'Zabrze',
    },
    reception: {
      fullAddress: 'Lwowska, 34-144 Izdebnik',
      city: 'Izdebnik',
    },
  },
  finances: {
    contractValueFormatted: '10 500 zł',
    contractValueWords: polishContractMoneyWords(10_500),
    depositFormatted: '1 000 zł',
    depositWords: polishContractMoneyWords(1_000),
    remainingFormatted: '9 500 zł',
    remainingWords: polishContractMoneyWords(9_500),
  },
  package: { name: 'Foto Standard' },
}

/** Source document shaped like the real 45-block DOCX (compressed). */
export function completenessSourceBlocks(): TransformDocumentBlock[] {
  return blocksFromTableFixture({
    tables: [
      {
        tableIndex: 0,
        rows: [
          {
            cells: [
              'Zamawiający',
              'Aleksandra Biłas i Tomasz Biłas, zam. ul. Stara 1, 30-001 Kraków, tel. 603 306 423',
            ],
          },
          {
            cells: [
              'Wykonawca',
              'Studio Foto Test Sp. z o.o., NIP 1234567890, REGON 123456789, tel. 111 222 333',
            ],
          },
          { cells: ['Data wydarzenia', '19.06.2025 r.'] },
          { cells: ['Lokalizacja', 'Pałac Rydzyna, Rydzyna'] },
        ],
      },
      {
        tableIndex: 1,
        rows: [
          { cells: ['Materiał', 'Długość', 'W cenie'] },
          { cells: ['Film highlight', '10 min', 'Tak'] },
          { cells: ['Trailer', '60 s', 'Nie'] },
          { cells: ['Relacja foto', '8 h', 'Tak'] },
        ],
      },
    ],
    bodyParagraphs: [
      'Umowa nr 2024/12/UM-01 zawarta w dniu 30.10.2024 r.',
      'Przygotowania odbędą się w Pałacu Rydzyna.',
      'Ceremonia zaślubin odbędzie się w Kościele pw. św. Stanisława w Rydzynie.',
      'Powitanie gości i przyjęcie weselne odbędzie się w Pałacu Rydzyna.',
      'Termin realizacji materiału: 60 dni od wydarzenia.',
      'Wynagrodzenie wynosi 8 000 zł (słownie: osiem tysięcy złotych).',
      'Wynagrodzenie płatne jednorazowo przelewem na rachunek Wykonawcy.',
      'Rachunek bankowy: 12 3456 7890 1234 5678 9012 3456',
      'W razie odstąpienia od umowy potrąca się 30% wartości umowy.',
    ],
  })
}

/** Partial / unsafe transform: table location updated, body still has Pałac Rydzyna; payment still one-time. */
export function completenessPartialUnsafe(
  source: TransformDocumentBlock[],
): TransformedBlock[] {
  const addr = renderCustomerAddress(COMPLETENESS_DATASET.clients.address!)
  return source.map((b) => {
    let text = b.text
    if (b.blockId === 'table-0-row-0-cell-1-p-0') {
      text = `Ewa Nowak i Piotr Nowak, zam. ${addr}, tel. 501 502 503`
    } else if (b.blockId === 'table-0-row-2-cell-1-p-0') {
      text = '24.07.2027 r.'
    } else if (b.blockId === 'table-0-row-3-cell-1-p-0') {
      text = 'Lwowska, 34-144 Izdebnik'
    } else if (b.text.includes('30.10.2024')) {
      text = b.text.replace('30.10.2024 r.', '15.03.2027 r.')
    } else if (b.text.includes('8 000 zł')) {
      text = b.text
        .replace('8 000 zł', '10 500 zł')
        .replace('osiem tysięcy złotych', COMPLETENESS_DATASET.finances.contractValueWords)
    }
    // Intentionally leave Pałac Rydzyna in body + jednorazowo + old ceremony church
    return { blockId: b.blockId, text }
  })
}

/** Fully corrected document satisfying completeness + protection + finances. */
export function completenessFullyCorrected(
  source: TransformDocumentBlock[],
): TransformedBlock[] {
  const ds = COMPLETENESS_DATASET
  const addr = renderCustomerAddress(ds.clients.address!)
  const prep = locationFromDatasetEntry(ds.locations.preparation)!
  const ceremony = locationFromDatasetEntry(ds.locations.ceremony)!
  const reception = locationFromDatasetEntry(ds.locations.reception)!
  const summary = renderMultiLocationSummary({
    preparation: prep,
    ceremony,
    reception,
  })

  return source.map((b) => {
    if (b.blockId === 'table-0-row-0-cell-1-p-0') {
      return {
        blockId: b.blockId,
        text: `Ewa Nowak i Piotr Nowak, zam. ${addr}, tel. 501 502 503`,
      }
    }
    if (b.blockId === 'table-0-row-2-cell-1-p-0') {
      return { blockId: b.blockId, text: ds.dates.weddingDate }
    }
    if (b.blockId === 'table-0-row-3-cell-1-p-0') {
      return { blockId: b.blockId, text: summary }
    }
    if (/Umowa nr/i.test(b.text)) {
      return {
        blockId: b.blockId,
        text: `Umowa nr 2024/12/UM-01 zawarta w dniu ${ds.dates.contractExecutionDate}`,
      }
    }
    if (/Przygotowania/i.test(b.text)) {
      return {
        blockId: b.blockId,
        text: renderPreparationLocationClause(prep),
      }
    }
    if (/Ceremonia/i.test(b.text)) {
      return {
        blockId: b.blockId,
        text: renderCeremonyLocationClause(ceremony),
      }
    }
    if (/Powitanie|przyjęcie weselne/i.test(b.text)) {
      return {
        blockId: b.blockId,
        text: renderReceptionLocationClause(reception),
      }
    }
    if (/Wynagrodzenie wynosi/i.test(b.text)) {
      return {
        blockId: b.blockId,
        text: `Wynagrodzenie wynosi ${ds.finances.contractValueFormatted} (słownie: ${ds.finances.contractValueWords}).`,
      }
    }
    if (/płatne jednorazowo/i.test(b.text)) {
      return {
        blockId: b.blockId,
        text: `Zadatek ${ds.finances.depositFormatted} płatny w terminie 7 dni. Pozostała kwota ${ds.finances.remainingFormatted} płatna najpóźniej w dniu wydarzenia.`,
      }
    }
    return { blockId: b.blockId, text: b.text }
  })
}

export function expectedMoneyWords(): string {
  return polishContractMoneyWords(10_500)
}

export function expectedCustomerAddressRendered(): string {
  return renderCustomerAddress(COMPLETENESS_DATASET.clients.address!)
}

export function expectedReceptionSummary(): string {
  return renderLocationSummary(
    locationFromDatasetEntry(COMPLETENESS_DATASET.locations.reception)!,
  )
}
