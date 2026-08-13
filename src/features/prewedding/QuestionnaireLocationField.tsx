/**
 * Questionnaire address field — same Places UX as Wedding Details (LocationSearchField),
 * collapsing into the shared SelectedLocationCard after confirm.
 */

import { useEffect, useState } from 'react'
import { LocationSearchField } from '@/features/travel/LocationSearchField'
import {
  SelectedLocationCard,
  isManualGeoPlace,
} from '@/features/travel/SelectedLocationCard'
import {
  answerToGeoPlace,
  geoPlaceToAnswer,
} from '@/features/prewedding/preweddingLocation'
import type { GeoPlace } from '@/types/travel'
import type { PreWeddingAnswerValue } from '@/types/preweddingQuestionnaire'
import styles from './QuestionnaireLocationField.module.css'

export interface QuestionnaireLocationFieldProps {
  id: string
  label: string
  required?: boolean
  helpText?: string
  placeholder?: string
  value: PreWeddingAnswerValue
  error?: string
  disabled?: boolean
  onChange: (value: PreWeddingAnswerValue) => void
}

function shouldShowCard(value: PreWeddingAnswerValue, editing: boolean): boolean {
  if (editing) return false
  if (typeof value === 'string') return false
  const place = answerToGeoPlace(value)
  if (!place) return false
  return Boolean(place.formattedAddress.trim() || place.label?.trim() || place.placeId)
}

export function QuestionnaireLocationField({
  id,
  label,
  required,
  helpText,
  placeholder,
  value,
  error,
  disabled,
  onChange,
}: QuestionnaireLocationFieldProps) {
  const place = answerToGeoPlace(value)
  const [editing, setEditing] = useState(() => !shouldShowCard(value, false))
  const [draftText, setDraftText] = useState(
    place?.formattedAddress || place?.label || '',
  )

  useEffect(() => {
    if (editing) return
    const next = answerToGeoPlace(value)
    if (shouldShowCard(value, false) && next) {
      setDraftText(next.formattedAddress || next.label || '')
    }
  }, [value, editing])

  const showCard = shouldShowCard(value, editing)

  function commitPlace(next: GeoPlace | null) {
    onChange(geoPlaceToAnswer(next))
    if (next && (next.formattedAddress?.trim() || next.label?.trim())) {
      setEditing(false)
      setDraftText(next.formattedAddress || next.label || '')
    } else {
      setEditing(true)
      setDraftText('')
    }
  }

  return (
    <div className={styles.field} data-testid="questionnaire-location-field">
      <label htmlFor={id} className={styles.label}>
        {label}
        {required ? (
          <span className={styles.required} aria-label="wymagane">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {helpText ? <p className={styles.helpText}>{helpText}</p> : null}

      <div
        className={error ? styles.inputError : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {(editing || !showCard) && (
          <>
            <LocationSearchField
              label="Adres"
              value={draftText}
              place={editing ? null : place}
              disabled={disabled}
              compactDisplay={false}
              preserveName={place?.label}
              commitTypedOnBlur
              placeholder={placeholder ?? 'Zacznij wpisywać adres lub nazwę miejsca…'}
              onChangeText={(text) => {
                setDraftText(text)
                onChange(text)
              }}
              onSelectPlace={(selected) => {
                void commitPlace(selected)
              }}
            />
            <p className={styles.manualHint}>
              Nie ma na liście? Wpisz adres ręcznie i przejdź dalej — zapisze się bez Google.
            </p>
          </>
        )}

        {showCard && place ? (
          <div className={styles.cardBelow}>
            <SelectedLocationCard
              place={place}
              manual={isManualGeoPlace(place)}
              onChange={() => {
                setEditing(true)
                setDraftText(place.formattedAddress || place.label || '')
              }}
              mapsLinkLabel="Otwórz w Google Maps"
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
