/**
 * Assistant V1 — dates + domain helpers.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/assistantDomainAcceptance.test.ts
 */

import {
  formatPolishLongDate,
  parsePolishDatePhrase,
  resolveRelativeScheduleDate,
  resolveWriteDateWithYearOptions,
} from './dates'
import { buildCreateWeddingInput } from './api/assistantApi'
import {
  extractPersonName,
  parseAssistantDevIntent,
  polishPersonSearchQueries,
} from './api/intentParse'
import { ASSISTANT_NO_MATCH, ASSISTANT_UNRECOGNIZED } from './copy'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const today = '2026-09-11'

assert(resolveRelativeScheduleDate('jutro', today) === '2026-09-12', 'jutro')
assert(resolveRelativeScheduleDate('jutro?', today) === '2026-09-12', 'jutro punctuation')
assert(resolveRelativeScheduleDate('dziś', today) === today, 'dzis')
assert(parsePolishDatePhrase('20.09.2026', today) === '2026-09-20', 'full dotted')
assert(parsePolishDatePhrase('19 września 2026', today) === '2026-09-19', 'named')

const write = resolveWriteDateWithYearOptions('20.09', today)
assert(!write.ok && write.needsYearChoice === true, 'write needs year')
if (!write.ok && write.needsYearChoice) {
  assert(write.yearOptions.length === 2, 'two year options')
}

const writeOk = resolveWriteDateWithYearOptions('20.09.2026', today)
assert(writeOk.ok === true && writeOk.ok && writeOk.date === '2026-09-20', 'write with year')

assert(
  formatPolishLongDate('2026-09-20').includes('września'),
  'long date pl',
)

const payload = buildCreateWeddingInput({
  partner1: 'Adrian',
  partner2: 'Kamil',
  date: '2026-09-20',
})
assert(payload.partner1 === 'Adrian', 'p1')
assert(payload.price === 0, 'no invented price')
assert(payload.packageName === '', 'no invented package')
assert(payload.depositPaid === false, 'deposit false')

assert(
  ASSISTANT_NO_MATCH === 'Nie znalazłem takiego zlecenia na Twoim koncie.',
  'privacy copy',
)

assert(extractPersonName('Ile zostało do zapłaty u Aleksandry?') === 'Aleksandry', 'name extract')
assert(polishPersonSearchQueries('Aleksandry').some((q) => /aleksandra/i.test(q)), 'genitive')
assert(parseAssistantDevIntent('xyz abc 99').kind === 'unrecognized', 'unrecognized')
assert(ASSISTANT_UNRECOGNIZED.includes('rozpoznać'), 'unrecognized copy')

console.log('OK assistant domain acceptance')
