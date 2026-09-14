/**
 * Dump golden TaskSpecs via live Edge (auth via OURWED_ACCESS_TOKEN).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseFlatTaskSpecPayload } from '../taskSpecSchema'

const token = process.env.OURWED_ACCESS_TOKEN
if (!token) throw new Error('OURWED_ACCESS_TOKEN required')

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)]
    }),
)
const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY

async function interpret(utterance: string, ctx: unknown) {
  const started = Date.now()
  const res = await fetch(`${url}/functions/v1/ai-assistant`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mode: 'v4_interpret',
      utterance,
      locale: 'pl-PL',
      semanticContextSummary: ctx,
    }),
  })
  const body = (await res.json()) as Record<string, unknown>
  return {
    latency: Date.now() - started,
    status: body.status,
    taskSpec: parseFlatTaskSpecPayload(body.taskSpec),
  }
}

const CTX_PREP = {
  activeResourceKind: 'wedding',
  previousOp: 'get_location',
  previousSubject: 'preparations',
  currentTopic: 'preparations',
  hasSequenceContext: true,
  activeParticipantHint: 'Maks',
}
const CTX_FIN = {
  activeResourceKind: 'wedding',
  previousOp: 'get_amount',
  previousSubject: 'remaining',
  currentTopic: 'finance',
}
const CTX_BAR = {
  activeResourceKind: 'wedding',
  activeParticipantHint: 'Bartek',
  previousOp: 'get_location',
  previousSubject: 'preparations',
  currentTopic: 'preparations',
}

const goldens: Array<[string, string, unknown]> = [
  ['ceremony', 'a ślub o której będzie?', CTX_PREP],
  ['potem', 'a co potem?', CTX_PREP],
  ['today', 'gdzie dzisiaj jadę?', null],
  ['bartek', 'miałem na myśli Maksa', CTX_BAR],
  ['julka', 'a Julka?', CTX_PREP],
  ['do-kiedy', 'do kiedy?', CTX_FIN],
]

const out: Record<string, unknown> = {}
for (const [id, text, ctx] of goldens) {
  out[id] = await interpret(text, ctx)
  await new Promise((r) => setTimeout(r, 120))
}

const convos = [
  {
    id: 'mt-prep',
    turns: [
      ['gdzie szykuje się Maks?', { activeResourceKind: 'wedding' }],
      ['a Julka?', CTX_PREP],
      ['a ślub o której będzie?', CTX_PREP],
      ['a co potem?', CTX_PREP],
      ['daleko stamtąd do przyjęcia?', CTX_PREP],
    ] as Array<[string, unknown]>,
  },
  {
    id: 'mt-finance',
    turns: [
      ['ile oni mi jeszcze wiszą?', { activeResourceKind: 'wedding' }],
      ['do kiedy?', CTX_FIN],
      ['ile już wpłacili?', CTX_FIN],
      ['a wartość umowy?', CTX_FIN],
      ['gdzie mają wesele?', CTX_FIN],
    ] as Array<[string, unknown]>,
  },
  {
    id: 'mt-bartek',
    turns: [
      ['gdzie szykuje się Bartek?', { activeResourceKind: 'wedding' }],
      ['miałem na myśli Maksa', CTX_BAR],
      ['a Julka?', { ...CTX_PREP, activeParticipantHint: 'Maks' }],
      ['ile km mam do niej?', { ...CTX_PREP, activeParticipantHint: 'Julka' }],
      ['a ceremonia gdzie?', CTX_PREP],
    ] as Array<[string, unknown]>,
  },
]

const mt: Record<string, unknown[]> = {}
for (const c of convos) {
  mt[c.id] = []
  for (const [text, ctx] of c.turns) {
    const r = await interpret(text, ctx)
    mt[c.id].push({
      text,
      op: r.taskSpec?.op,
      subject: r.taskSpec?.subject,
      participant: r.taskSpec?.participant,
      temporal: r.taskSpec?.temporal,
      aspect: r.taskSpec?.qualifiers.aspect,
      correction: r.taskSpec?.correction,
    })
    await new Promise((x) => setTimeout(x, 120))
  }
}

const payload = { goldens: out, mt }
writeFileSync('/tmp/ourwed-v4-goldens.json', JSON.stringify(payload, null, 2))
console.log(JSON.stringify(payload, null, 2))
