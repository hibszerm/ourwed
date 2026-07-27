/**
 * Generic fixtures A–T for transform comparison (no private customer data).
 */

import { blocksFromPlainParagraphs } from '../indexDocxForTransform'
import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from '../types'

export const SAMPLE_DATASET: ContractTransformationDataset = {
  clients: {
    displayNames: 'Anna Kowalska i Jan Kowalski',
    personCount: 2,
    address: 'ul. Przykładowa 12, 00-001 Warszawa',
    phone: '500 100 200',
  },
  dates: {
    contractExecutionDate: '02.02.2027 r.',
    weddingDate: '24.07.2027 r.',
    finalPaymentDueDate: '24.07.2027 r.',
  },
  locations: {
    preparation: { displayName: 'Hotel Testowy' },
    ceremony: { displayName: 'Kościół Testowy' },
    reception: { displayName: 'Pałac w Izdebniku' },
  },
  finances: {
    contractValueFormatted: '9 500 zł',
    contractValueWords: 'dziewięć tysięcy pięćset złotych',
    depositFormatted: '1 500 zł',
    depositWords: 'tysiąc pięćset złotych',
    remainingFormatted: '8 000 zł',
    remainingWords: 'osiem tysięcy złotych',
  },
  package: { name: 'Foto Standard' },
}

export function fixtureSourceBlocks(): TransformDocumentBlock[] {
  return blocksFromPlainParagraphs([
    // A/C — single/two client + address/phone paragraph
    'z Aleksandrą Biłas, zam. ul. Stara 1, 30-001 Kraków, tel. 603 306 423, zwaną dalej Zleceniodawcą',
    // B covered by displayNames target
    'Umowa zawarta w dniu 30.10.2024 r.',
    // D locations
    'Przygotowania: Hotel Stary',
    'Ceremonia: Kościół Stary',
    'Przyjęcie: Rezydencja Lubomirskich',
    // E same venue prep+reception variant elsewhere
    'Powitanie gości w Rezydencji Lubomirskich',
    // F finances
    'Wynagrodzenie 8 000 zł (słownie: osiem tysięcy złotych). Zadatek 1 000 zł. Pozostała kwota 7 000 zł.',
    // G wedding date as final payment
    'pozostałą część wynagrodzenia Zamawiający zapłaci najpóźniej w dniu 19.06.2025r.',
    // H relative deposit
    'Zadatek płatny w terminie 7 dni od zawarcia umowy.',
    // I provider
    'Wykonawca: Studio Foto Test Sp. z o.o., NIP 1234567890, REGON 123456789, tel. 111 222 333. Rachunek: 12 3456 7890 1234 5678 9012 3456',
    // J unrelated hour rate
    'Stawka za dodatkową godzinę wynosi 800 zł.',
  ])
}

function mapBlocks(
  source: TransformDocumentBlock[],
  rewrite: (text: string, blockId: string, index: number) => string,
): TransformedBlock[] {
  return source.map((b, i) => ({
    blockId: b.blockId,
    text: rewrite(b.text, b.blockId, i),
  }))
}

/** K — AI changes only allowed values */
export function fixtureK_allowedOnly(
  source: TransformDocumentBlock[],
): TransformedBlock[] {
  return mapBlocks(source, (text) =>
    text
      .replace('Aleksandrą Biłas', 'Anną Kowalską i Janem Kowalskim')
      .replace('ul. Stara 1, 30-001 Kraków', 'ul. Przykładowa 12, 00-001 Warszawa')
      .replace('603 306 423', '500 100 200')
      .replace('zwaną dalej', 'zwani dalej')
      .replace('30.10.2024 r.', '02.02.2027 r.')
      .replace('Hotel Stary', 'Hotel Testowy')
      .replace('Kościół Stary', 'Kościół Testowy')
      .replace(/Rezydencji Lubomirskich/g, 'Pałacu w Izdebniku')
      .replace('Rezydencja Lubomirskich', 'Pałac w Izdebniku')
      .replace('8 000 zł', '9 500 zł')
      .replace('osiem tysięcy złotych', 'dziewięć tysięcy pięćset złotych')
      .replace('1 000 zł', '1 500 zł')
      .replace('7 000 zł', '8 000 zł')
      .replace('19.06.2025r.', '24.07.2027 r.'),
  )
}

/** L — provider data changed */
export function fixtureL_providerChanged(
  source: TransformDocumentBlock[],
): TransformedBlock[] {
  const base = fixtureK_allowedOnly(source)
  return base.map((b) => ({
    ...b,
    text: b.text
      .replace('Studio Foto Test Sp. z o.o.', 'Inne Studio SA')
      .replace('1234567890', '9999999999'),
  }))
}

/** M — unrelated business sentence rewritten */
export function fixtureM_businessRewrite(
  source: TransformDocumentBlock[],
): TransformedBlock[] {
  const base = fixtureK_allowedOnly(source)
  return base.map((b, i) =>
    i === 10
      ? {
          ...b,
          text:
            'Strony ustalają całkowicie nowe zasady rozliczeń godzin ponadprogramowych bez limitu.',
        }
      : b,
  )
}

/** N — block order changed */
export function fixtureN_reordered(
  source: TransformDocumentBlock[],
): TransformedBlock[] {
  const base = fixtureK_allowedOnly(source)
  return [base[1]!, base[0]!, ...base.slice(2)]
}

/** O — added paragraph */
export function fixtureO_added(
  source: TransformDocumentBlock[],
): TransformedBlock[] {
  return [
    ...fixtureK_allowedOnly(source),
    { blockId: 'para-extra', text: 'Dodatkowy akapit wygenerowany przez AI.' },
  ]
}

/** P — removed paragraph */
export function fixtureP_removed(
  source: TransformDocumentBlock[],
): TransformedBlock[] {
  return fixtureK_allowedOnly(source).slice(0, -1)
}

/** Q — local grammatical adjustment */
export function fixtureQ_localGrammar(
  source: TransformDocumentBlock[],
): TransformedBlock[] {
  return mapBlocks(source, (text, _id, i) => {
    if (i === 0) {
      return text.replace(
        'z Aleksandrą Biłas',
        'z Anną Kowalską i Janem Kowalskim',
      )
    }
    return text
  })
}

/** R — full sentence rewrite around one replacement */
export function fixtureR_sentenceRewrite(
  source: TransformDocumentBlock[],
): TransformedBlock[] {
  return mapBlocks(source, (text, _id, i) => {
    if (i === 2) {
      return 'Strony zgodnie postanawiają, że przygotowania odbędą się wyłącznie w Hotelu Testowym na warunkach ustalonych osobno.'
    }
    return text
  })
}

/** S — punctuation adjacent to replacement */
export function fixtureS_punctuation(
  source: TransformDocumentBlock[],
): TransformedBlock[] {
  return mapBlocks(source, (text, _id, i) => {
    if (i === 1) {
      return text.replace('30.10.2024 r.', '02.02.2027 r.')
    }
    return text
  })
}

/** T — unrelated number change (hour rate) */
export function fixtureT_unrelatedNumber(
  source: TransformDocumentBlock[],
): TransformedBlock[] {
  const base = fixtureK_allowedOnly(source)
  return base.map((b) => ({
    ...b,
    text: b.text.replace('800 zł', '1200 zł'),
  }))
}

/** Real-shaped multi-field client + mixed locations + deposit 1000 words. */
export const REAL_SHAPED_DATASET: ContractTransformationDataset = {
  clients: {
    displayNames: 'Anna Kowalska i Jan Kowalski',
    personCount: 2,
    address: 'ul. Przykładowa 12, 00-001 Warszawa',
    phone: '500 100 200',
  },
  dates: {
    contractExecutionDate: '02.02.2027 r.',
    weddingDate: '24.07.2027 r.',
    finalPaymentDueDate: '24.07.2027 r.',
  },
  locations: {
    preparation: {
      fullAddress: 'ul. Michała Grażyńskiego 5, 41-810 Zabrze',
    },
    ceremony: {
      displayName: 'Bazylika archikatedralna Wniebowzięcia NMP i św. Jana Chrzciciela w Rzeszowie',
    },
    reception: {
      fullAddress: 'ul. Lwowska, 34-144 Izdebnik',
    },
  },
  finances: {
    contractValueFormatted: '9 500 zł',
    contractValueWords: 'dziewięć tysięcy pięćset złotych',
    depositFormatted: '1 000 zł',
    depositWords: 'tysiąc złotych',
    remainingFormatted: '8 500 zł',
    remainingWords: 'osiem tysięcy pięćset złotych',
  },
  package: { name: 'Foto Standard' },
}

export function fixtureRealShapedSourceBlocks(): TransformDocumentBlock[] {
  return blocksFromPlainParagraphs([
    'z Aleksandrą Biłas, zam. ul. Stara 1, 30-001 Kraków, tel. 603 306 423, zwaną dalej Parą Młodą',
    'Umowa zawarta w dniu 30.10.2024 r.',
    'Przygotowania odbędą się w Retyradzie.',
    'Ceremonia odbędzie się w Rzeszowie.',
    'Przyjęcie odbędzie się w Rezydencji Lubomirskich.',
    'Wynagrodzenie 8 000 zł (słownie: osiem tysięcy złotych). Zadatek 1 500 zł (słownie: tysiąc pięćset złotych).',
    'Wykonawca: Studio Foto Test Sp. z o.o., NIP 1234567890, REGON 123456789, tel. 111 222 333. Rachunek: 12 3456 7890 1234 5678 9012 3456',
    'Stawka za dodatkową godzinę wynosi 800 zł.',
    'W razie odstąpienia od umowy stosuje się przepisy Kodeksu cywilnego.',
  ])
}

/** Correct real-shaped transform output (grammar-neutral addresses, agreement, money). */
export function fixtureRealShapedTransformed(
  source: TransformDocumentBlock[],
): TransformedBlock[] {
  return mapBlocks(source, (text, _id, i) => {
    if (i === 0) {
      return 'z Anną Kowalską i Janem Kowalskim, zam. ul. Przykładowa 12, 00-001 Warszawa, tel. 500 100 200, zwani dalej Parą Młodą'
    }
    if (i === 1) return text.replace('30.10.2024 r.', '02.02.2027 r.')
    if (i === 2) {
      return 'Przygotowania odbędą się pod adresem: ul. Michała Grażyńskiego 5, 41-810 Zabrze.'
    }
    if (i === 3) {
      return 'Ceremonia odbędzie się w Bazylice archikatedralnej Wniebowzięcia NMP i św. Jana Chrzciciela w Rzeszowie.'
    }
    if (i === 4) {
      return 'Przyjęcie odbędzie się pod adresem: ul. Lwowska, 34-144 Izdebnik.'
    }
    if (i === 5) {
      return 'Wynagrodzenie 9 500 zł (słownie: dziewięć tysięcy pięćset złotych). Zadatek 1 000 zł (słownie: tysiąc złotych).'
    }
    return text
  })
}

/** Bad reception form that must be warned. */
export function fixtureBadPrzyUl(source: TransformDocumentBlock[]): TransformedBlock[] {
  return fixtureRealShapedTransformed(source).map((b, i) =>
    i === 4
      ? {
          ...b,
          text: 'Przyjęcie odbędzie się przy ul. Lwowska.',
        }
      : b,
  )
}
