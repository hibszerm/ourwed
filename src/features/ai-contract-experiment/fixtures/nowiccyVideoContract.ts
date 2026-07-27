/**
 * Nowiccy video contract — regression fixture texts for mock adapters / tests.
 */

export const NOWICCY_FIXTURE = {
  clientParty: 'Michał Nowicki i Julia Nowicka',
  contractDate: '02.02.2027 r.',
  contractDateProse: 'zawarta w Poznaniu dnia 02.02.2027 r.',
  weddingDate: '24.07.2027 r.',
  location: 'Pałac Rydzyna, Rydzyna',
  totalFormatted: '6 000 zł',
  totalWords: 'sześć tysięcy złotych',
  provider: 'FilmGrafia Piotr Zawadzki',
  nip: '1234567890',
  regon: '123456789',
  bankAccount: 'PL61 1090 1014 0000 0712 1981 2874',
  deliveryPeriod: '10 tygodni',
  cancellationClause: '50%',
  orderingPartyHeading: 'Zamawiający',
  para37Remuneration:
    'Strony ustalają wynagrodzenie ryczałtowe za wykonanie przedmiotu Umowy w kwocie 6 000 zł (słownie: sześć tysięcy złotych) brutto, płatne jednorazowo, przelewem na rachunek Wykonawcy nr 55 1090 1043 0000 0001 2345 6789, najpóźniej w terminie 14 dni przed datą wydarzenia.',
  clientContactCell:
    'Michał Nowicki i Julia Nowicka, zam. os. Piastowskie 5/9, 61-136 Poznań, tel. 502 118 774',
  providerBankAccountMixed: '55 1090 1043 0000 0001 2345 6789',
  preparationStage: 'przygotowania Panny Młodej i Pana Młodego (do 2h);',
  ceremonyStage: 'ceremonię zaślubin;',
  receptionProse: 'wjazd i powitanie gości w Pałacu Rydzyna;',
} as const

/** Minimal paragraph list representing the Nowiccy source (tests / mocks). */
export function nowiccyFixtureParagraphs(): string[] {
  return [
    'Umowa o produkcję filmu ślubnego',
    NOWICCY_FIXTURE.contractDateProse,
    NOWICCY_FIXTURE.orderingPartyHeading,
    NOWICCY_FIXTURE.clientParty,
    `Data wydarzenia: ${NOWICCY_FIXTURE.weddingDate}`,
    `Miejsce przyjęcia: ${NOWICCY_FIXTURE.location}`,
    NOWICCY_FIXTURE.preparationStage,
    NOWICCY_FIXTURE.ceremonyStage,
    NOWICCY_FIXTURE.receptionProse,
    `łączne wynagrodzenie w wysokości ${NOWICCY_FIXTURE.totalFormatted} (słownie: ${NOWICCY_FIXTURE.totalWords}) brutto.`,
    `Wykonawca: ${NOWICCY_FIXTURE.provider}, NIP ${NOWICCY_FIXTURE.nip}, REGON ${NOWICCY_FIXTURE.regon}.`,
    `Rachunek bankowy: ${NOWICCY_FIXTURE.bankAccount}`,
    `Termin oddania materiału: ${NOWICCY_FIXTURE.deliveryPeriod} od dnia uroczystości.`,
    `W przypadku rezygnacji Zamawiającego potrąca się ${NOWICCY_FIXTURE.cancellationClause} wynagrodzenia.`,
    'Pakiet obejmuje: teaser 60–90 s, film główny do 20 minut.',
  ]
}
