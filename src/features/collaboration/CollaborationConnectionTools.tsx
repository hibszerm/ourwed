import { useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import styles from './CollaborationConnectionTools.module.css'

export interface CollaborationAccountPreview {
  id: string
  name: string
  studioName?: string | null
}

export interface CollaborationCodeAdapter {
  getCurrentCode(): Promise<string | null>
  lookup(email: string, code: string): Promise<CollaborationAccountPreview | null>
  sendInvitation(accountId: string): Promise<void>
  regenerateCode(): Promise<string>
}

interface CollaborationConnectionToolsProps {
  adapter?: CollaborationCodeAdapter
  demoValues?: {
    email?: string
    code?: string
    preview?: CollaborationAccountPreview
    message?: string
    state?: 'empty' | 'matched' | 'success' | 'invalid' | 'regenerate'
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '•'
  return parts.length === 1 ? parts[0].slice(0, 2).toLocaleUpperCase('pl-PL')
    : `${parts[0][0]}${parts.at(-1)?.[0]}`.toLocaleUpperCase('pl-PL')
}

export function CollaborationConnectionTools({ adapter, demoValues }: CollaborationConnectionToolsProps) {
  const [code, setCode] = useState<string | null>(null)
  const [email, setEmail] = useState(demoValues?.email ?? '')
  const [enteredCode, setEnteredCode] = useState(demoValues?.code ?? '')
  const [preview, setPreview] = useState<CollaborationAccountPreview | null>(demoValues?.preview ?? null)
  const [lookupMessage, setLookupMessage] = useState(demoValues?.state === 'invalid' ? demoValues.message ?? '' : '')
  const [successMessage, setSuccessMessage] = useState(demoValues?.state === 'success' ? demoValues.message ?? '' : '')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [busy, setBusy] = useState<'lookup' | 'invite' | 'regenerate' | null>(null)
  const [regenerateOpen, setRegenerateOpen] = useState(demoValues?.state === 'regenerate')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (adapter) void adapter.getCurrentCode().then((value) => { if (active) setCode(value) })
    return () => { active = false }
  }, [adapter])

  useEffect(() => {
    if (!demoValues) return
    const timer = window.setTimeout(() => {
      const state = demoValues.state
      setEmail(state === 'matched' || state === 'invalid' ? demoValues.email ?? '' : '')
      setEnteredCode(state === 'matched' || state === 'invalid' ? demoValues.code ?? '' : '')
      setPreview(state === 'matched' ? demoValues.preview ?? null : null)
      setLookupMessage(state === 'invalid' ? demoValues.message ?? '' : '')
      setSuccessMessage(state === 'success' ? demoValues.message ?? '' : '')
      setRegenerateOpen(state === 'regenerate')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [demoValues])

  async function findAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!adapter || busy) return
    setBusy('lookup')
    setLookupMessage('')
    setSuccessMessage('')
    setPreview(null)
    setError('')
    try {
      const result = await adapter.lookup(email.trim(), enteredCode.trim())
      if (result) setPreview(result)
      else setLookupMessage('Adres e-mail lub kod współpracy są nieprawidłowe.')
    } catch {
      setLookupMessage('Nie udało się sprawdzić tych danych. Spróbuj ponownie.')
    } finally { setBusy(null) }
  }

  async function sendInvitation() {
    if (!adapter || !preview || busy) return
    setBusy('invite')
    setError('')
    try {
      await adapter.sendInvitation(preview.id)
      setSuccessMessage(`${preview.name} otrzyma zaproszenie w OurWed.`)
      setEmail('')
      setEnteredCode('')
      setPreview(null)
      setLookupMessage('')
    } catch {
      setError('Nie udało się wysłać zaproszenia. Spróbuj ponownie.')
    } finally { setBusy(null) }
  }

  async function copyCode() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch { setCopyState('error') }
  }

  async function regenerateCode() {
    if (!adapter || busy) return
    setBusy('regenerate')
    setError('')
    try {
      setCode(await adapter.regenerateCode())
      setRegenerateOpen(false)
      setCopyState('idle')
    } catch { setError('Nie udało się wygenerować nowego kodu. Spróbuj ponownie.') }
    finally { setBusy(null) }
  }

  const enabled = Boolean(adapter)
  return <>
    <div className={styles.tools}>
      <section className={`${styles.surface} ${styles.addSurface}`} aria-labelledby="add-collaborator-heading">
        <header className={styles.surfaceHeader}>
          <div>
            <h2 id="add-collaborator-heading">Dodaj współpracownika</h2>
            <p>Znajdź konto, podając jego adres e-mail i aktualny kod współpracy.</p>
          </div>
        </header>
        <form className={styles.lookupForm} onSubmit={(event) => void findAccount(event)}>
          <Input id="collaboration-account-email" label="Adres e-mail" type="email" autoComplete="email"
            placeholder="anna@studio.pl" maxLength={320} value={email} disabled={!enabled || busy !== null}
            onChange={(event) => setEmail(event.target.value)} />
          <Input id="collaboration-account-code" label="Kod współpracy" type="text" autoComplete="off"
            placeholder="OW-7K4P9X" maxLength={32} value={enteredCode} disabled={!enabled || busy !== null}
            onChange={(event) => setEnteredCode(event.target.value.toLocaleUpperCase('en-US'))} />
          <Button type="submit" variant="primary" className={styles.findButton}
            disabled={!enabled || busy !== null || !email.trim() || !enteredCode.trim()}>
            {busy === 'lookup' ? 'Sprawdzanie…' : 'Znajdź osobę'}
          </Button>
        </form>
        {!enabled ? <p className={styles.unavailable} role="note">
          Wyszukiwanie po kodzie współpracy będzie dostępne po uruchomieniu tej funkcji.
        </p> : null}
        {lookupMessage ? <p className={styles.inlineError} role="status">{lookupMessage}</p> : null}
        {error ? <p className={styles.inlineError} role="alert">{error}</p> : null}
        {preview ? <div className={styles.preview} data-testid="collaboration-account-preview">
          <span className={styles.avatar} aria-hidden="true">{initials(preview.name)}</span>
          <div className={styles.previewIdentity}>
            <strong>{preview.name}</strong>
            {preview.studioName ? <span>{preview.studioName}</span> : null}
          </div>
          <Button type="button" variant="primary" disabled={busy !== null} onClick={() => void sendInvitation()}>
            {busy === 'invite' ? 'Wysyłanie…' : 'Wyślij zaproszenie'}
          </Button>
        </div> : null}
        {successMessage ? <div className={styles.success} role="status" data-testid="collaboration-invitation-success">
          <span className={styles.successIcon} aria-hidden="true"><Check size={17} /></span>
          <span><strong>Zaproszenie wysłane</strong><small>{successMessage}</small></span>
        </div> : null}
      </section>

      <section className={`${styles.surface} ${styles.codeSurface}`} aria-labelledby="my-collaboration-code-heading">
        <header className={styles.surfaceHeader}>
          <div>
            <h2 id="my-collaboration-code-heading">Twój kod współpracy</h2>
            <p>Udostępnij adres e-mail i ten kod osobie, która chce dodać Cię do współpracy.</p>
          </div>
        </header>
        {code ? <div className={styles.codeLine}>
          <code aria-label={`Twój kod współpracy: ${code}`}>{code}</code>
          <button type="button" className={styles.copyButton} aria-label="Kopiuj kod" title="Kopiuj kod"
            onClick={() => void copyCode()}>
            {copyState === 'copied' ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
          </button>
        </div> : <div className={styles.codeUnavailable}>
          <span aria-hidden="true"><Copy size={16} /></span>
          <p>Kod będzie dostępny po uruchomieniu tej funkcji.</p>
        </div>}
        <div className={styles.codeActions}>
          <span className={styles.copyFeedback} role="status" aria-live="polite">
            {copyState === 'copied' ? 'Skopiowano' : copyState === 'error' ? 'Nie udało się skopiować' : ''}
          </span>
          <Button type="button" variant="ghost" className={styles.regenerateButton} disabled={!enabled || busy !== null}
            onClick={() => setRegenerateOpen(true)}>
            <RefreshCw size={15} aria-hidden="true" /> Wygeneruj nowy
          </Button>
        </div>
        {!enabled ? <p className={styles.codeHint}>Nowy kod zastąpi poprzedni. Istniejące współprace pozostaną bez zmian.</p> : null}
      </section>
    </div>
    <Modal open={regenerateOpen} title="Wygenerować nowy kod?"
      description="Poprzedni kod przestanie działać. Istniejące współprace pozostaną bez zmian."
      onClose={() => setRegenerateOpen(false)} busy={busy === 'regenerate'} mobilePresentation="center"
      primaryAction={<Button type="button" variant="primary" disabled={!enabled || busy !== null} onClick={() => void regenerateCode()}>
        {busy === 'regenerate' ? 'Generowanie…' : 'Wygeneruj nowy kod'}
      </Button>}>
      {!enabled ? <p className={styles.unavailable} role="note">Zmiana kodu będzie dostępna po uruchomieniu tej funkcji.</p> : null}
    </Modal>
  </>
}
