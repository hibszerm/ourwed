/**
 * Deterministic V7 falsification scorer harness tests.
 *
 *   npx vitest run src/features/assistant/v7/evals/v7FalsificationScore.test.ts
 */

import { describe, expect, it } from 'vitest'
import {
  includesLoose,
  looksLikeClarify,
  looksLikeReceptionUnfilled,
  polishFirstNameForms,
  polishPersonNameInAnswer,
  scoreV7Turn,
  emptyHardSafety,
} from './v7FalsificationScore'
import type { V7TurnResult } from '../agent/loop'

function fakeResult(answer: string, tools: string[] = []): V7TurnResult {
  return {
    ok: true,
    userText: answer,
    toolCalls: tools.map((name) => ({ name, args: {}, result: { ok: true } })),
    toolCallCount: tools.length,
    stoppedReason: 'final',
    latency: {
      firstModelMs: 1,
      toolExecutionMs: [],
      subsequentModelMs: [],
      finalResponseMs: 1,
      totalMs: 1,
    },
    model: 'test',
  }
}

describe('Polish first-name inflection matching', () => {
  it('accepts common feminine case forms', () => {
    expect(polishPersonNameInAnswer('To wesele Ewy i Bartka', 'Ewa')).toBe(true)
    expect(polishPersonNameInAnswer('Numer do Anny', 'Anna')).toBe(true)
    expect(polishPersonNameInAnswer('Ślub Julii i Adama', 'Julia')).toBe(true)
    expect(polishPersonNameInAnswer('Pakiet Oli', 'Ola')).toBe(true)
    expect(polishPersonNameInAnswer('Magdaleny Białej', 'Magdalena')).toBe(
      true,
    )
    expect(polishPersonNameInAnswer('Karolinie', 'Karolina')).toBe(true)
  })

  it('accepts common masculine case forms', () => {
    expect(polishPersonNameInAnswer('ślub Adama', 'Adam')).toBe(true)
    expect(polishPersonNameInAnswer('umowa Piotra', 'Piotr')).toBe(true)
    expect(polishPersonNameInAnswer('Igora', 'Igor')).toBe(true)
    expect(polishPersonNameInAnswer('Bartkowi', 'Bartek')).toBe(false) // Bartek≠Bartkowi without soft stem rules
  })

  it('rejects different people (conservative)', () => {
    expect(polishPersonNameInAnswer('Ewelina i Jan', 'Ewa')).toBe(false)
    expect(polishPersonNameInAnswer('Aneta Nowak', 'Anna')).toBe(false)
    expect(polishPersonNameInAnswer('Olga i Marek', 'Ola')).toBe(false)
    expect(polishPersonNameInAnswer('Julianna', 'Julia')).toBe(false)
    expect(polishPersonNameInAnswer('Magda tylko', 'Magdalena')).toBe(false)
    expect(includesLoose('Ewelina', 'Ewa')).toBe(false)
    expect(includesLoose('Aneta', 'Anna')).toBe(false)
  })

  it('does not treat Magdy as Magdalena (real morphology miss preserved)', () => {
    // Genitive of Magda ≠ Magdalena forms — product miss must remain fail when
    // expected needle is Magdalena and answer only has Magdy.
    expect(polishPersonNameInAnswer('ślub Magdy', 'Magdalena')).toBe(false)
    expect(includesLoose('Nie znalazłem ślubu Magdy i Igora.', 'Magdalena')).toBe(
      false,
    )
  })

  it('includesLoose uses inflection for person names', () => {
    expect(
      includesLoose('To wesele **Ewy i Bartka — 14 marca 2027 r.**', 'Ewa'),
    ).toBe(true)
  })

  it('forms set stays bounded', () => {
    expect(polishFirstNameForms('Ewa').size).toBeLessThanOrEqual(10)
  })
})

describe('clarification detection', () => {
  it('accepts natural Polish clarify without question mark', () => {
    expect(
      looksLikeClarify(
        'Nie jestem pewien, kogo masz na myśli przez „ona”. Podaj proszę imię lub nazwę pary.',
      ),
    ).toBe(true)
  })

  it('accepts classic question clarify', () => {
    expect(looksLikeClarify('O które wesele Ci chodzi?')).toBe(true)
  })

  it('rejects factual non-clarification', () => {
    expect(
      looksLikeClarify('Masz 4 wesela do końca roku.'),
    ).toBe(false)
    expect(
      looksLikeClarify('Numer do Anny to +48 501 222 333.'),
    ).toBe(false)
    expect(
      looksLikeClarify('Łącznie pozostało 37 300 zł.'),
    ).toBe(false)
  })
})

describe('reception vs primary location gold', () => {
  it('accepts honest empty reception', () => {
    expect(
      looksLikeReceptionUnfilled(
        'Miejsce i adres przyjęcia nie są uzupełnione.',
      ),
    ).toBe(true)
  })

  it('does not treat primary-location-only as reception-unfilled', () => {
    expect(
      looksLikeReceptionUnfilled('Przyjęcie jest w Pałac Majątek.'),
    ).toBe(false)
  })

  it('scores empty reception as success when flag set', () => {
    const safety = emptyHardSafety()
    const scored = scoreV7Turn(
      {
        supportedUnambiguous: true,
        expect: {
          toolsAny: ['inspect_resource'],
          acceptReceptionUnfilled: true,
        },
      },
      fakeResult(
        'Miejsce i adres przyjęcia nie są uzupełnione.',
        ['inspect_resource'],
      ),
      safety,
    )
    expect(scored.correct).toBe(true)
  })

  it('still fails empty reception when primary text was required without flag', () => {
    const safety = emptyHardSafety()
    const scored = scoreV7Turn(
      {
        supportedUnambiguous: true,
        expect: {
          toolsAny: ['inspect_resource'],
          answerIncludes: ['Pałac'],
        },
      },
      fakeResult(
        'Miejsce i adres przyjęcia nie są uzupełnione.',
        ['inspect_resource'],
      ),
      safety,
    )
    expect(scored.correct).toBe(false)
  })
})

describe('preserved real Magda/Magdalena product miss', () => {
  it('still fails when answer invents not-found without 16000', () => {
    const safety = emptyHardSafety()
    const scored = scoreV7Turn(
      {
        supportedUnambiguous: true,
        expect: {
          toolsAny: ['search_resources', 'inspect_resource'],
          answerIncludesNumber: [16000],
        },
      },
      fakeResult(
        'Nie znalazłem ślubu Magdy i Igora. Możesz podać datę albo inną nazwę tej pary?',
        ['search_resources'],
      ),
      safety,
    )
    expect(scored.correct).toBe(false)
    expect(scored.failureClass).toBe('wrong_numeric_fact')
  })
})
