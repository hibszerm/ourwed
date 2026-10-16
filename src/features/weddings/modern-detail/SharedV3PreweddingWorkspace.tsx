import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { collaborativePreweddingService } from '@/features/collaboration/collaborativePreweddingService'
import { CanonicalQuestionAnswer } from '@/features/prewedding/CanonicalQuestionAnswer'
import { PreWeddingDayPlan } from '@/features/prewedding/PreWeddingDayPlan'
import type { PreWeddingAnswerValue } from '@/types/preweddingQuestionnaire'
import { weddingDetailAuthorityQueryKey } from '@/features/weddings/detail/weddingDetailAuthority'
import styles from './SharedV3PreweddingWorkspace.module.css'

export function SharedV3PreweddingWorkspace({ weddingId, userId, accessVersion, level }: {
  weddingId: string; userId: string; accessVersion: string; level: 0 | 1 | 2
}) {
  const client = useQueryClient()
  useEffect(() => {
    if (level === 0) client.removeQueries({ queryKey: ['collaborative-prewedding-v3', userId, weddingId] })
  }, [client, level, userId, weddingId])
  if (level === 0) return null
  return <EnabledSharedPreweddingWorkspace weddingId={weddingId} userId={userId} accessVersion={accessVersion} level={level} />
}

function EnabledSharedPreweddingWorkspace({ weddingId, userId, accessVersion, level }: {
  weddingId: string; userId: string; accessVersion: string; level: 1 | 2
}) {
  const client = useQueryClient()
  const key = ['collaborative-prewedding-v3', userId, weddingId, accessVersion] as const
  const query = useQuery({ queryKey: key, queryFn: () => collaborativePreweddingService.get(weddingId), retry: false, staleTime: 0 })
  const [localAnswers, setLocalAnswers] = useState<Record<string, unknown> | null>(null)
  const [localResponseRevision, setLocalResponseRevision] = useState<string | null>(null)
  const [localTimeRevisions, setLocalTimeRevisions] = useState<Record<string, string>>({})
  const dirtyAnswers = useMemo(() => new Set<string>(), [])
  const [feedback, setFeedback] = useState('')
  const projection = query.data
  const displayAnswers = localAnswers ?? projection?.questionnaire?.answers ?? {}
  useEffect(() => {
    if (projection?.access_version !== accessVersion || projection?.prewedding_level !== level) {
      if (projection) void query.refetch()
    }
  }, [accessVersion, level, projection, query])
  useEffect(() => {
    client.removeQueries({ predicate: (item) => Array.isArray(item.queryKey)
      && item.queryKey[0] === 'collaborative-prewedding-v3' && item.queryKey[1] === userId
      && item.queryKey[2] === weddingId && item.queryKey[3] !== accessVersion })
  }, [accessVersion, client, userId, weddingId])
  useEffect(() => {
    if (!query.isError) return
    client.removeQueries({ queryKey: ['collaborative-prewedding-v3', userId, weddingId] })
    void client.invalidateQueries({ queryKey: weddingDetailAuthorityQueryKey(userId, weddingId), exact: true })
  }, [client, query.isError, userId, weddingId])

  const answerMutation = useMutation({
    mutationFn: async ({ id, value, clear }: { id: string; value?: unknown; clear?: boolean }) => {
      const current = query.data?.questionnaire
      if (!current || level < 2) throw new Error('FORBIDDEN')
      return collaborativePreweddingService.saveAnswer({ weddingId, questionnaireId: current.id, questionId: id,
        value, clear, accessVersion, responseRevision: localResponseRevision ?? current.response_revision })
    },
    onSuccess: async (saved) => {
      setLocalAnswers(saved.answers)
      setLocalResponseRevision(saved.response_revision)
      setFeedback('Zapisano.')
      await client.invalidateQueries({ queryKey: key, exact: true })
    },
    onError: async () => {
      setFeedback('Zmiana nie została zapisana. Twoja wersja pozostaje na ekranie; odśwież dane przed ponownym zapisem.')
      await client.invalidateQueries({ queryKey: key, exact: true })
    },
  })
  const timeMutation = useMutation({
    mutationFn: async ({ stop, time, revision }: { stop: string; time: string | null; revision: string }) =>
      collaborativePreweddingService.saveTime({ weddingId, stopKey: stop, time, accessVersion, revision }),
    onSuccess: async (saved, variables) => {
      setLocalTimeRevisions((previous) => ({ ...previous, [variables.stop]: saved.revision }))
      setFeedback('Zapisano.')
      await client.invalidateQueries({ queryKey: key, exact: true })
    },
    onError: async () => {
      setFeedback('Zmiana godziny nie została zapisana. Odśwież dane przed ponownym zapisem.')
      await client.invalidateQueries({ queryKey: key, exact: true })
    },
  })

  if (query.isPending) return <p role="status">Ładowanie ankiety…</p>
  if (query.isError || !projection || projection.prewedding_level < 1) return <p role="alert">Nie można otworzyć ankiety.</p>
  return <section className={styles.root} data-testid="shared-v3-prewedding" data-level={level}>
    {feedback ? <p role="status">{feedback}</p> : null}
    {projection.questionnaire ? <>
      <header><p className={styles.eyebrow}>Ankieta przedślubna</p><h2>{projection.questionnaire.title || 'Ankieta przedślubna'}</h2>
        {projection.questionnaire.introduction ? <p>{projection.questionnaire.introduction}</p> : null}
        <p>Status: {{ awaiting: 'Oczekuje', in_progress: 'W trakcie', completed: 'Ukończona' }[projection.questionnaire.status]} · {projection.questionnaire.answered_required}/{projection.questionnaire.total_required}</p></header>
      {projection.questionnaire.schema.sections.map((section) => <section key={section.id} className={styles.section}>
        <h3>{section.title}</h3>{section.description ? <p>{section.description}</p> : null}
        {section.questions.filter((question) => !question.hidden).map((question) => {
          const answers = localAnswers ?? projection.questionnaire!.answers
          const value = answers[question.id] as PreWeddingAnswerValue
          const editing = level >= 2 && question.type !== 'information'
          return <article className={styles.answer} key={question.id}>
            {editing ? <>
              <div onBlur={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null) || !dirtyAnswers.has(question.id)) return
                dirtyAnswers.delete(question.id)
                answerMutation.mutate({ id: question.id, value: answers[question.id] })
              }}><CanonicalQuestionAnswer question={question} value={value} mode="edit" saving={answerMutation.isPending} conflict={feedback.includes('nie została zapisana')} onChange={(next) => {
                setLocalAnswers((previous) => ({ ...(previous ?? projection.questionnaire!.answers), [question.id]: next }))
                dirtyAnswers.add(question.id)
              }} /></div>
              {value !== undefined ? <button type="button" disabled={answerMutation.isPending} onClick={() => {
                setLocalAnswers((previous) => { const next = { ...(previous ?? projection.questionnaire!.answers) }; delete next[question.id]; return next })
                dirtyAnswers.delete(question.id)
                answerMutation.mutate({ id: question.id, clear: true })
              }}>Wyczyść odpowiedź</button> : null}
            </> : <CanonicalQuestionAnswer question={question} value={value} mode="read" />}
          </article>
        })}
      </section>)}
    </> : <p>Brak przygotowanej ankiety.</p>}
    <section className={styles.section} aria-labelledby="shared-plan-day-heading">
      <h2 id="shared-plan-day-heading">Plan dnia</h2>
      <PreWeddingDayPlan
        weddingId={weddingId}
        schema={projection.questionnaire?.schema ?? { sections: [] }}
        answers={displayAnswers}
        presentation="modern"
        sharedData={projection.plan_day}
        capabilities={{ canEditTimes: level >= 2, canReorderPlaces: false, canRecalculateRoute: false }}
        onOperationalTimeChange={async (stop, time) => {
          const current = projection.plan_day.times.find((row) => row.stop_key === stop)
          const revision = localTimeRevisions[stop] ?? current?.revision ?? '0'
          await timeMutation.mutateAsync({ stop, time, revision })
        }}
      />
    </section>
  </section>
}
