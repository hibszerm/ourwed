import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { ResponsiveFieldOverlay } from '@/components/ui/ResponsiveFieldOverlay'
import {
  defaultAddressAutocompleteProvider,
  type AddressAutocompleteProvider,
  type AddressSuggestion,
  type NormalizedAddress,
} from '@/services/addressAutocompleteProvider'
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

/**
 * Address autocomplete with responsive overlay:
 * desktop anchored popover, mobile keyboard-aware bottom sheet.
 */
export function AddressField({
  id,
  value,
  onChange,
  placeholder = 'Wpisz adres…',
  disabled = false,
  provider = defaultAddressAutocompleteProvider,
}: AddressFieldProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const portalRef = useRef<HTMLElement | null>(null)
  const [query, setQuery] = useState(toDisplay(value))
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [emptyAfterSearch, setEmptyAfterSearch] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setQuery(toDisplay(value))
  }, [value])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function onDocPointer(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (inputRef.current?.contains(target)) return
      if (portalRef.current?.contains(target)) return
      setOpen(false)
      setHighlight(-1)
    }
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('touchstart', onDocPointer)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('touchstart', onDocPointer)
    }
  }, [open])

  function emitManual(text: string) {
    const prev = isNormalized(value) ? value : null
    if (prev?.placeId && text.trim() === prev.formattedAddress) {
      onChange(prev)
      return
    }
    onChange(text)
  }

  function handleInput(next: string) {
    setQuery(next)
    emitManual(next)
    setOpen(true)
    setHighlight(-1)
    setEmptyAfterSearch(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void runSearch(next)
    }, 280)
  }

  async function runSearch(q: string) {
    if (q.trim().length < 2) {
      setSuggestions([])
      setLoading(false)
      setEmptyAfterSearch(false)
      return
    }
    setLoading(true)
    try {
      const hits = await provider.search(q, { limit: 6 })
      setSuggestions(hits)
      setEmptyAfterSearch(hits.length === 0)
      setOpen(true)
    } catch {
      setSuggestions([])
      setEmptyAfterSearch(true)
    } finally {
      setLoading(false)
    }
  }

  async function pickSuggestion(s: AddressSuggestion) {
    try {
      const resolved = await provider.resolve(s.id)
      onChange(resolved)
      setQuery(resolved.formattedAddress)
    } catch {
      onChange(s.label)
      setQuery(s.label)
    }
    setSuggestions([])
    setOpen(false)
    setHighlight(-1)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        setOpen(false)
        setHighlight(-1)
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

  const showMenu =
    open &&
    !disabled &&
    (loading || suggestions.length > 0 || emptyAfterSearch)

  return (
    <div className={styles.wrap}>
      <input
        ref={inputRef}
        id={id}
        className={fieldStyles.input}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showMenu}
        aria-controls={listId}
        aria-activedescendant={
          highlight >= 0 ? `${listId}-opt-${highlight}` : undefined
        }
        placeholder={placeholder}
        value={query}
        disabled={disabled}
        readOnly={disabled}
        autoComplete="street-address"
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0 || emptyAfterSearch) setOpen(true)
        }}
        onKeyDown={onKeyDown}
      />
      {loading ? <span className={styles.status}>Szukam…</span> : null}

      <ResponsiveFieldOverlay
        open={showMenu}
        anchorRef={inputRef}
        sheetTitle="Wybierz adres"
        onClose={() => {
          setOpen(false)
          setHighlight(-1)
        }}
        maxMenuHeight={280}
        sheetFraction={0.45}
      >
        {(placement) => (
          <ul
            ref={(node) => {
              portalRef.current = node
            }}
            id={listId}
            className={[
              styles.listPortal,
              placement.mode === 'sheet' ? styles.listSheet : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="listbox"
            style={{ maxHeight: placement.maxHeight - (placement.mode === 'sheet' ? 52 : 0) }}
            data-testid="address-suggestion-menu"
            data-overlay-mode={placement.mode}
          >
            {loading && suggestions.length === 0 ? (
              <li className={styles.emptyRow} role="presentation">
                Szukam adresów…
              </li>
            ) : null}
            {!loading && emptyAfterSearch && suggestions.length === 0 ? (
              <li className={styles.emptyRow} role="presentation">
                Brak podpowiedzi — możesz wpisać adres ręcznie.
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
                    placement.mode === 'sheet' ? styles.optionCompact : '',
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
          </ul>
        )}
      </ResponsiveFieldOverlay>
    </div>
  )
}
