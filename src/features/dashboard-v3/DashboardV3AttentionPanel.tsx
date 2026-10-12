import { Link } from 'react-router-dom'
import {
  IconChevronRight,
  IconClipboardList,
  IconDocuments,
  IconPackage,
  IconRoute,
  IconWallet,
} from '@/components/icons'
import {
  attentionItemCountLabel,
  attentionMicroDateLabel,
  formatAttentionListContext,
  studioAttentionIconDomain,
  studioAttentionIssueLabel,
} from '@/features/dashboard/attention/studioAttentionPresentation'
import { useStudioAttention } from '@/features/dashboard/attention/useStudioAttention'
import { useMyWeddingInvitations } from '@/features/collaboration/useWeddingCollaboration'
import type {
  StudioAttentionItem,
  StudioAttentionKind,
} from '@/features/dashboard/attention/studioAttentionTypes'
import { STUDIO_ATTENTION_MOBILE_VISIBLE } from '@/features/dashboard/attention/studioAttentionTypes'
import styles from './DashboardV3AttentionPanel.module.css'

/**
 * Compact operational Attention list — Terminy-inspired density.
 * Presentation only; data path independent and non-blocking.
 * Ranked pool max 6; phone CSS truncates to 5 without a second query.
 */
export function DashboardV3AttentionPanel() {
  const attentionQuery = useStudioAttention()
  const invitationsQuery = useMyWeddingInvitations()
  const items = attentionQuery.data ?? []
  const pendingInvitations = (invitationsQuery.data ?? []).filter(
    (invitation) => invitation.status === 'pending',
  )
  const invitationAttentionCount = pendingInvitations.length > 0 ? 1 : 0
  const attentionCount = items.length + invitationAttentionCount
  const loading =
    attentionQuery.isLoading && !attentionQuery.data && invitationsQuery.isLoading
  const refreshing =
    attentionQuery.isFetching && Boolean(attentionQuery.data)
  /** Positive zero only after successful resolve — never from error/idle. */
  const showZeroState =
    attentionQuery.isSuccess &&
    invitationsQuery.isSuccess &&
    attentionCount === 0

  return (
    <section
      className={`${styles.panel} v3MaterialSupporting`}
      aria-labelledby="dashboard-v3-attention-title"
      data-testid="dashboard-v3-attention"
      aria-busy={loading || refreshing ? true : undefined}
    >
      <header className={styles.header}>
        <h2 id="dashboard-v3-attention-title" className={styles.title}>
          Wymaga uwagi
        </h2>
        {attentionCount > 0 ? (
          <>
            <span className={styles.countDesktop}>
              {attentionItemCountLabel(attentionCount)}
            </span>
            <span className={styles.countMobile}>
              {attentionItemCountLabel(
                Math.min(items.length, STUDIO_ATTENTION_MOBILE_VISIBLE) +
                  invitationAttentionCount,
              )}
            </span>
          </>
        ) : null}
      </header>

      {loading ? (
        <div className={styles.loading} aria-hidden />
      ) : attentionCount > 0 ? (
        <>
          {pendingInvitations.length > 0 ? (
            <Link
              to="/wspolpraca/zaproszenia"
              className={`${styles.row} ${styles.invitationRow}`}
              aria-label={`${pendingInvitations.length} zaproszeń do współpracy. Otwórz zaproszenia`}
              data-testid="dashboard-wedding-invitations"
            >
              <span className={styles.marker} aria-hidden>
                <IconDocuments className={styles.markerIcon} aria-hidden />
              </span>
              <span className={styles.body}>
                <span className={styles.name}>Zaproszenie do współpracy</span>
                <span className={styles.issue}>
                  {pendingInvitations.length === 1
                    ? 'Masz nowe zaproszenie do zlecenia.'
                    : `Masz ${pendingInvitations.length} zaproszenia do zleceń.`}
                </span>
              </span>
              <span className={styles.trailing}>
                <IconChevronRight className={styles.chevron} aria-hidden />
              </span>
            </Link>
          ) : null}
          {items.length > 0 ? (
            <ul className={styles.list}>
              {items.map((item) => (
                <li key={item.id}>
                  <AttentionRow item={item} />
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : showZeroState ? (
        <div
          className={styles.empty}
          data-testid="dashboard-v3-attention-empty"
        >
          <p className={styles.emptyTitle}>Nic nie wymaga Twojej uwagi</p>
          <p className={styles.emptyCopy}>
            Wszystkie najważniejsze sprawy są na ten moment załatwione.
          </p>
        </div>
      ) : null}
    </section>
  )
}

function AttentionTypeIcon({ kind }: { kind: StudioAttentionKind }) {
  const common = { className: styles.markerIcon, 'aria-hidden': true as const }
  const domain = studioAttentionIconDomain(kind)
  switch (domain) {
    case 'finance':
      return <IconWallet {...common} />
    case 'travel':
      return <IconRoute {...common} />
    case 'document':
      return <IconDocuments {...common} />
    case 'questionnaire':
      return <IconClipboardList {...common} />
    case 'delivery':
      return <IconPackage {...common} />
    default: {
      const _exhaustive: never = domain
      void _exhaustive
      return <IconDocuments {...common} />
    }
  }
}

function AttentionRow({ item }: { item: StudioAttentionItem }) {
  const issueLabel = studioAttentionIssueLabel(item.kind)
  const issueLine = item.description?.trim() || issueLabel
  const micro = attentionMicroDateLabel(item.kind, item.dueAt)
  const context = formatAttentionListContext(item.contextLabel)

  return (
    <Link
      to={item.href}
      className={styles.row}
      aria-label={`${item.title}. ${issueLine}${
        micro ? `. ${micro}` : ''
      }${context ? `. ${context}` : ''}. ${item.ctaLabel}`}
      data-testid="dashboard-v3-attention-row"
    >
      <span className={styles.marker} aria-hidden>
        <AttentionTypeIcon kind={item.kind} />
      </span>

      <span className={styles.body}>
        <span className={styles.name}>{item.title}</span>
        <span className={styles.issue}>{issueLine}</span>
        {/*
          Always mount the micro slot. Desktop CSS reserves one line so
          payment-with-date and travel-without-date share equal rhythm.
          Empty = no text for AT (aria-hidden). Mobile hides via CSS.
        */}
        <span className={styles.micro} aria-hidden={micro ? undefined : true}>
          {micro ?? ''}
        </span>
      </span>

      <span className={styles.trailing}>
        {context ? <span className={styles.context}>{context}</span> : null}
        <IconChevronRight className={styles.chevron} aria-hidden />
      </span>
    </Link>
  )
}
