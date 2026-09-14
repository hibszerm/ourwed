/**
 * Phase 2.5 correction / negative-correction benchmark expansion.
 */

import type { AssistantBenchmarkCase } from './corpus'
import type { TaskSpecExpectation } from '../expect'
import type { TaskSpecSemanticContext } from '../taskSpec'

const PREV_CONTRACT: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  previousOp: 'get_amount',
  previousSubject: 'contract_value',
  currentTopic: 'finance',
  previousTask: {
    op: 'get_amount',
    subject: 'contract_value',
    resourceKind: 'active_resource',
  },
}

const PREV_REMAINING: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  previousOp: 'get_amount',
  previousSubject: 'remaining',
  currentTopic: 'finance',
  previousTask: {
    op: 'get_amount',
    subject: 'remaining',
    resourceKind: 'active_resource',
  },
}

const PREV_JULIA_PREP: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  activeParticipantHint: 'Julia',
  previousOp: 'get_location',
  previousSubject: 'preparations',
  currentTopic: 'preparations',
  previousTask: {
    op: 'get_location',
    subject: 'preparations',
    participantValue: 'Julia',
    resourceKind: 'active_resource',
  },
}

const PREV_BARTEK: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  activeParticipantHint: 'Bartek',
  previousOp: 'get_location',
  previousSubject: 'preparations',
  previousTask: {
    op: 'get_location',
    subject: 'preparations',
    participantValue: 'Bartek',
    resourceKind: 'active_resource',
  },
}

const PREV_AUGUST: TaskSpecSemanticContext = {
  previousOp: 'count',
  previousSubject: 'wedding',
  lastTemporalPhrase: 'sierpień',
  currentTopic: 'collection',
  previousTask: {
    op: 'count',
    subject: 'wedding',
    temporalPhrase: 'sierpień',
    resourceKind: 'active_collection',
  },
}

const PREV_TOMORROW: TaskSpecSemanticContext = {
  previousOp: 'get_location',
  previousSubject: 'assignment',
  lastTemporalPhrase: 'jutro',
  previousTask: {
    op: 'get_location',
    subject: 'assignment',
    temporalPhrase: 'jutro',
  },
}

const PREV_CEREMONY: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  previousOp: 'get_location',
  previousSubject: 'ceremony',
  previousTask: {
    op: 'get_location',
    subject: 'ceremony',
    resourceKind: 'active_resource',
  },
}

const PREV_RANK_CONTRACT: TaskSpecSemanticContext = {
  previousOp: 'rank',
  previousSubject: 'contract_value',
  previousTask: {
    op: 'rank',
    subject: 'contract_value',
    rank: 'max',
  },
}

function corr(
  id: string,
  userText: string,
  ctx: TaskSpecSemanticContext,
  taskSpec: TaskSpecExpectation,
  tags: string[] = [],
): AssistantBenchmarkCase {
  return {
    id,
    category: 'corrections',
    input: { userText, semanticContext: ctx },
    expected: { taskSpec },
    tags: ['correction-matrix', 'phase25', ...tags],
  }
}

function neg(
  id: string,
  userText: string,
  ctx: TaskSpecSemanticContext,
  taskSpec: TaskSpecExpectation,
): AssistantBenchmarkCase {
  return {
    id,
    category: 'explicit_override',
    input: { userText, semanticContext: ctx },
    expected: {
      taskSpec: { ...taskSpec, forbidCorrection: true },
    },
    tags: ['negative-correction', 'phase25'],
  }
}

/** ≥30 positive corrections + ≥20 negative (not correction). */
export function buildCorrectionPhase25Cases(): AssistantBenchmarkCase[] {
  const positive: AssistantBenchmarkCase[] = [
    corr('c25-nie-julia-maks', 'nie Julia, Maks', PREV_JULIA_PREP, {
      op: 'correction',
      participantValue: 'Maks',
      correctionSlot: 'participant',
      requireCorrection: true,
    }),
    corr('c25-chodzilo-maks', 'chodziło mi o Maksa', PREV_BARTEK, {
      op: 'correction',
      participantValue: 'Maks',
      correctionSlot: 'participant',
      requireCorrection: true,
    }),
    corr('c25-mialem-maks', 'miałem na myśli Maksa', PREV_BARTEK, {
      op: 'correction',
      participantValue: 'Maks',
      correctionSlot: 'participant',
      requireCorrection: true,
    }),
    corr(
      'c25-nie-pana-panne',
      'nie pana młodego, pannę młodą',
      PREV_JULIA_PREP,
      {
        op: 'correction',
        participantValue: 'panna młod',
        correctionSlot: 'participant',
        requireCorrection: true,
      },
    ),
    corr('c25-nie-ja-jego', 'nie ją, jego', PREV_JULIA_PREP, {
      op: 'correction',
      correctionSlot: 'participant',
      requireCorrection: true,
    }),
    corr('c25-nie-sierpien', 'nie sierpień, wrzesień', PREV_AUGUST, {
      op: 'correction',
      temporalPhraseIncludes: ['wrześ', 'wrzes'],
      correctionSlot: 'temporal',
      requireCorrection: true,
    }),
    corr('c25-nie-jutro-sobota', 'nie jutro, w sobotę', PREV_TOMORROW, {
      op: 'correction',
      temporalPhraseIncludes: ['sobot'],
      correctionSlot: 'temporal',
      requireCorrection: true,
    }),
    corr('c25-nie-11-12', 'nie 11-go, 12-go', PREV_TOMORROW, {
      op: 'correction',
      temporalPhraseIncludes: ['12'],
      correctionSlot: 'temporal',
      requireCorrection: true,
    }),
    corr('c25-nie-wartosc-wplaty', 'nie wartość, tylko wpłaty', PREV_CONTRACT, {
      op: 'correction',
      patchSubject: ['paid', 'payment', 'deposit'],
      subject: ['paid', 'payment', 'deposit'],
      correctionSlot: 'metric',
      requireCorrection: true,
    }),
    corr(
      'c25-nie-wartosc-ile-wplacili',
      'nie wartość, tylko ile wpłacili',
      PREV_CONTRACT,
      {
        op: 'correction',
        patchSubject: ['paid', 'payment'],
        subject: ['paid', 'payment'],
        correctionSlot: 'metric',
        requireCorrection: true,
      },
    ),
    corr(
      'c25-nie-pozostalo-dali',
      'nie ile zostało, tylko ile już dali',
      PREV_REMAINING,
      {
        op: 'correction',
        patchSubject: ['paid', 'payment'],
        subject: ['paid', 'payment'],
        correctionSlot: 'metric',
        requireCorrection: true,
      },
    ),
    corr('c25-chodzi-o-zaliczke', 'chodzi o zaliczkę, nie całość', PREV_CONTRACT, {
      op: 'correction',
      patchSubject: ['deposit', 'paid'],
      subject: ['deposit', 'paid'],
      correctionSlot: 'metric',
      requireCorrection: true,
    }),
    corr('c25-chodzi-o-wplaty', 'chodzi mi o wpłaty', PREV_CONTRACT, {
      op: 'correction',
      patchSubject: ['paid', 'payment', 'deposit'],
      subject: ['paid', 'payment', 'deposit'],
      correctionSlot: 'metric',
      requireCorrection: true,
    }),
    corr('c25-nie-ceremonie-sale', 'nie ceremonię, salę', PREV_CEREMONY, {
      op: 'correction',
      patchSubject: 'reception',
      subject: 'reception',
      correctionSlot: 'subject',
      requireCorrection: true,
    }),
    corr(
      'c25-nie-prep-julia-maks',
      'nie przygotowania Julii, Maksa',
      PREV_JULIA_PREP,
      {
        op: 'correction',
        participantValue: 'Maks',
        correctionSlot: 'participant',
        requireCorrection: true,
      },
    ),
    corr(
      'c25-chodzilo-wesele-nie-slub',
      'chodziło mi o wesele, nie ślub',
      PREV_CEREMONY,
      {
        op: 'correction',
        patchSubject: ['reception', 'wedding'],
        subject: ['reception', 'wedding'],
        correctionSlot: 'subject',
        requireCorrection: true,
      },
    ),
    corr(
      'c25-nie-ten-slub-drugi',
      'nie ten ślub, ten drugi',
      {
        ...PREV_CONTRACT,
        previousTask: {
          op: 'get_amount',
          subject: 'remaining',
          resourceKind: 'active_resource',
        },
      },
      {
        op: 'correction',
        correctionSlot: 'resource',
        requireCorrection: true,
      },
    ),
    corr(
      'c25-nie-sesje-wesele',
      'nie sesję, wesele',
      {
        previousOp: 'open',
        previousSubject: 'session',
        previousTask: { op: 'open', subject: 'session' },
      },
      {
        op: 'correction',
        patchSubject: 'wedding',
        subject: 'wedding',
        correctionSlot: 'subject',
        requireCorrection: true,
      },
    ),
    corr(
      'c25-nie-najdrozsze-doplata',
      'nie najdroższe, tylko z największą dopłatą',
      PREV_RANK_CONTRACT,
      {
        op: 'correction',
        patchSubject: 'remaining',
        subject: 'remaining',
        correctionSlot: 'metric',
        requireCorrection: true,
      },
    ),
    corr('c25-raczej-maks', 'raczej Maks', PREV_BARTEK, {
      op: 'correction',
      participantValue: 'Maks',
      correctionSlot: 'participant',
      requireCorrection: true,
    }),
    corr('c25-nie-ona-on', 'nie ona, on', PREV_JULIA_PREP, {
      op: 'correction',
      correctionSlot: 'participant',
      requireCorrection: true,
    }),
    corr(
      'c25-nie-wrzesien-pazdziernik',
      'nie wrzesień, październik',
      {
        ...PREV_AUGUST,
        lastTemporalPhrase: 'wrzesień',
        previousTask: {
          op: 'count',
          subject: 'wedding',
          temporalPhrase: 'wrzesień',
        },
      },
      {
        op: 'correction',
        temporalPhraseIncludes: ['paździer', 'pazdzier'],
        correctionSlot: 'temporal',
        requireCorrection: true,
      },
    ),
    corr(
      'c25-nie-doplate-umowa',
      'nie dopłatę, wartość umowy',
      PREV_REMAINING,
      {
        op: 'correction',
        patchSubject: 'contract_value',
        subject: 'contract_value',
        correctionSlot: 'metric',
        requireCorrection: true,
      },
    ),
    corr('c25-myslalem-o-julii', 'myślałem o Julii', PREV_BARTEK, {
      op: 'correction',
      participantValue: 'Juli',
      correctionSlot: 'participant',
      requireCorrection: true,
    }),
    corr(
      'c25-nie-ceremonia-przyjecie',
      'nie ceremonia, przyjęcie',
      PREV_CEREMONY,
      {
        op: 'correction',
        patchSubject: 'reception',
        subject: 'reception',
        correctionSlot: 'subject',
        requireCorrection: true,
      },
    ),
    corr(
      'c25-nie-dzisiaj-jutro',
      'nie dzisiaj, jutro',
      {
        ...PREV_TOMORROW,
        lastTemporalPhrase: 'dzisiaj',
        previousTask: {
          op: 'get_location',
          subject: 'assignment',
          temporalPhrase: 'dzisiaj',
        },
      },
      {
        op: 'correction',
        temporalPhraseIncludes: ['jutro'],
        correctionSlot: 'temporal',
        requireCorrection: true,
      },
    ),
    corr(
      'c25-maksymilian',
      'chodzi o Maksymiliana',
      PREV_BARTEK,
      {
        op: 'correction',
        participantValue: 'Maksymilian',
        correctionSlot: 'participant',
        requireCorrection: true,
      },
    ),
    corr(
      'c25-nie-wartosc-umow-wplaty',
      'nie wartość umów, tylko wpłaty',
      PREV_CONTRACT,
      {
        op: 'correction',
        patchSubject: ['paid', 'payment'],
        subject: ['paid', 'payment'],
        correctionSlot: 'metric',
        requireCorrection: true,
      },
    ),
    corr(
      'c25-nie-prep-ceremonia',
      'nie przygotowania, ceremonia',
      PREV_JULIA_PREP,
      {
        op: 'correction',
        patchSubject: 'ceremony',
        subject: 'ceremony',
        correctionSlot: 'subject',
        requireCorrection: true,
      },
    ),
    corr(
      'c25-nie-min-max-doplata',
      'nie najmniejszą wartość, największą dopłatę',
      PREV_RANK_CONTRACT,
      {
        op: 'correction',
        patchSubject: 'remaining',
        subject: 'remaining',
        requireCorrection: true,
      },
    ),
  ]

  const negative: AssistantBenchmarkCase[] = [
    neg('n25-a-ile-wplacili', 'a ile już wpłacili?', PREV_CONTRACT, {
      op: 'get_amount',
      subject: 'paid',
    }),
    neg('n25-a-ceremonia-gdzie', 'a ceremonia gdzie?', PREV_JULIA_PREP, {
      op: 'get_location',
      subject: 'ceremony',
    }),
    neg('n25-a-w-sobote', 'a w sobotę?', PREV_TOMORROW, {
      op: ['get_location', 'get', 'list'],
      subject: ['assignment', 'schedule'],
      temporalPhraseIncludes: ['sobot'],
    }),
    neg('n25-a-slub-ktorej', 'a ślub o której będzie?', PREV_JULIA_PREP, {
      op: 'get_time',
      subject: 'ceremony',
    }),
    neg('n25-do-kiedy', 'do kiedy?', PREV_REMAINING, {
      op: 'get_time',
      subject: ['payment', 'remaining'],
      aspect: 'final_due',
    }),
    neg('n25-a-julka', 'a Julka?', PREV_BARTEK, {
      op: 'inherit',
      participantValue: 'Julka',
    }),
    neg('n25-a-potem', 'a potem?', {
      ...PREV_JULIA_PREP,
      hasSequenceContext: true,
    }, {
      op: 'get_next',
    }),
    neg('n25-gdzie-dzisiaj', 'gdzie dzisiaj jadę?', PREV_JULIA_PREP, {
      op: 'get_location',
      subject: 'assignment',
      temporalPhraseIncludes: ['dziś', 'dzisiaj'],
    }),
    neg('n25-ile-wisza', 'ile oni jeszcze wiszą?', PREV_CEREMONY, {
      op: 'get_amount',
      subject: 'remaining',
    }),
    neg('n25-a-wartosc', 'a wartość umowy?', PREV_REMAINING, {
      op: ['get_amount', 'get'],
      subject: 'contract_value',
    }),
    neg('n25-daleko-julii', 'daleko mam na przygotowania Julii?', PREV_CONTRACT, {
      op: 'get_distance',
      subject: 'preparations',
      participantValue: 'Juli',
    }),
    neg('n25-ile-wesel', 'ile mam wesel we wrześniu?', PREV_CONTRACT, {
      op: 'count',
      temporalPhraseIncludes: ['wrześ', 'wrzes'],
    }),
    neg('n25-pokaż-liste', 'pokaż listę', PREV_AUGUST, {
      op: 'list',
    }),
    neg('n25-a-gdzie', 'a gdzie?', PREV_JULIA_PREP, {
      op: ['get_location', 'inherit'],
    }),
    neg('n25-a-kiedy', 'a kiedy?', PREV_JULIA_PREP, {
      op: ['get_time', 'inherit'],
    }),
    neg('n25-co-mam-dzis', 'co mam dziś?', PREV_CONTRACT, {
      op: ['get', 'get_location', 'list'],
      subject: ['assignment', 'schedule'],
    }),
    neg('n25-otworz-wesele', 'otwórz wesele Kowalskich', PREV_CONTRACT, {
      op: 'open',
      subject: 'wedding',
    }),
    neg('n25-dodaj-zadanie', 'dodaj zadanie jutro: oddzwonić', PREV_CONTRACT, {
      op: 'prepare_create',
      subject: 'task',
    }),
    neg('n25-jaka-pogoda', 'jaka będzie pogoda?', PREV_CONTRACT, {
      op: 'unsupported',
    }),
    neg('n25-a-przyjecie', 'a gdzie mają przyjęcie?', PREV_JULIA_PREP, {
      op: 'get_location',
      subject: 'reception',
    }),
  ]

  return [...positive, ...negative]
}
