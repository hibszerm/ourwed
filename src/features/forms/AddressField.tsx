/**
 * Address autocomplete.
 * Desktop: anchored ResponsiveFieldOverlay popover.
 * Mobile: full visualViewport search dialog (MobileFieldDialog).
 *
 * Provider selection lives in addressProviderResolver — not hardcoded here.
 */

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
import {
  type AddressAutocompleteProvider,
  type AddressSuggestion,
  type NormalizedAddress,
} from '@/services/addressAutocompleteProvider'
import { createDefaultAddressAutocompleteProvider } from '@/services/addressProviderResolver'
import {
  GOOGLE_PLACES_MIN_QUERY_LENGTH,
  GOOGLE_USER_ERROR_PL,
} from '@/services/googlePlacesNormalize'
import fieldStyles from './QuestionField.module.css'
import styles from './AddressField.module.css'

export type AddressFieldValue = string | NormalizedAddress

interface AddressFieldProps {
  id?: string
  value: AddressFieldValue
  onChange: (value: AddressFieldValue) => void
  placeholder?: string
  disabled?: boolean
  provider?: AddressAutocompleteProvider
}

function toDisplay(value: AddressFieldValue): string {
  if (typeof value === 'string') return value
  return value.formattedAddress ?? ''
}

function isNormalized(value: AddressFieldValue): value is NormalizedAddress {
  return typeof value === 'object' && value != null && 'formattedAddress' in value
}

const MIN_QUERY = GOOGLE_PLACES_MIN_QUERY_LENGTH

export function AddressField({
  id,
  value,
  onChange,
  placeholder = 'Wpisz adres…',
  disabled = false,
  provider: providerProp,
}: AddressFieldProps) {
  const listId = useId()
  const isMobile = useIsMobileOverlay()
  // One provider instance per field so Google session tokens are not shared.
  const [provider] = useState(
    () => providerProp ?? createDefaultAddressAutocompleteProvider(),
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const portalRef = useRef<HTMLElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sessionRef = useRef<string | null>(null)
  const [query, setQuery] = useState(toDisplay(value))
  const [dialogQuery, setDialogQuery] = useState(toDisplay(value))
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [emptyAfterSearch, setEmptyAfterSearch] = useState(false)
  const [providerHint, setProviderHint] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setQuery(toDisplay(value))
  }, [value])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
      endSearchSession()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
  }, [])

  useEffect(() => {
    if (!open || isMobile) return
    function onDocPointer(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (inputRef.current?.contains(target)) return
      if (portalRef.current?.contains(target)) return
      closeDialog()
    }
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('touchstart', onDocPointer)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('touchstart', onDocPointer)
    }
  }, [open, isMobile])

  function ensureSearchSession(): string {
    if (sessionRef.current) return sessionRef.current
    const token = provider.beginSession?.() ?? crypto.randomUUID()
    sessionRef.current = token
    return token
  }

  function endSearchSession() {
    sessionRef.current = null
    provider.endSession?.()
  }

  function emitManual(text: string) {
    const prev = isNormalized(value) ? value : null
    if (prev?.placeId && text.trim() === prev.formattedAddress) {
      onChange(prev)
      return
    }
    onChange(text)
  }

  function scheduleSearch(next: string) {
    setHighlight(-1)
    setEmptyAfterSearch(false)
    setProviderHint(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void runSearch(next)
    }, 280)
  }

  function handleDesktopInput(next: string) {
    setQuery(next)
    emitManual(next)
    setOpen(true)
    scheduleSearch(next)
  }

  function handleDialogInput(next: string) {
    setDialogQuery(next)
    scheduleSearch(next)
  }

  async function runSearch(q: string) {
    if (q.trim().length < MIN_QUERY) {
      setSuggestions([])
      setLoading(false)
      setEmptyAfterSearch(false)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const sessionToken = ensureSearchSession()

    setLoading(true)
    try {
      const hits = await provider.search(q, {
        limit: 8,
        signal: controller.signal,
        sessionToken,
        language: 'pl',
      })
      if (controller.signal.aborted) return
      setSuggestions(hits)
      setEmptyAfterSearch(hits.length === 0)
      setProviderHint(null)
      if (!isMobile) setOpen(true)
    } catch {
      if (controller.signal.aborted) return
      setSuggestions([])
      setEmptyAfterSearch(true)
      setProviderHint(GOOGLE_USER_ERROR_PL)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  async function pickSuggestion(s: AddressSuggestion) {
    abortRef.current?.abort()
    try {
      const resolved = await provider.resolve(s.id, {
        sessionToken: sessionRef.current ?? undefined,
        language: 'pl',
      })
      onChange(resolved)
      setQuery(resolved.formattedAddress)
      setDialogQuery(resolved.formattedAddress)
    } catch {
      onChange(s.label)
      setQuery(s.label)
      setDialogQuery(s.label)
    }
    endSearchSession()
    setSuggestions([])
    setOpen(false)
    setHighlight(-1)
    setProviderHint(null)
  }

  function useTypedAddress() {
    const text = (isMobile ? dialogQuery : query).trim()
    if (!text) return
    emitManual(text)
    setQuery(text)
    endSearchSession()
    setOpen(false)
    setHighlight(-1)
  }

  function openMobileDialog() {
    if (disabled) return
    const current = toDisplay(value) || query
    setDialogQuery(current)
    setSuggestions([])
    setEmptyAfterSearch(false)
    setHighlight(-1)
    setProviderHint(null)
    ensureSearchSession()
    setOpen(true)
    if (current.trim().length >= MIN_QUERY) {
      void runSearch(current)
    }
    inputRef.current?.blur()
  }

  function closeDialog() {
    setOpen(false)
    setHighlight(-1)
    endSearchSession()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        closeDialog()
      }
      return
    }
    if (!open || (suggestions.length === 0 && !emptyAfterSearch)) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
      return
    }
    if (e.key === 'Enter' && highlight >= 0 && suggestions[highlight]) {
      e.preventDefault()
      void pickSuggestion(suggestions[highlight])
    }
  }

  const showDesktopMenu =
    !isMobile &&
    open &&
    !disabled &&
    (loading || suggestions.length > 0 || emptyAfterSearch || !!providerHint)

  const showAttribution =
    provider.attribution === 'google' &&
    (suggestions.length > 0 || loading)

  const resultsList = (
    <ul
      ref={(node) => {
        portalRef.current = node
      }}
      id={listId}
      className={[styles.listPortal, isMobile ? styles.listDialog : '']
        .filter(Boolean)
        .join(' ')}
      role="listbox"
      data-testid="address-suggestion-menu"
      data-overlay-mode={isMobile ? 'dialog' : 'anchored'}
    >
      {loading && suggestions.length === 0 ? (
        <li className={styles.emptyRow} role="presentation">
          Szukam adresów…
        </li>
      ) : null}
      {!loading && providerHint ? (
        <li className={styles.emptyRow} role="presentation">
          {providerHint}
        </li>
      ) : null}
      {!loading && !providerHint && emptyAfterSearch && suggestions.length === 0 ? (
        <li className={styles.emptyRow} role="presentation">
          Brak podpowiedzi — możesz użyć wpisanego adresu.
        </li>
      ) : null}
      {suggestions.map((s, index) => (
        <li
          key={s.id}
          id={`${listId}-opt-${index}`}
          role="option"
          aria-selected={highlight === index}
        >
          <button
            type="button"
            className={[
              styles.option,
              styles.optionCompact,
              highlight === index ? styles.optionActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setHighlight(index)}
            onClick={() => void pickSuggestion(s)}
          >
            <span className={styles.optionText}>
              <span className={styles.optionLabel}>{s.label}</span>
              {s.secondaryLabel ? (
                <span className={styles.optionSecondary}>
                  {s.secondaryLabel}
                </span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
      {showAttribution ? (
        <li className={styles.attributionRow} role="presentation">
          <span className={styles.poweredByGoogle} aria-label="Powered by Google">
            Powered by Google
          </span>
        </li>
      ) : null}
    </ul>
  )

  return (
    <div className={styles.wrap}>
      {isMobile ? (
        <button
          ref={triggerRef}
          id={id}
          type="button"
          className={[fieldStyles.input, styles.mobileTrigger]
            .filter(Boolean)
            .join(' ')}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={openMobileDialog}
        >
          <span className={query ? undefined : styles.placeholder}>
            {query || placeholder}
          </span>
        </button>
      ) : (
        <input
          ref={inputRef}
          id={id}
          className={fieldStyles.input}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDesktopMenu}
          aria-controls={listId}
          aria-activedescendant={
            highlight >= 0 ? `${listId}-opt-${highlight}` : undefined
          }
          placeholder={placeholder}
          value={query}
          disabled={disabled}
          readOnly={disabled}
          autoComplete="street-address"
          onChange={(e) => handleDesktopInput(e.target.value)}
          onFocus={() => {
            ensureSearchSession()
            if (suggestions.length > 0 || emptyAfterSearch || providerHint) {
              setOpen(true)
            }
          }}
          onKeyDown={onKeyDown}
        />
      )}
      {loading && !isMobile ? (
        <span className={styles.status}>Szukam…</span>
      ) : null}

      {!isMobile ? (
        <ResponsiveFieldOverlay
          open={showDesktopMenu}
          anchorRef={inputRef}
          onClose={closeDialog}
          maxMenuHeight={280}
        >
          {() => resultsList}
        </ResponsiveFieldOverlay>
      ) : (
        <MobileFieldDialog
          open={open && !disabled}
          title="Wybierz adres"
          onClose={closeDialog}
          initialFocusRef={searchRef}
          restoreFocusRef={triggerRef}
          testId="mobile-address-dialog"
          headerExtra={
            <div className={styles.dialogSearch}>
              <input
                ref={searchRef}
                className={fieldStyles.input}
                type="text"
                inputMode="text"
                enterKeyHint="search"
                placeholder={placeholder}
                value={dialogQuery}
                aria-autocomplete="list"
                aria-controls={listId}
                autoComplete="street-address"
                data-testid="mobile-address-search"
                onChange={(e) => handleDialogInput(e.target.value)}
                onKeyDown={onKeyDown}
              />
              {loading ? (
                <span className={styles.dialogSearchStatus}>Szukam…</span>
              ) : null}
            </div>
          }
          footer={
            <button
              type="button"
              className={styles.useTypedBtn}
              disabled={!dialogQuery.trim()}
              data-testid="mobile-address-use-typed"
              onClick={useTypedAddress}
            >
              Użyj wpisanego adresu
            </button>
          }
        >
          {resultsList}
        </MobileFieldDialog>
      )}
    </div>
  )
}
