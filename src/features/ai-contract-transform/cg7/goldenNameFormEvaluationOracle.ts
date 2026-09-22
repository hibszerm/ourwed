import type { EvaluationNameFormResolver } from '../semanticMappingExecutor'

type ApprovedPair = {
  canonicalIdentity: string
  nameForm: 'GENITIVE' | 'INSTRUMENTAL'
  resolvedIdentity: string
}

const approvedPairs: readonly ApprovedPair[] = [
  { canonicalIdentity: 'Zofia Kalendarzowa', nameForm: 'GENITIVE', resolvedIdentity: 'Zofii Kalendarzowej' },
  { canonicalIdentity: 'Zofia Kalendarzowa', nameForm: 'INSTRUMENTAL', resolvedIdentity: 'Zofią Kalendarzową' },
  { canonicalIdentity: 'Helena Mostowa', nameForm: 'GENITIVE', resolvedIdentity: 'Heleny Mostowej' },
  { canonicalIdentity: 'Adam Mostowy', nameForm: 'GENITIVE', resolvedIdentity: 'Adama Mostowego' },
  { canonicalIdentity: 'Natalia Brzegowa', nameForm: 'INSTRUMENTAL', resolvedIdentity: 'Natalią Brzegową' },
  { canonicalIdentity: 'Filip Brzegowy', nameForm: 'INSTRUMENTAL', resolvedIdentity: 'Filipem Brzegowym' },
  { canonicalIdentity: 'Barbara Atramentowa', nameForm: 'INSTRUMENTAL', resolvedIdentity: 'Barbarą Atramentową' },
]

/** Closed evaluation fixture only. Production paths do not import or inject this resolver. */
export const resolveGoldenEvaluationNameForm: EvaluationNameFormResolver = ({ canonicalIdentity, nameForm }) =>
  approvedPairs.find((pair) => pair.canonicalIdentity === canonicalIdentity && pair.nameForm === nameForm)?.resolvedIdentity

export const GOLDEN_EVALUATION_NAME_FORM_PAIR_COUNT = approvedPairs.length
