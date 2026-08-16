import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { MobileFieldDialog } from '@/components/ui/MobileFieldDialog'
import { ResponsiveFieldOverlay } from '@/components/ui/ResponsiveFieldOverlay'
import { useIsMobileOverlay } from '@/components/ui/useIsMobileOverlay'
import { blurActiveElement, settleAfterBlur } from '@/components/ui/iosFocus'
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
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

/**
 * Must sit above WeddingEditDrawerV2 / Modal panels (z-index 10000).
 * Questionnaire pages are unaffected — higher stacking is still correct.
 */
export const LOCATION_SEARCH_OVERLAY_Z_INDEX = 11050


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
  /** Fired while typing (local text). Desktop only — mobile draft stays in-dialog until confirm. */
  onChangeText?: (text: string) => void
  /**
   * Fired when user selects a suggestion or clears the field.
   * May be async (autosave). Existing saved location is kept on search errors.
   */
  onSelectPlace: (place: GeoPlace | null) => void | Promise<void>
  /**
   * When true, blurring the field with typed text (no suggestion pick) commits an
   * unresolved address GeoPlace so manual entry is saved.
   * On mobile, typed text is committed only via „Zapisz adres”.
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

function unresolvedFromText(
  typed: string,
  preserveName: string | null | undefined,
  place: GeoPlace | null,
): GeoPlace {
  return {
    placeId: null,
    formattedAddress: typed,
    latitude: null,
    longitude: null,
    label: preserveName?.trim() || place?.label || null,
    provider: null,
  }
}

/**
 * Place search for travel / wedding details / questionnaires — Google Places via shared provider.
 * Desktop: anchored ResponsiveFieldOverlay (escapes card overflow).
 * Mobile: full-screen picker with confirm („Zapisz adres”).
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
  const searchLabelId = useId()
  const isMobile = useIsMobileOverlay()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const portalRef = useRef<HTMLElement | null>(null)
  const debounceRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [provider] = useState(() => createDefaultAddressAutocompleteProvider())

  const [text, setText] = useState(value)
  const [focused, setFocused] = useState(false)
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogQuery, setDialogQuery] = useState('')
  const [pendingPlace, setPendingPlace] = useState<GeoPlace | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep local draft in sync with external value only when not editing.
  const idleText = idleDisplayText(value, place, compactDisplay)
  const inputValue = focused ? text : idleText

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
      abortRef.current?.abort()
      provider.endSession?.()
    }
  }, [provider])

  useEffect(() => {
    if (!open || isMobile) return
    function onDocPointer(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (inputRef.current?.contains(target)) return
      if (rootRef.current?.contains(target)) return
      if (portalRef.current?.contains(target)) return
      setOpen(false)
      setActiveIndex(-1)
    }
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('touchstart', onDocPointer)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('touchstart', onDocPointer)
    }
  }, [open, isMobile])

  function scheduleSuggest(input: string, { openList }: { openList: boolean }) {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    if (input.trim().length < GOOGLE_PLACES_MIN_QUERY_LENGTH) {
      setSuggestions([])
      if (openList) setOpen(false)
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
          if (openList) {
            setOpen(next.length > 0)
          }
          setActiveIndex(next.length > 0 ? 0 : -1)
          setError(null)
        } catch {
          if (controller.signal.aborted) return
          setSuggestions([])
          if (openList) setOpen(false)
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
        getUserFacingErrorMessage(err, 'Nie znaleziono adresu.'),
      )
    } finally {
      setSaving(false)
    }
  }

  async function resolveSuggestion(
    suggestion: AddressSuggestion,
  ): Promise<GeoPlace> {
    try {
      const resolved: NormalizedAddress = await provider.resolve(suggestion.id, {
        sessionToken: provider.getSessionToken?.() ?? undefined,
        language: 'pl',
      })
      return mapSuggestionAndResolvedToGeoPlace(suggestion, resolved, {
        preserveName: preserveName ?? place?.label,
        nameManuallyEdited,
      })
    } catch {
      const fallbackAddress =
        suggestion.secondaryLabel?.trim() || suggestion.label.trim()
      setError(GOOGLE_USER_ERROR_PL)
      return mapPlaceSelectionToGeoPlace({
        resolved: {
          formattedAddress: fallbackAddress,
          provider: 'google',
        },
        suggestionLabel: suggestion.label,
        preserveName: preserveName ?? place?.label,
        nameManuallyEdited,
      })
    }
  }

  async function selectSuggestionDesktop(suggestion: AddressSuggestion) {
    const geo = await resolveSuggestion(suggestion)
    await commitPlace(geo, geo.formattedAddress)
  }

  async function selectSuggestionMobile(suggestion: AddressSuggestion) {
    setSearching(true)
    try {
      const geo = await resolveSuggestion(suggestion)
      setPendingPlace(geo)
      setDialogQuery(geo.formattedAddress)
      setSuggestions([])
      setActiveIndex(-1)
    } finally {
      setSearching(false)
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

  function openMobileDialog() {
    if (disabled || saving) return
    const current =
      place?.formattedAddress?.trim() ||
      text.trim() ||
      idleDisplayText(value, place, compactDisplay)
    setDialogQuery(current)
    setPendingPlace(null)
    setSuggestions([])
    setActiveIndex(-1)
    setError(null)
    if (!provider.getSessionToken?.()) provider.beginSession?.()
    setDialogOpen(true)
    if (current.trim().length >= GOOGLE_PLACES_MIN_QUERY_LENGTH) {
      scheduleSuggest(current, { openList: false })
    }
  }

  async function blurPickerBeforeClose(): Promise<void> {
    // Prefer explicit search blur so body unlock does not run while focused.
    searchRef.current?.blur()
    blurActiveElement()
    await settleAfterBlur()
  }

  async function closeMobileDialog() {
    // Cancel: discard draft / pending — do not touch parent field value.
    await blurPickerBeforeClose()
    setDialogOpen(false)
    setPendingPlace(null)
    setSuggestions([])
    setActiveIndex(-1)
    setSearching(false)
    abortRef.current?.abort()
    provider.endSession?.()
    setDialogQuery('')
    setError(null)
  }

  async function confirmMobileAddress() {
    if (saving) return
    const toCommit = pendingPlace
    const typed = dialogQuery.trim()
    const current = place?.formattedAddress?.trim() || ''

    await blurPickerBeforeClose()

    if (toCommit) {
      await commitPlace(toCommit, toCommit.formattedAddress)
      setDialogOpen(false)
      setPendingPlace(null)
      setSuggestions([])
      return
    }
    if (!typed) {
      setDialogOpen(false)
      setPendingPlace(null)
      return
    }
    if (typed === current && place) {
      setDialogOpen(false)
      setPendingPlace(null)
      return
    }
    await commitPlace(
      unresolvedFromText(typed, preserveName, place),
      typed,
    )
    setDialogOpen(false)
    setPendingPlace(null)
    setSuggestions([])
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (dialogOpen) {
        void closeMobileDialog()
        return
      }
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (suggestions.length === 0) return
    if (!open && !dialogOpen) return

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
      if (dialogOpen) {
        void selectSuggestionMobile(suggestions[activeIndex])
      } else {
        void selectSuggestionDesktop(suggestions[activeIndex])
      }
    }
  }

  const displayText = idleText || text
  const showClear = inputValue.trim().length > 0 && !disabled && !saving && !isMobile
  const showDesktopList = !isMobile && open && suggestions.length > 0
  const canConfirmMobile =
    Boolean(pendingPlace) || dialogQuery.trim().length > 0

  const suggestionList = (
    <ul
      ref={(node) => {
        portalRef.current = node
      }}
      id={listId}
      className={dialogOpen ? styles.listDialog : styles.listPortal}
      role="listbox"
      data-testid={
        dialogOpen
          ? 'location-mobile-suggestion-list'
          : 'location-desktop-suggestion-list'
      }
      data-overlay-mode={dialogOpen ? 'dialog' : 'anchored'}
    >
      {searching && suggestions.length === 0 ? (
        <li className={styles.emptyRow} role="presentation">
          Szukam adresów…
        </li>
      ) : null}
      {!searching &&
      dialogOpen &&
      dialogQuery.trim().length >= GOOGLE_PLACES_MIN_QUERY_LENGTH &&
      suggestions.length === 0 &&
      !pendingPlace ? (
        <li className={styles.emptyRow} role="presentation">
          Brak podpowiedzi — możesz zapisać wpisany adres.
        </li>
      ) : null}
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
            onClick={() =>
              void (dialogOpen
                ? selectSuggestionMobile(s)
                : selectSuggestionDesktop(s))
            }
          >
            <span className={styles.primary}>{s.label}</span>
            {s.secondaryLabel ? (
              <span className={styles.secondary}>{s.secondaryLabel}</span>
            ) : null}
          </button>
        </li>
      ))}
      {(suggestions.length > 0 || searching) && !pendingPlace ? (
        <li className={styles.attribution} role="presentation">
          <span aria-label="Powered by Google">Powered by Google</span>
        </li>
      ) : null}
    </ul>
  )

  return (
    <div className={styles.root} ref={rootRef} data-location-picker-mode={isMobile ? 'mobile' : 'desktop'}>
      <label className={styles.label} htmlFor={isMobile ? undefined : inputId} id={searchLabelId}>
        {label}
      </label>

      {isMobile ? (
        <button
          ref={triggerRef}
          type="button"
          className={styles.mobileTrigger}
          disabled={disabled || saving}
          aria-haspopup="dialog"
          aria-expanded={dialogOpen}
          aria-labelledby={searchLabelId}
          data-testid="location-mobile-trigger"
          onClick={openMobileDialog}
        >
          <span className={displayText ? undefined : styles.placeholder}>
            {displayText || placeholder}
          </span>
        </button>
      ) : (
        <div className={styles.control}>
          <input
            ref={inputRef}
            id={inputId}
            className={styles.input}
            value={inputValue}
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
              scheduleSuggest(next, { openList: true })
            }}
            onFocus={() => {
              setFocused(true)
              setText(idleText)
              if (!provider.getSessionToken?.()) provider.beginSession?.()
              if (suggestions.length > 0) setOpen(true)
            }}
            onBlur={() => {
              setFocused(false)
              // Desktop list is portalled — do not close on blur via root.contains.
              // Outside dismiss is handled by document pointer listener + overlay onClose.
              window.setTimeout(() => {
                if (
                  !rootRef.current?.contains(document.activeElement) &&
                  !portalRef.current?.contains(document.activeElement)
                ) {
                  if (commitTypedOnBlur) {
                    const typed = text.trim()
                    const current = place?.formattedAddress?.trim() || ''
                    if (typed && typed !== current) {
                      void commitPlace(
                        unresolvedFromText(typed, preserveName, place),
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
            <span className={styles.spinner} aria-label="Wyszukiwanie" />
          ) : null}
          {showClear ? (
            <button
              type="button"
              className={styles.clear}
              aria-label="Wyczyść adres"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void clearField()}
            >
              ×
            </button>
          ) : null}
        </div>
      )}

      {error && !dialogOpen ? (
        <p className={styles.error} role="status">
          {error}
        </p>
      ) : null}

      {!isMobile ? (
        <ResponsiveFieldOverlay
          open={showDesktopList}
          anchorRef={inputRef}
          onClose={() => {
            setOpen(false)
            setActiveIndex(-1)
          }}
          maxMenuHeight={280}
          zIndex={LOCATION_SEARCH_OVERLAY_Z_INDEX}
        >
          {() => suggestionList}
        </ResponsiveFieldOverlay>
      ) : null}

      {isMobile ? (
        <MobileFieldDialog
          open={dialogOpen && !disabled}
          title="Wybierz adres"
          closeLabel="Anuluj"
          onClose={() => void closeMobileDialog()}
          initialFocusRef={searchRef}
          restoreFocusRef={triggerRef}
          testId="location-mobile-address-dialog"
          zIndex={LOCATION_SEARCH_OVERLAY_Z_INDEX}
          headerExtra={
            <div className={styles.dialogSearch}>
              <label className={styles.srOnly} htmlFor={`${inputId}-mobile-search`}>
                Szukaj adresu
              </label>
              <input
                ref={searchRef}
                id={`${inputId}-mobile-search`}
                className={styles.input}
                type="text"
                inputMode="search"
                enterKeyHint="search"
                placeholder={placeholder}
                value={dialogQuery}
                aria-autocomplete="list"
                aria-controls={listId}
                autoComplete="off"
                data-testid="location-mobile-search"
                onChange={(e) => {
                  const next = e.target.value
                  setDialogQuery(next)
                  setPendingPlace(null)
                  setError(null)
                  if (!provider.getSessionToken?.()) provider.beginSession?.()
                  scheduleSuggest(next, { openList: false })
                }}
                onKeyDown={onKeyDown}
              />
              {searching ? (
                <span className={styles.dialogSearchStatus}>Szukam…</span>
              ) : null}
            </div>
          }
          footer={
            <button
              type="button"
              className={styles.confirmBtn}
              disabled={!canConfirmMobile || saving}
              data-testid="location-mobile-confirm"
              onClick={() => void confirmMobileAddress()}
            >
              {saving ? 'Zapisywanie…' : 'Zapisz adres'}
            </button>
          }
        >
          {pendingPlace ? (
            <div
              className={styles.pendingSelection}
              data-testid="location-mobile-pending"
            >
              <p className={styles.pendingLabel}>Wybrane miejsce</p>
              {pendingPlace.label?.trim() ? (
                <p className={styles.pendingPrimary}>{pendingPlace.label}</p>
              ) : null}
              <p className={styles.pendingSecondary}>
                {pendingPlace.formattedAddress}
              </p>
              {pendingPlace.placeId ? (
                <p className={styles.pendingMeta}>Potwierdzony adres Google</p>
              ) : (
                <p className={styles.pendingMeta}>Adres wpisany ręcznie</p>
              )}
            </div>
          ) : (
            suggestionList
          )}
        </MobileFieldDialog>
      ) : null}
    </div>
  )
}
