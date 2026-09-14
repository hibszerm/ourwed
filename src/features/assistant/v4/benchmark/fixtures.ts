/** Synthetic semantic contexts for multi-turn interpretation fixtures. */

import type { TaskSpecSemanticContext } from '../taskSpec'

export const FIXTURE_PREP_SEQUENCE: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  activeParticipantHint: 'Maks',
  previousOp: 'get_location',
  previousSubject: 'preparations',
  currentTopic: 'preparations',
  hasSequenceContext: true,
}

export const FIXTURE_FINANCE_REMAINING: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  previousOp: 'get_amount',
  previousSubject: 'remaining',
  currentTopic: 'finance',
  hasSequenceContext: false,
}

export const FIXTURE_BARTEK_UNRESOLVED: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  activeParticipantHint: 'Bartek',
  previousOp: 'get_location',
  previousSubject: 'preparations',
  currentTopic: 'preparations',
  hasSequenceContext: false,
}

/** ≥40 unseen Polish paraphrases for real-model QA (not copied from TaskSpec prompt). */
export const UNSEEN_PARAPHRASE_CASES: Array<{
  id: string
  userText: string
  semanticContext?: TaskSpecSemanticContext
  expectOp: string | string[]
  expectSubject?: string | string[] | null
}> = [
  { id: 'u01', userText: 'w której parafii mają ślub?', expectOp: 'get_location', expectSubject: 'ceremony' },
  { id: 'u02', userText: 'o której zaczyna się ceremonia?', expectOp: 'get_time', expectSubject: 'ceremony' },
  { id: 'u03', userText: 'gdzie robi makijaż panna młoda?', expectOp: 'get_location', expectSubject: 'preparations' },
  { id: 'u04', userText: 'ile kasy jeszcze brakuje?', expectOp: 'get_amount', expectSubject: 'remaining' },
  { id: 'u05', userText: 'czy zaliczka już weszła?', expectOp: ['get_amount', 'get'], expectSubject: ['deposit', 'paid'] },
  { id: 'u06', userText: 'gdzie mam być rano jako fotograf?', expectOp: 'get_location', expectSubject: ['assignment', 'preparations', 'schedule'] },
  { id: 'u07', userText: 'jak daleko stąd do sali?', expectOp: 'get_distance', expectSubject: ['reception', 'route'] },
  { id: 'u08', userText: 'policz mi śluby na październik', expectOp: 'count', expectSubject: ['wedding', 'assignment'] },
  { id: 'u09', userText: 'które zlecenie ma największy kontrakt?', expectOp: 'rank', expectSubject: 'contract_value' },
  { id: 'u10', userText: 'stwórz task na pojutrze: potwierdzić floristę', expectOp: 'prepare_create', expectSubject: 'task' },
  { id: 'u11', userText: 'nie Bartek tylko Maks', expectOp: 'correction', semanticContext: FIXTURE_BARTEK_UNRESOLVED },
  { id: 'u12', userText: 'a Kasia?', expectOp: 'inherit', semanticContext: FIXTURE_PREP_SEQUENCE },
  { id: 'u13', userText: 'no i co dalej w planie?', expectOp: 'get_next', semanticContext: FIXTURE_PREP_SEQUENCE },
  { id: 'u14', userText: 'termin płatności?', expectOp: 'get_time', expectSubject: ['payment', 'remaining'], semanticContext: FIXTURE_FINANCE_REMAINING },
  { id: 'u15', userText: 'gdzie jest dom pana młodego?', expectOp: 'get_location', expectSubject: 'preparations' },
  { id: 'u16', userText: 'o której kończą przygotowania?', expectOp: 'get_time', expectSubject: 'preparations' },
  { id: 'u17', userText: 'ile już spłacili z umowy?', expectOp: 'get_amount', expectSubject: 'paid' },
  { id: 'u18', userText: 'otwórz kartę wesela Nowaków', expectOp: 'open', expectSubject: 'wedding' },
  { id: 'u19', userText: 'jakie mam todo przy tym projekcie?', expectOp: ['list', 'get'], expectSubject: 'task' },
  { id: 'u20', userText: 'czy mogę zaktualizować kurs dolara?', expectOp: 'unsupported' },
  { id: 'u21', userText: 'gdzie startuję w piątek?', expectOp: 'get_location', expectSubject: 'assignment' },
  { id: 'u22', userText: 'suma zaległości za listopad', expectOp: 'sum', expectSubject: ['remaining', 'payment'] },
  { id: 'u23', userText: 'pokaż najtańszy pakiet we wrześniu', expectOp: 'rank', expectSubject: 'contract_value' },
  { id: 'u24', userText: 'a przyjęcie gdzie robią?', expectOp: 'get_location', expectSubject: 'reception', semanticContext: FIXTURE_PREP_SEQUENCE },
  { id: 'u25', userText: 'nie wrzesień tylko październik', expectOp: 'correction' },
  { id: 'u26', userText: 'ile kilometrów do Julii na gotowanie się?', expectOp: 'get_distance', expectSubject: 'preparations' },
  { id: 'u27', userText: 'co po ceremonii?', expectOp: 'get_next', semanticContext: FIXTURE_PREP_SEQUENCE },
  { id: 'u28', userText: 'gdzie oni biorą ślub cywilny?', expectOp: 'get_location', expectSubject: 'ceremony' },
  { id: 'u29', userText: 'przypomnij mi listę sesji w tym tygodniu', expectOp: ['list', 'get'], expectSubject: ['session', 'assignment', 'schedule'] },
  { id: 'u30', userText: 'dużo im brakuje do spłaty?', expectOp: 'get_amount', expectSubject: 'remaining' },
  { id: 'u31', userText: 'a on gdzie się szykuje?', expectOp: ['get_location', 'inherit'], expectSubject: 'preparations', semanticContext: FIXTURE_PREP_SEQUENCE },
  { id: 'u32', userText: 'ustaw zadanie: wysłać galerię w środę', expectOp: 'prepare_create', expectSubject: 'task' },
  { id: 'u33', userText: 'które wesele ma najmniejszą dopłatę?', expectOp: 'rank', expectSubject: 'remaining' },
  { id: 'u34', userText: 'gdzie mam parking przy sali?', expectOp: ['get_location', 'unsupported'], expectSubject: ['reception', 'unknown'] },
  { id: 'u35', userText: 'nie wartość, tylko ile wpłacili', expectOp: 'correction', semanticContext: FIXTURE_FINANCE_REMAINING },
  { id: 'u36', userText: 'o której zaczynam u nich?', expectOp: ['get_time', 'get_location'], expectSubject: ['assignment', 'preparations', 'schedule'] },
  { id: 'u37', userText: 'ile mam freelancowych sesji?', expectOp: 'count', expectSubject: ['session', 'assignment'] },
  { id: 'u38', userText: 'przekaż im że spóźnię się 10 minut', expectOp: 'unsupported' },
  { id: 'u39', userText: 'gdzie kończę dzień?', expectOp: ['get_location', 'get_next'], expectSubject: ['assignment', 'reception', 'day_plan', 'schedule'] },
  { id: 'u40', userText: 'a deadline płatności jaki jest?', expectOp: 'get_time', expectSubject: ['payment', 'remaining'], semanticContext: FIXTURE_FINANCE_REMAINING },
  { id: 'u41', userText: 'czy Maks i Julia są w tym samym domu?', expectOp: ['get_location', 'unsupported'], expectSubject: ['preparations', 'unknown'] },
  { id: 'u42', userText: 'podsumuj plan dnia krótko', expectOp: ['get', 'list'], expectSubject: 'day_plan' },
]
