/**
 * K3 capability generator — writes feature-owned capability modules from verified inventory.
 * Run once from isolate root: node scripts/k3-generate-capabilities.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const V = '2026-09-19'

const EXPLAIN = {
  canExplain: true,
  canNavigate: true,
  canExecute: false,
  requiresConfirmation: false,
}

/** @type {Array<{file:string, owner:string, caps:any[]}>} */
const bundles = []

function cap(partial) {
  return {
    permissions: { ...EXPLAIN, canNavigate: partial.nav ? true : (partial.permissions?.canNavigate ?? true) },
    knowledge: partial.knowledge ?? { mode: 'static' },
    provenance: {
      ownerFeature: partial.owner,
      verifiedAgainst: partial.verified,
      lastVerified: V,
    },
    ...partial,
    permissions: {
      canExplain: true,
      canNavigate: Boolean(partial.navigation),
      canExecute: false,
      requiresConfirmation: false,
    },
  }
}

// --- WEDDINGS ---
const weddings = [
  cap({ id:'weddings.list', domain:'weddings', owner:'weddings', title:'Lista zleceń',
    summary:'Listę potwierdzonych zleceń (ślubów) otwierasz w Śluby.',
    help:{ steps:['Przejdź do Śluby (/sluby).','Przeglądaj, filtruj i otwieraj karty zleceń.'] },
    navigation:{ routePattern:'/sluby', deepLinkQuality:'direct' },
    verified:['layouts/Sidebar.tsx','routes/router.tsx#/sluby'] }),
  cap({ id:'weddings.create', domain:'weddings', owner:'weddings', title:'Dodaj zlecenie',
    summary:'Potwierdzone zlecenie dodajesz ręcznie, importem albo ankietą do umowy.',
    help:{ steps:['Otwórz Śluby.','Wybierz Dodaj zlecenie (/sluby/nowy) albo Importuj.','Uzupełnij dane i zapisz.'],
      notes:['OurWed przechowuje potwierdzone zlecenia, nie zapytania.','Import nie wysyła wiadomości do par.'] },
    navigation:{ routePattern:'/sluby/nowy', deepLinkQuality:'direct' },
    verified:['guideEducationContent.ts#zlecenia','routes/router.tsx#/sluby/nowy'] }),
  cap({ id:'weddings.import', domain:'weddings', owner:'weddings', title:'Importuj zlecenia',
    summary:'Import przenosi podstawowe dane zleceń z Excel/CSV — datę, parę, kontakt, wartość i notatkę. Przed zapisem widzisz podgląd i ostrzeżenia.',
    help:{ steps:['Otwórz Śluby → Importuj (/sluby/import).','Wgraj arkusz i sprawdź podgląd.','Potwierdź import.'],
      notes:['Import nie wysyła wiadomości do par.'] },
    navigation:{ routePattern:'/sluby/import', deepLinkQuality:'direct' },
    verified:['guideEducationContent.ts#zlecenia','routes/router.tsx#/sluby/import','firstRunRoutes.ts'] }),
  cap({ id:'weddings.open', domain:'weddings', owner:'weddings', title:'Otwórz zlecenie',
    summary:'Kartę zlecenia otwierasz z listy Śluby; dalej pracujesz w zakładkach przestrzeni roboczej.',
    help:{ steps:['Przejdź do Śluby.','Wybierz zlecenie.','Użyj zakładek: Przegląd, Dzień ślubu, Umowa i finanse, Ankieta przedślubna, Historia.'] },
    navigation:{ routePattern:'/sluby/:weddingId', contextKeys:['weddingId'], deepLinkQuality:'context_required' },
    knowledge:{ mode:'contextual', contextRequirements:['weddingId'] },
    verified:['routes/router.tsx#/sluby/:id','weddingWorkspaceSelectors.ts#WORKSPACE_TABS'] }),
  cap({ id:'weddings.edit_couple', domain:'weddings', owner:'weddings', title:'Edytuj dane pary',
    summary:'Dane pary (imiona, kontakty, adres) edytujesz na karcie zlecenia — zwykle z przeglądu lub menu edycji tożsamości.',
    help:{ steps:['Otwórz zlecenie.','Uruchom edycję danych pary / tożsamości.','Zapisz zmiany.'],
      notes:['Dokładna etykieta przycisku zależy od wariantu Classic/Modern workspace.'] },
    navigation:{ routePattern:'/sluby/:weddingId?tab=overview', contextKeys:['weddingId'], deepLinkQuality:'route_only' },
    knowledge:{ mode:'contextual', contextRequirements:['weddingId'] },
    verified:['WeddingHeaderActions.tsx','weddingDetailEditAcceptance.test.ts'] }),
  cap({ id:'weddings.contacts', domain:'weddings', owner:'weddings', title:'Kontakty zlecenia',
    summary:'Telefony i kontakty pary są częścią danych zlecenia; asystent odczytuje je z CRM, a edycja odbywa się w danych pary na karcie.',
    help:{ steps:['Otwórz zlecenie.','Edytuj dane kontaktowe pary.','Zapisz.'] },
    navigation:{ routePattern:'/sluby/:weddingId', contextKeys:['weddingId'], deepLinkQuality:'route_only' },
    knowledge:{ mode:'contextual', contextRequirements:['weddingId'] },
    verified:['contactService','WEDDING.DISPLAY_NAME/CONTACT concepts'] }),
  cap({ id:'weddings.archive', domain:'weddings', owner:'weddings', title:'Zarchiwizuj zlecenie',
    summary:'Zlecenie możesz zarchiwizować z menu akcji na karcie (nagłówek). Archiwizacja wymaga potwierdzenia.',
    help:{ steps:['Otwórz zlecenie.','Otwórz menu akcji w nagłówku.','Wybierz archiwizację i potwierdź.'],
      notes:['Asystent nie wykonuje archiwizacji — tylko wyjaśnia procedurę.'] },
    navigation:{ routePattern:'/sluby/:weddingId', contextKeys:['weddingId'], deepLinkQuality:'route_only' },
    knowledge:{ mode:'contextual', contextRequirements:['weddingId'] },
    verified:['WeddingHeaderActions.tsx#wedding-menu-archive'] }),
  cap({ id:'weddings.delete', domain:'weddings', owner:'weddings', title:'Usuń zlecenie',
    summary:'Trwałe usunięcie zlecenia jest dostępne z menu akcji na karcie i wymaga potwierdzenia (w tym wpisania potwierdzenia).',
    help:{ steps:['Otwórz zlecenie.','Menu akcji → Usuń.','Potwierdź zgodnie z dialogiem.'],
      notes:['Operacja destrukcyjna — asystent jej nie wykonuje.'] },
    navigation:{ routePattern:'/sluby/:weddingId', contextKeys:['weddingId'], deepLinkQuality:'route_only' },
    knowledge:{ mode:'contextual', contextRequirements:['weddingId'] },
    verified:['WeddingHeaderActions.tsx#wedding-menu-delete'] }),
  cap({ id:'weddings.contract_recovery', domain:'weddings', owner:'weddings', title:'Uzupełnij zlecenie z umowy',
    summary:'Możesz dołączyć istniejącą umowę PDF/DOCX i przenieść zaproponowane dane do zlecenia — Ty akceptujesz propozycje.',
    help:{ steps:['Otwórz ścieżkę uzupełniania z umowy (/sluby/:id/uzupelnij-z-umowy) lub funkcję na karcie.','Wgraj dokument.','Zaakceptuj wybrane propozycje danych.'],
      notes:['OurWed nie podpisuje elektronicznie ani nie wysyła umowy mailem.'] },
    navigation:{ routePattern:'/sluby/:weddingId/uzupelnij-z-umowy', contextKeys:['weddingId'], deepLinkQuality:'context_required' },
    knowledge:{ mode:'contextual', contextRequirements:['weddingId'] },
    verified:['guideEducationContent.ts#umowy','routes/router.tsx#uzupelnij-z-umowy'] }),
  cap({ id:'weddings.tab.overview', domain:'weddings', owner:'weddings', title:'Zakładka Przegląd',
    summary:'Zakładka Przegląd na karcie zlecenia pokazuje skrót statusu i kluczowe informacje.',
    help:{ steps:['Otwórz zlecenie.','Wybierz zakładkę Przegląd (?tab=overview).'] },
    navigation:{ routePattern:'/sluby/:weddingId?tab=overview', contextKeys:['weddingId'], deepLinkQuality:'context_required' },
    knowledge:{ mode:'contextual', contextRequirements:['weddingId'] },
    verified:['weddingWorkspaceSelectors.ts#WORKSPACE_TABS'] }),
  cap({ id:'weddings.tab.wedding_day', domain:'weddings', owner:'weddings', title:'Zakładka Dzień ślubu',
    summary:'Zakładka Dzień ślubu służy do harmonogramu, miejsc i ustaleń dnia realizacji.',
    help:{ steps:['Otwórz zlecenie.','Wybierz Dzień ślubu (?tab=wedding_day).'] },
    navigation:{ routePattern:'/sluby/:weddingId?tab=wedding_day', contextKeys:['weddingId'], deepLinkQuality:'context_required' },
    knowledge:{ mode:'contextual', contextRequirements:['weddingId'] },
    verified:['weddingWorkspaceSelectors.ts#WORKSPACE_TABS'] }),
  cap({ id:'weddings.tab.contract_finance', domain:'weddings', owner:'weddings', title:'Zakładka Umowa i finanse',
    summary:'Zakładka Umowa i finanse zbiera umowę, pakiet, wpłaty i ustalenia komercyjne.',
    help:{ steps:['Otwórz zlecenie.','Wybierz Umowa i finanse (?tab=contract_finance).'] },
    navigation:{ routePattern:'/sluby/:weddingId?tab=contract_finance', contextKeys:['weddingId'], deepLinkQuality:'context_required' },
    knowledge:{ mode:'contextual', contextRequirements:['weddingId'] },
    verified:['weddingWorkspaceSelectors.ts#WORKSPACE_TABS'] }),
  cap({ id:'weddings.tab.pre_wedding_questionnaire', domain:'weddings', owner:'weddings', title:'Zakładka Ankieta przedślubna',
    summary:'Zakładka Ankieta przedślubna służy do wysyłki i statusu ankiety dnia ślubu.',
    help:{ steps:['Otwórz zlecenie.','Wybierz Ankieta przedślubna (?tab=pre_wedding_questionnaire).'] },
    navigation:{ routePattern:'/sluby/:weddingId?tab=pre_wedding_questionnaire', contextKeys:['weddingId'], deepLinkQuality:'context_required' },
    knowledge:{ mode:'contextual', contextRequirements:['weddingId'] },
    verified:['weddingWorkspaceSelectors.ts#WORKSPACE_TABS'] }),
  cap({ id:'weddings.tab.activity', domain:'weddings', owner:'weddings', title:'Zakładka Historia',
    summary:'Zakładka Historia pokazuje aktywność zlecenia; stąd też edytujesz notatki w wariantach Modern.',
    help:{ steps:['Otwórz zlecenie.','Wybierz Historia (?tab=activity).'] },
    navigation:{ routePattern:'/sluby/:weddingId?tab=activity', contextKeys:['weddingId'], deepLinkQuality:'context_required' },
    knowledge:{ mode:'contextual', contextRequirements:['weddingId'] },
    verified:['weddingWorkspaceSelectors.ts#WORKSPACE_TABS','ModernWeddingHistoriaWorkspace.tsx'] }),
  cap({ id:'weddings.notes', domain:'weddings', owner:'weddings', title:'Notatki zlecenia',
    summary:'Notatki do zlecenia dodajesz i edytujesz na karcie zlecenia (m.in. Historia / sekcja notatek).',
    help:{ steps:['Otwórz zlecenie.','Otwórz sekcję notatek lub Edytuj notatki.','Dodaj treść i zapisz.'],
      notes:['Asystent nie odczytuje treści notatek użytkownikowi (ograniczenie prywatności/produktu).'] },
    navigation:{ routePattern:'/sluby/:weddingId?tab=activity', contextKeys:['weddingId'], deepLinkQuality:'route_only' },
    knowledge:{ mode:'contextual', contextRequirements:['weddingId'] },
    verified:['AddNoteModal.tsx','NotesSection.tsx'] }),
]
bundles.push({ file:'src/features/weddings/capabilities/weddingsCapabilities.ts', owner:'weddings', caps:weddings, exportName:'weddingsCapabilities' })

// continue in part 2 via same script - I'll append more domains
