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
import { shortLocationDisplay } from '@/features/travel/shortLocationDisplay'
import styles from './LocationSearchField.module.css'

export interface LocationSearchFieldProps {
  label: string
  /** External address string (display / sync when not focused). */
  value?: string
  place?: GeoPlace | null
  disabled?: boolean
  placeholder?: string
  /**
   * When true, the input shows a short place name after selection / when idle.
   * Full formattedAddress is still passed to onSelectPlace for persistence.
   */
  compactDisplay?: boolean
  /** Show “Location saved with coordinates” under the field. Default true. */
  showSavedHint?: boolean
  /** Fired while typing (local text). */
  onChangeText?: (text: string) => void
  /**
   * Fired when user selects a suggestion or clears the field.
   * May be async (autosave). Existing saved location is kept on search errors.
   */
  onSelectPlace: (place: GeoPlace | null) => void | Promise<void>
}

function toGeoPlace(
  addr: NormalizedAddress,
  compactDisplay: boolean,
): GeoPlace {
  const short = shortLocationDisplay({
    formattedAddress: addr.formattedAddress,
  })
  return {
    placeId: addr.placeId ?? null,
    formattedAddress: addr.formattedAddress,
    latitude: addr.latitude ?? null,
    longitude: addr.longitude ?? null,
    label: compactDisplay ? short : undefined,
    provider: 'google',
  }
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
  showSavedHint = true,
  onChangeText,
  onSelectPlace,
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
    if (!focused) setText(value)
  }, [value, focused])

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
      const resolved = await provider.resolve(suggestion.id, {
        sessionToken: provider.getSessionToken?.() ?? undefined,
        language: 'pl',
      })
      const geo = toGeoPlace(resolved, compactDisplay)
      const display = compactDisplay
        ? shortLocationDisplay({
            label: geo.label,
            formattedAddress: geo.formattedAddress,
          })
        : geo.formattedAddress
      await commitPlace(geo, display)
    } catch {
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
  const showHint =
    showSavedHint &&
    place?.latitude != null &&
    place.longitude != null &&
    !error
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

      {showHint ? (
        <p className={styles.meta}>Location saved with coordinates</p>
      ) : null}

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
