import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import {
  type AddressSuggestion,
  type NormalizedAddress,
} from '@/services/addressAutocompleteProvider'
import { createDefaultAddressAutocompleteProvider } from '@/services/addressProviderResolver'
import {
  GOOGLE_PLACES_MIN_QUERY_LENGTH,
  GOOGLE_USER_ERROR_PL,
} from '@/services/googlePlacesNormalize'
import type { GeoPlace } from '@/types/travel'
import {
  mapPlaceSelectionToGeoPlace,
  mapSuggestionAndResolvedToGeoPlace,
} from '@/features/travel/weddingLocationModel'
import styles from './LocationSearchField.module.css'

export interface LocationSearchFieldProps {
  label: string
  /** External address string (display / sync when not focused). */
  value?: string
  place?: GeoPlace | null
  disabled?: boolean
  placeholder?: string
  /**
   * When true, idle input may show a compact venue name when present.
   * Full formattedAddress is always what is persisted for the address.
   * Does NOT invent a venue name from the street address.
   */
  compactDisplay?: boolean
  /**
   * Existing venue name to preserve when the user selects a pure street address.
   * Ignored when nameManuallyEdited is true and preserveName is empty (cleared).
   */
  preserveName?: string | null
  /** When true, do not adopt a newly detected venue name from Places. */
  nameManuallyEdited?: boolean
  /** Fired while typing (local text). */
  onChangeText?: (text: string) => void
  /**
   * Fired when user selects a suggestion or clears the field.
   * May be async (autosave). Existing saved location is kept on search errors.
   */
  onSelectPlace: (place: GeoPlace | null) => void | Promise<void>
  /**
   * When true, blurring the field with typed text (no suggestion pick) commits an
   * unresolved address GeoPlace so manual entry is saved.
   */
  commitTypedOnBlur?: boolean
}

function idleDisplayText(
  value: string,
  place: GeoPlace | null,
  compactDisplay: boolean,
): string {
  if (!compactDisplay) return value
  const name = place?.label?.trim()
  if (name) return name
  return value || place?.formattedAddress || ''
}

/**
 * Place search for travel / wedding details — Google Places via shared provider.
 */
export function LocationSearchField({
  label,
  value = '',
  place = null,
  disabled = false,
  placeholder = 'Zacznij wpisywać adres…',
  compactDisplay = false,
  preserveName = null,
  nameManuallyEdited = false,
  onChangeText,
  onSelectPlace,
  commitTypedOnBlur = false,
}: LocationSearchFieldProps) {
  const listId = useId()
  const inputId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const debounceRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [provider] = useState(() => createDefaultAddressAutocompleteProvider())

  const [text, setText] = useState(value)
  const [focused, setFocused] = useState(false)
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!focused) setText(idleDisplayText(value, place, compactDisplay))
  }, [value, place, compactDisplay, focused])

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
      abortRef.current?.abort()
      provider.endSession?.()
    }
  }, [provider])

  function scheduleSuggest(input: string) {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    if (input.trim().length < GOOGLE_PLACES_MIN_QUERY_LENGTH) {
      setSuggestions([])
      setOpen(false)
      setSearching(false)
      setActiveIndex(-1)
      return
    }

    setSearching(true)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const sessionToken =
      provider.getSessionToken?.() ?? provider.beginSession?.() ?? crypto.randomUUID()

    debounceRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const next = await provider.search(input, {
            limit: 8,
            signal: controller.signal,
            sessionToken,
            language: 'pl',
          })
          if (controller.signal.aborted) return
          setSuggestions(next)
          setOpen(next.length > 0)
          setActiveIndex(next.length > 0 ? 0 : -1)
          setError(null)
        } catch {
          if (controller.signal.aborted) return
          setSuggestions([])
          setOpen(false)
          setActiveIndex(-1)
          setError(GOOGLE_USER_ERROR_PL)
        } finally {
          if (!controller.signal.aborted) setSearching(false)
        }
      })()
    }, 280)
  }

  async function commitPlace(next: GeoPlace | null, displayText?: string) {
    setSaving(true)
    setError(null)
    try {
      if (displayText != null) {
        setText(displayText)
        onChangeText?.(displayText)
      }
      await onSelectPlace(next)
      setSuggestions([])
      setOpen(false)
      setActiveIndex(-1)
      provider.endSession?.()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nie znaleziono adresu.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function selectSuggestion(suggestion: AddressSuggestion) {
    try {
      const resolved: NormalizedAddress = await provider.resolve(suggestion.id, {
        sessionToken: provider.getSessionToken?.() ?? undefined,
        language: 'pl',
      })
      const geo = mapSuggestionAndResolvedToGeoPlace(suggestion, resolved, {
        preserveName: preserveName ?? place?.label,
        nameManuallyEdited,
      })
      // Address field shows the navigable address; venue name lives on geo.label.
      await commitPlace(geo, geo.formattedAddress)
    } catch {
      // Resolve failed — still try to keep suggestion primary text as a name hint
      // with the secondary line as address when present.
      const fallbackAddress =
        suggestion.secondaryLabel?.trim() || suggestion.label.trim()
      const geo = mapPlaceSelectionToGeoPlace({
        resolved: {
          formattedAddress: fallbackAddress,
          provider: 'google',
        },
        suggestionLabel: suggestion.label,
        preserveName: preserveName ?? place?.label,
        nameManuallyEdited,
      })
      await commitPlace(geo, geo.formattedAddress)
      setError(GOOGLE_USER_ERROR_PL)
    }
  }

  async function clearField() {
    setText('')
    onChangeText?.('')
    setSuggestions([])
    setOpen(false)
    setActiveIndex(-1)
    setError(null)
    provider.endSession?.()
    await commitPlace(null, '')
    inputRef.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (!open || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
      return
    }
    if (e.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
      e.preventDefault()
      void selectSuggestion(suggestions[activeIndex])
    }
  }

  const showClear = text.trim().length > 0 && !disabled && !saving
  const showAttribution = suggestions.length > 0 || searching

  return (
    <div className={styles.root} ref={rootRef}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.control}>
        <input
          ref={inputRef}
          id={inputId}
          className={styles.input}
          value={text}
          disabled={disabled || saving}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
          }
          onChange={(e) => {
            const next = e.target.value
            setText(next)
            onChangeText?.(next)
            setError(null)
            if (!provider.getSessionToken?.()) provider.beginSession?.()
            scheduleSuggest(next)
          }}
          onFocus={() => {
            setFocused(true)
            if (!provider.getSessionToken?.()) provider.beginSession?.()
            if (suggestions.length > 0) setOpen(true)
          }}
          onBlur={() => {
            setFocused(false)
            window.setTimeout(() => {
              if (!rootRef.current?.contains(document.activeElement)) {
                setOpen(false)
                setActiveIndex(-1)
                if (commitTypedOnBlur) {
                  const typed = text.trim()
                  const current =
                    place?.formattedAddress?.trim() || ''
                  if (typed && typed !== current) {
                    void commitPlace(
                      {
                        placeId: null,
                        formattedAddress: typed,
                        latitude: null,
                        longitude: null,
                        label:
                          preserveName?.trim() ||
                          place?.label ||
                          null,
                        provider: null,
                      },
                      typed,
                    )
                  } else if (!typed && current) {
                    void commitPlace(null, '')
                  }
                }
              }
            }, 120)
          }}
          onKeyDown={onKeyDown}
        />
        {searching ? (
          <span className={styles.spinner} aria-label="Searching" />
        ) : null}
        {showClear ? (
          <button
            type="button"
            className={styles.clear}
            aria-label="Clear address"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void clearField()}
          >
            ×
          </button>
        ) : null}
      </div>

      {error ? (
        <p className={styles.error} role="status">
          {error}
        </p>
      ) : null}

      {open && suggestions.length > 0 ? (
        <ul id={listId} className={styles.list} role="listbox">
          {suggestions.map((s, index) => (
            <li key={s.id}>
              <button
                type="button"
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex ? styles.optionActive : styles.option
                }
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void selectSuggestion(s)}
              >
                <span className={styles.primary}>{s.label}</span>
                {s.secondaryLabel ? (
                  <span className={styles.secondary}>{s.secondaryLabel}</span>
                ) : null}
              </button>
            </li>
          ))}
          {showAttribution ? (
            <li className={styles.attribution} role="presentation">
              <span aria-label="Powered by Google">Powered by Google</span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
