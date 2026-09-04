/**
 * Candidate template content normalization — owned Film / Fotografia / Foto+Film.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CANDIDATE_MUSIC_LABEL,
  CANDIDATE_MUSIC_OPTIONS_FILM,
  CANDIDATE_NO_FILM_OPTION,
  CANDIDATE_PUBLIC_INTRO,
  CANDIDATE_PUBLIC_TITLE,
  CANDIDATE_SCHEDULE_LABEL,
  CANDIDATE_TIPS_SECTION_TITLE,
  CANDIDATE_VENDORS_LABEL,
  SPEECH_QUESTION_ID,
  TIPS_ACK_ID,
  TIPS_INFO_ID,
  canonicalQuestionId,
  collectQuestionIds,
  hasGroupPhotoQuestion,
  mappingMap,
  normalizeCandidateTemplate,
  requiredFlagMap,
  restoreTipsHelpText,
  type CandidateKind,
} from '@/features/prewedding/candidateTemplateNormalization'
import type {
  PreWeddingQuestion,
  PreWeddingTemplateSchema,
} from '@/types/preweddingQuestionnaire'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS  ${message}`)
    passed++
  } else {
    console.error(`  FAIL  ${message}`)
    failed++
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    console.error(
      `  FAIL  ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
    failed++
  } else {
    console.log(`  PASS  ${message}`)
    passed++
  }
}

function run(name: string, fn: () => void) {
  console.log(`\n${name}`)
  fn()
}

function q(
  partial: Partial<PreWeddingQuestion> & Pick<PreWeddingQuestion, 'id' | 'label' | 'type'>,
): PreWeddingQuestion {
  return {
    required: true,
    ...partial,
  }
}

const filmBefore: PreWeddingTemplateSchema = {
  sections: [
    {
      id: 's6',
      title: 'Po ceremonii',
      questions: [
        q({
          id: 'q15',
          label: 'Życzenia od Gości',
          type: 'single_choice',
          options: ['A', 'B'],
          weddingDayMapping: 'guestWishesPlan',
        }),
      ],
    },
    {
      id: 's7',
      title: 'Przyjęcie weselne',
      questions: [
        q({
          id: 'q20',
          label:
            'Jeśli macie harmonogram wesela, podeślijcie mi go proszę na maila lub mojego instagrama.',
          type: 'short_text',
        }),
      ],
    },
    {
      id: 's8',
      title: 'Film',
      questions: [
        q({
          id: 'q22',
          label: 'Zazwyczaj sam wybieram licencjonowaną muzykę…',
          type: 'single_choice',
          options: ['Zdajemy się na Ciebie!', 'Za chwilę podeślemy coś naszego!'],
        }),
        q({
          id: 'q_1787599409254',
          label: 'Czy planujecie przemowy podczas Wesela?',
          type: 'long_text',
        }),
      ],
    },
    {
      id: 's9',
      title: 'Usługodawcy',
      questions: [
        q({
          id: 'q25',
          label: 'Wymieńcie mi proszę wszystkich Waszych usługodawców — często się wzajemnie polecamy :)',
          type: 'long_text',
        }),
      ],
    },
    {
      id: 's11',
      title: 'Wskazówki ode mnie :)',
      questions: [
        q({
          id: 'q27_info',
          label: '',
          type: 'information',
          required: false,
          helpText:
            'Łapcie kilka wskazówek ode mnie :)1. Podczas przysięgi.2. Na filmie.5. przed końcem mojej pracy.',
        }),
        q({
          id: TIPS_ACK_ID,
          label: 'Zapoznaliśmy się ze wskazówkami',
          type: 'acknowledgement',
        }),
      ],
    },
  ],
}

const photoBefore: PreWeddingTemplateSchema = {
  sections: [
    {
      id: 's_hash1',
      title: 'Po ceremonii',
      questions: [
        q({
          id: 'q_hash_group',
          label: 'Czy i gdzie chcecie zdjęcie grupowe ze wszystkimi gośćmi?',
          type: 'single_choice',
          options: ['Chcemy pod kościołem', 'Chcemy pod salą', 'Nie chcemy'],
          weddingDayMapping: 'groupPhotoPlan',
        }),
      ],
    },
    {
      id: 's_hash2',
      title: 'Przyjęcie',
      questions: [
        q({
          id: 'q_hash_sched',
          label: 'Jeśli macie harmonogram wesela, podeślijcie go proszę fotografowi.',
          type: 'short_text',
        }),
      ],
    },
    {
      id: 's_hash3',
      title: 'Zdjęcia i film',
      questions: [
        q({
          id: 'q_hash_music',
          label: 'Zazwyczaj sami wybieramy licencjonowaną muzykę…',
          type: 'single_choice',
          options: [
            'Zdajemy się na Ciebie!',
            'Za chwilę podeślemy coś naszego!',
            CANDIDATE_NO_FILM_OPTION,
          ],
        }),
      ],
    },
    {
      id: 's_hash4',
      title: 'Wskazówki od nas',
      questions: [
        q({
          id: 'q_hash_info',
          label: '',
          type: 'information',
          required: false,
          helpText: 'Łapcie kilka wskazówek ode mnie :)1. Jeden.2. Dwa.',
        }),
        q({
          id: 'q_hash_ack',
          label: 'Zapoznaliśmy się ze wskazówkami',
          type: 'acknowledgement',
        }),
      ],
    },
  ],
}

const combinedBefore: PreWeddingTemplateSchema = {
  sections: [
    {
      id: 's8',
      title: 'Zdjęcia i film',
      questions: [
        q({
          id: 'q22',
          label: 'Zazwyczaj sami wybieramy licencjonowaną muzykę…',
          type: 'single_choice',
          required: true,
          options: [
            'Zdajemy się na Ciebie!',
            'Za chwilę podeślemy coś naszego!',
            CANDIDATE_NO_FILM_OPTION,
          ],
        }),
        q({
          id: 'q_1787600002874',
          label: 'Czy planujecie przemowy podczas Wesela?',
          type: 'long_text',
          required: true,
        }),
      ],
    },
    {
      id: 's6',
      title: 'Po ceremonii',
      questions: [
        q({
          id: 'q14',
          label: 'Czy i gdzie chcecie zdjęcie grupowe ze wszystkimi gośćmi?',
          type: 'single_choice',
          options: ['Chcemy pod kościołem', 'Chcemy pod salą', 'Nie chcemy'],
          weddingDayMapping: 'groupPhotoPlan',
        }),
      ],
    },
  ],
}

function findQ(schema: PreWeddingTemplateSchema, id: string): PreWeddingQuestion | undefined {
  return schema.sections.flatMap((s) => s.questions).find((question) => question.id === id)
}

run('A/title/intro: normalized public copy', () => {
  const film = normalizeCandidateTemplate('film', {
    title: 'Krótka ankieta przedślubna :) ',
    introduction: 'Potrzebuję od Was kilku informacji',
    schema: filmBefore,
  })
  assertEqual(film.title, CANDIDATE_PUBLIC_TITLE, 'public title')
  assertEqual(film.introduction, CANDIDATE_PUBLIC_INTRO, 'public intro')
})

run('C: Film has no group-photo question', () => {
  const film = normalizeCandidateTemplate('film', {
    title: 'x',
    introduction: 'y',
    schema: filmBefore,
  })
  assert(!hasGroupPhotoQuestion(film.schema), 'Film has no group photo after normalize')
  assert(!hasGroupPhotoQuestion(filmBefore), 'Film had none before')
})

run('D: Fotografia retains Nie mamy filmu when the music question exists, and does not invent one', () => {
  const photo = normalizeCandidateTemplate('photography', {
    title: 'x',
    introduction: 'y',
    schema: photoBefore,
  })
  const music = findQ(photo.schema, 'q22')
  assert(Boolean(music), 'photography music is q22')
  assert(
    Boolean(music?.options?.includes(CANDIDATE_NO_FILM_OPTION)),
    'photography keeps Nie mamy filmu',
  )
  const withoutMusic: PreWeddingTemplateSchema = {
    sections: photoBefore.sections.map((section) => ({
      ...section,
      questions: section.questions.filter((question) => !/muzyk/i.test(question.label)),
    })),
  }
  const photoNoMusic = normalizeCandidateTemplate('photography', {
    title: 'x',
    introduction: 'y',
    schema: withoutMusic,
  })
  assert(
    !collectQuestionIds(photoNoMusic.schema).includes('q22'),
    'does not invent a music question',
  )
  assert(
    !JSON.stringify(photoNoMusic.schema).includes(CANDIDATE_NO_FILM_OPTION),
    'does not invent Nie mamy filmu',
  )
})

run('E: Foto+Film does not contain Nie mamy filmu', () => {
  const combined = normalizeCandidateTemplate('photo_video', {
    title: 'x',
    introduction: 'y',
    schema: combinedBefore,
  })
  const music = findQ(combined.schema, 'q22')
  assertEqual(music?.label, CANDIDATE_MUSIC_LABEL, 'combined music label')
  assert(
    !JSON.stringify(combined.schema).includes(CANDIDATE_NO_FILM_OPTION),
    'combined schema has no Nie mamy filmu',
  )
  assertEqual(music?.options?.join('|'), CANDIDATE_MUSIC_OPTIONS_FILM.join('|'), 'two film options')
})

run('F: tips helpText contains newline structure', () => {
  const restored = restoreTipsHelpText(
    'Łapcie kilka wskazówek ode mnie :)1. Podczas przysięgi.2. Na filmie.5. przed końcem mojej pracy.',
  )
  assert(restored.includes('\n1. '), 'newline before 1.')
  assert(restored.includes('\n2. '), 'newline before 2.')
  assert(restored.includes('od nas'), 'ode mnie → od nas')
  assert(restored.includes('naszej pracy'), 'mojej pracy → naszej pracy')
  assert(!restored.includes('ode mnie'), 'no ode mnie')
  const film = normalizeCandidateTemplate('film', {
    title: 'x',
    introduction: 'y',
    schema: filmBefore,
  })
  const tips = findQ(film.schema, TIPS_INFO_ID)
  assert(Boolean(tips?.helpText && tips.helpText.includes('\n')), 'stored helpText has newlines')
})

run('F2: public renderer and editor preserve tips newlines', () => {
  const publicForm = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingPublicFormPage.tsx'),
    'utf8',
  )
  assert(publicForm.includes("whiteSpace: 'pre-line'"), 'public form uses pre-line')
  const editor = readFileSync(
    resolve(process.cwd(), 'src/pages/PreWeddingTemplatesPage.tsx'),
    'utf8',
  )
  assert(editor.includes("question.type === 'information'"), 'editor special-cases information help')
  assert(editor.includes('question-help-textarea'), 'information help uses textarea')
})

run('G: Fotografia canonical IDs are stable', () => {
  const photo = normalizeCandidateTemplate('photography', {
    title: 'x',
    introduction: 'y',
    schema: photoBefore,
  })
  const ids = collectQuestionIds(photo.schema)
  assert(ids.includes('q14'), 'group photo → q14')
  assert(ids.includes('q20'), 'schedule → q20')
  assert(ids.includes('q22'), 'music → q22')
  assert(ids.includes(TIPS_INFO_ID), 'tips info')
  assert(ids.includes(TIPS_ACK_ID), 'tips ack')
  assert(!ids.some((id) => id.startsWith('q_hash') || id.startsWith('s_hash')), 'no hashed ids')
  assertEqual(new Set(ids).size, ids.length, 'no duplicate question ids')
})

run('H: speech question ID is stable across Film + Foto+Film', () => {
  const film = normalizeCandidateTemplate('film', {
    title: 'x',
    introduction: 'y',
    schema: filmBefore,
  })
  const combined = normalizeCandidateTemplate('photo_video', {
    title: 'x',
    introduction: 'y',
    schema: combinedBefore,
  })
  assertEqual(findQ(film.schema, SPEECH_QUESTION_ID)?.id, SPEECH_QUESTION_ID, 'film speeches')
  assertEqual(
    findQ(combined.schema, SPEECH_QUESTION_ID)?.id,
    SPEECH_QUESTION_ID,
    'combined speeches',
  )
  const photo = normalizeCandidateTemplate('photography', {
    title: 'x',
    introduction: 'y',
    schema: photoBefore,
  })
  assert(!collectQuestionIds(photo.schema).includes(SPEECH_QUESTION_ID), 'photo has no speeches')
})

run('I: no duplicate question ids', () => {
  for (const kind of ['film', 'photography', 'photo_video'] as CandidateKind[]) {
    const schema =
      kind === 'film' ? filmBefore : kind === 'photography' ? photoBefore : combinedBefore
    const ids = collectQuestionIds(
      normalizeCandidateTemplate(kind, { title: 'x', introduction: 'y', schema }).schema,
    )
    assertEqual(new Set(ids).size, ids.length, `${kind} unique ids`)
  }
})

run('J: mappings and required flags unchanged', () => {
  const film = normalizeCandidateTemplate('film', {
    title: 'x',
    introduction: 'y',
    schema: filmBefore,
  })
  assertEqual(
    JSON.stringify(requiredFlagMap(filmBefore)),
    JSON.stringify(requiredFlagMap(film.schema)),
    'film required map',
  )
  assertEqual(
    JSON.stringify(mappingMap(filmBefore)),
    JSON.stringify(mappingMap(film.schema)),
    'film mapping map',
  )
  const photo = normalizeCandidateTemplate('photography', {
    title: 'x',
    introduction: 'y',
    schema: photoBefore,
  })
  assertEqual(
    JSON.stringify(requiredFlagMap(photoBefore)),
    JSON.stringify(requiredFlagMap(photo.schema)),
    'photography required map',
  )
  assertEqual(
    JSON.stringify(mappingMap(photoBefore)),
    JSON.stringify(mappingMap(photo.schema)),
    'photography mapping map',
  )
  const combined = normalizeCandidateTemplate('photo_video', {
    title: 'x',
    introduction: 'y',
    schema: combinedBefore,
  })
  assertEqual(
    JSON.stringify(requiredFlagMap(combinedBefore)),
    JSON.stringify(requiredFlagMap(combined.schema)),
    'combined required map',
  )
  assertEqual(
    JSON.stringify(mappingMap(combinedBefore)),
    JSON.stringify(mappingMap(combined.schema)),
    'combined mapping map',
  )
  assertEqual(findQ(film.schema, 'q20')?.label, CANDIDATE_SCHEDULE_LABEL, 'schedule copy')
  assertEqual(findQ(film.schema, 'q22')?.label, CANDIDATE_MUSIC_LABEL, 'music copy')
  assertEqual(findQ(film.schema, 'q25')?.label, CANDIDATE_VENDORS_LABEL, 'vendors copy')
  assertEqual(
    film.schema.sections.find((s) => s.questions.some((question) => question.id === TIPS_INFO_ID))
      ?.title,
    CANDIDATE_TIPS_SECTION_TITLE,
    'tips section title',
  )
})

run('K: issued snapshots untouched — template update never writes wedding_questionnaires', () => {
  const service = readFileSync(
    resolve(process.cwd(), 'src/lib/api/preweddingQuestionnaireService.ts'),
    'utf8',
  )
  const start = service.indexOf('async update(\n    id: string,')
  const end = service.indexOf('async duplicate(', start)
  const body = service.slice(start, end)
  assert(start >= 0 && end > start, 'template update located')
  assert(!body.includes('wedding_questionnaires'), 'update does not write issued snapshots')
  assert(!body.includes('schema_snapshot_json'), 'update does not touch snapshot column')
  assert(!body.includes('source_key'), 'update does not assign source_key')
})

run('canonicalQuestionId maps Date.now speech ids', () => {
  assertEqual(
    canonicalQuestionId({
      id: 'q_1787599409254',
      label: 'Czy planujecie przemowy podczas Wesela?',
      type: 'long_text',
      required: true,
    }),
    SPEECH_QUESTION_ID,
    'date.now speech id',
  )
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
