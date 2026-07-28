/**
 * Synthetic anonymized DOCX-like contract text for recovery quality fixtures.
 */
export const RECOVERY_FIXTURE_SIMPLE_CONTRACT = `
UMOWA O ŚWIADCZENIE USŁUG FOTOGRAFICZNYCH I FILMOWYCH

Zawarta w dniu 11 kwietnia 2026 r. w Krakowie pomiędzy:

Wykonawca: Studio Filmowe Przykład Sp. z o.o., ul. Testowa 1, 30-001 Kraków
a
Zamawiający:
1) Kinga Testowa, zam. ul. Pomorska 12/4, 31-000 Kraków, tel. 530 702 125, e-mail: kinga.test@example.com
2) Adam Przykładowy, zam. ul. Pomorska 12/4, 31-000 Kraków

§1 Przedmiot umowy
Wykonawca zobowiązuje się do realizacji pakietu „Złoty Film” w dniu ślubu 03.06.2028.

Pakiet „Złoty Film” obejmuje:
• Teledysk ślubny o długości około 3 minut
• Film ślubny o długości około 15 minut
• Minimum 600 zdjęć po obróbce
• Galeria internetowa
• Mini sesja w dniu ślubu
• Zapowiedź 10–20 zdjęć do 7 dni od ślubu
• Przekazanie materiałów na pendrivie
• Dwóch operatorów

Czas realizacji reportażu: 10 godzin.
Termin przekazania materiałów: do 90 dni od daty ślubu.

§2 Wynagrodzenie
Całkowite wynagrodzenie wynosi 8.550,00 zł (słownie: osiem tysięcy pięćset pięćdziesiąt złotych).
Zaliczka: 2.000,00 zł płatna w terminie 7 dni od podpisania umowy.
Pozostała kwota płatna do dnia ślubu.

§3 Miejsca
Ceremonia: Kościół św. Testowego, Kraków
Przyjęcie: Sala Weselna Testowa, Kraków
`.trim()

export const RECOVERY_FIXTURE_NONSTANDARD_PACKAGE = `
UMOWA — pakiet niestandardowy

Data zawarcia: 2026-02-01
Zamawiający: Anna Klient, tel. 600 100 200
Data ślubu: 15.08.2027

Zakres usług (pakiet „Custom Drift”):
1. Reportaż od przygotowań do oczepin
2. Drone highlight 60 sekund (usługa niestandardowa)
3. Album 30x30 na zamówienie klienta
4. Dodatkowy operator tylko na ceremonię

Wynagrodzenie: 12 000 PLN, zaliczka 3 000 PLN.
`.trim()

export const RECOVERY_QUALITY_CHECKS = [
  'client_provider_separation',
  'signing_vs_wedding_date',
  'total_vs_deposit',
  'package_items_present',
  'evidence_present_for_non_null',
] as const
