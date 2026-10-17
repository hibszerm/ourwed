import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { compensationV3QueryKeys, compensationV3Service } from './compensationV3Service'
import styles from './CollaborativeCompensationCard.module.css'

function money(value: string | null, currency: string): string {
  if (value == null) return '—'
  const number = Number(value)
  return Number.isFinite(number)
    ? new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(number)
    : '—'
}

export function CollaborativeCompensationArchiveDialog({
  relationshipId,
  userId,
  onClose,
}: {
  relationshipId: string | null
  userId: string | undefined
  onClose: () => void
}) {
  const query = useQuery({
    queryKey: compensationV3QueryKeys.private(userId, relationshipId ?? 'unavailable', 'archive'),
    queryFn: () => compensationV3Service.getPrivate(relationshipId!, {}),
    enabled: Boolean(relationshipId && userId),
    staleTime: 0,
    retry: false,
  })
  const model = query.data
  return (
    <Modal
      open={Boolean(relationshipId)}
      title="Moje rozliczenie"
      description={model?.weddingLabel ?? 'Prywatne archiwum współpracy'}
      onClose={onClose}
      mobilePresentation="center"
      size="md"
    >
      {query.isPending ? <p role="status">Ładowanie archiwum…</p> : null}
      {query.isError ? <p role="alert" className={styles.error}>Nie udało się wczytać prywatnego archiwum.</p> : null}
      {model ? <>
        <dl className={styles.metrics}>
          <div><dt>Wartość dla mnie</dt><dd>{model.personalValueKnown ? money(model.personalValue, model.currency) : 'Nieustalona'}</dd></div>
          <div><dt>Otrzymano</dt><dd>{money(model.receivedTotal, model.currency)}</dd></div>
          <div><dt>{model.balance != null && Number(model.balance) < 0 ? 'Do przekazania' : 'Saldo'}</dt><dd>{model.balanceKnown && model.balance != null ? money(String(Math.abs(Number(model.balance))), model.currency) : '—'}</dd></div>
        </dl>
        <div className={styles.receipts}>
          <h3>Historia wpłat</h3>
          {!model.clientReceipts.length && !model.privateReceipts.length ? <p>Brak zapisanych wpłat.</p> : null}
          {model.clientReceipts.map((row) => <p className={styles.archiveReceipt} key={`client-${row.paymentId}`}><span>{row.label}<small>Wpłata klienta · {row.receivedOn}</small></span><strong>{money(row.amount, model.currency)}</strong></p>)}
          {model.privateReceipts.map((row) => <p className={styles.archiveReceipt} key={row.id}><span>Prywatny wpis<small>{row.receivedOn}{row.description ? ` · ${row.description}` : ''}</small></span><strong>{money(row.amount, model.currency)}</strong></p>)}
        </div>
      </> : null}
    </Modal>
  )
}
