import { useEffect, useId, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FloatingPortal } from '@/components/ui/FloatingPortal'
import type { CollaborationConnection, CollaborationInvitation, CollaborationState } from './collaborationService'
import styles from './CollaborationDirectory.module.css'

type InvitationAction = 'accept' | 'decline' | 'cancel'

interface CollaborationDirectoryProps {
  state: CollaborationState | undefined
  loading: boolean
  loadError: boolean
  actionError: string | null
  notice: string | null
  busyId: string | null
  onRetry: () => void
  onInvitationAction: (invitation: CollaborationInvitation, action: InvitationAction) => void
  onEnd: (connection: CollaborationConnection) => void
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium' }).format(date)
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '•'
  return parts.length === 1 ? [...parts[0]].slice(0, 2).join('').toLocaleUpperCase('pl-PL')
    : `${[...parts[0]][0]}${[...parts.at(-1)!][0]}`.toLocaleUpperCase('pl-PL')
}

const MENU_OPTIONS = { gap: 4, minMenuWidth: 176, maxMenuWidth: 220, align: 'end' as const,
  forceAnchored: true, maxMenuHeight: 112, minSpace: 80, padding: 8 }

function ConnectionRow({ connection, busy, onEnd }: {
  connection: CollaborationConnection
  busy: boolean
  onEnd: (connection: CollaborationConnection) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const date = formatDate(connection.connected_at)

  useEffect(() => {
    if (!menuOpen) return
    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  function end() {
    setMenuOpen(false)
    triggerRef.current?.focus()
    onEnd(connection)
  }

  return <li className={`${styles.row} ${styles.connectionRow}`}>
    <span className={styles.avatar} aria-hidden="true">{initialsFor(connection.display_name)}</span>
    <div className={styles.identity}><p className={styles.name}>{connection.display_name}</p></div>
    <div className={styles.relationshipMeta}>
      {date ? <><span className={styles.relationshipLabel}>Połączono</span><span className={styles.relationshipDate}>{date}</span></> : null}
    </div>
    <div className={styles.actionSlot}>
      <button ref={triggerRef} type="button" className={styles.menuTrigger}
        aria-label={`Więcej działań dla ${connection.display_name}`} aria-haspopup="menu"
        aria-expanded={menuOpen} aria-controls={menuId} disabled={busy} onClick={() => setMenuOpen((open) => !open)}>
        <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <FloatingPortal open={menuOpen} anchorRef={triggerRef} options={MENU_OPTIONS}>
        {() => <div ref={menuRef} id={menuId} className={styles.menuPanel} role="menu">
          <button type="button" role="menuitem" className={styles.menuItemDanger} onClick={end}>Zakończ współpracę</button>
        </div>}
      </FloatingPortal>
    </div>
  </li>
}

function InvitationRow({ invitation, direction, busy, onAction }: {
  invitation: CollaborationInvitation
  direction: 'incoming' | 'outgoing'
  busy: boolean
  onAction: (invitation: CollaborationInvitation, action: InvitationAction) => void
}) {
  const date = formatDate(invitation.created_at)
  return <li className={`${styles.row} ${styles.pendingRow}`}>
    <span className={styles.avatar} aria-hidden="true">{initialsFor(invitation.display_name)}</span>
    <div className={styles.identity}>
      <p className={styles.name}>{invitation.display_name}</p>
      <p className={styles.meta}>{direction === 'incoming' ? 'Zaprasza Cię do współpracy' : 'Oczekuje na odpowiedź'}
        {date ? ` · ${direction === 'incoming' ? 'wysłano' : 'wysłano'} ${date}` : ''}</p>
    </div>
    {direction === 'incoming' ? <div className={styles.actions}>
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onAction(invitation, 'decline')}>Odrzuć</Button>
      <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => onAction(invitation, 'accept')}>
        {busy ? 'Zapisywanie…' : 'Akceptuj'}
      </Button>
    </div> : <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onAction(invitation, 'cancel')}>Anuluj</Button>}
  </li>
}

export function CollaborationDirectory({ state, loading, loadError, actionError, notice, busyId, onRetry,
  onInvitationAction, onEnd }: CollaborationDirectoryProps) {
  const connections = state?.connections ?? []
  const incoming = state?.incoming_pending ?? []
  const outgoing = state?.outgoing_pending ?? []

  return <div className={styles.directory} data-testid="collaboration-directory">
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    {actionError ? <p className={styles.error} role="alert">{actionError}</p> : null}

    {loading ? <Card padding="md" className={styles.loading}>
      <div role="status" aria-label="Ładowanie współpracy"><span className={styles.loadingLine} />
        <span className={styles.loadingLineShort} /><span className={styles.loadingLine} /></div>
    </Card> : null}
    {loadError ? <Card padding="md" className={styles.loadError}>
      <div role="alert"><p>Nie udało się wczytać współpracy.</p><Button type="button" variant="ghost" onClick={onRetry}>Spróbuj ponownie</Button></div>
    </Card> : null}

    {!loading && !loadError && state ? <div className={styles.sections}>
      {incoming.length ? <Card padding="sm" className={styles.card}>
        <section aria-labelledby="incoming-heading">
          <header className={styles.sectionHeader}><div className={styles.sectionTitle}>
            <h2 id="incoming-heading">Zaproszenie do współpracy</h2>
            {incoming.length > 1 ? <span className={styles.count}>{incoming.length}</span> : null}
          </div></header>
          <ul className={styles.list}>
            {incoming.map((invite) => <InvitationRow key={invite.id} invitation={invite} direction="incoming"
              busy={busyId === invite.id} onAction={onInvitationAction} />)}
          </ul>
        </section>
      </Card> : null}

      <Card padding="sm" className={styles.card}>
        <section aria-labelledby="collaborators-heading">
          <header className={styles.sectionHeader}><div className={styles.sectionTitle}>
            <h2 id="collaborators-heading">Współpracownicy</h2><span className={styles.count}>{connections.length}</span>
          </div></header>
          {connections.length ? <ul className={styles.list}>
            {connections.map((connection) => <ConnectionRow key={connection.id} connection={connection}
              busy={busyId === connection.id} onEnd={onEnd} />)}
          </ul> : <div className={styles.emptyContent}>
            <p>Połączone osoby pojawią się tutaj. Wspólny dostęp do zlecenia zawsze nadajesz osobno.</p>
          </div>}
          {outgoing.length ? <div className={styles.pendingGroup}>
            <h3>Oczekujące</h3>
            <ul className={styles.list}>
              {outgoing.map((invite) => <InvitationRow key={invite.id} invitation={invite} direction="outgoing"
                busy={busyId === invite.id} onAction={onInvitationAction} />)}
            </ul>
          </div> : null}
        </section>
      </Card>
    </div> : null}
  </div>
}
