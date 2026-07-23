import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { extraServiceService } from '@/lib/api/extraServiceService'
import { packageService } from '@/lib/api/packageService'
import { weddingExtraServiceService } from '@/lib/api/weddingExtraServiceService'
import { formatCurrency } from '@/lib/utils/currency'
import { isLikelyUuid } from '@/lib/supabase/helpers'
import type { WeddingExtraService } from '@/types/package'
import type { Wedding } from '@/types/wedding'
import editStyles from '@/features/weddings/edit/WeddingEdit.module.css'
import styles from './WeddingDetailPackage.module.css'

interface WeddingDetailPackageProps {
  wedding: Wedding
  editing?: boolean
  extras?: WeddingExtraService[]
  packageBasePrice?: number
  onChangeWedding?: (patch: Partial<Wedding>) => void
  onChangeExtras?: (extras: WeddingExtraService[]) => void
  onChangePackageBasePrice?: (price: number) => void
}

export function WeddingDetailPackage({
  wedding,
  editing = false,
  extras: extrasProp,
  packageBasePrice,
  onChangeWedding,
  onChangeExtras,
  onChangePackageBasePrice,
}: WeddingDetailPackageProps) {
  const userId = useStudioAuthId()

  const { data: pkg } = useQuery({
    queryKey: ['studio-package', userId, wedding.packageId],
    queryFn: () => packageService.get(wedding.packageId!),
    enabled: Boolean(
      userId && wedding.packageId && isLikelyUuid(wedding.packageId),
    ),
  })

  const { data: remoteExtras = [], isLoading: extrasLoading } = useQuery({
    queryKey: ['wedding-extras', userId, wedding.id],
    queryFn: () => weddingExtraServiceService.listByWeddingId(wedding.id),
    enabled: Boolean(userId) && !editing,
  })

  const {
    data: catalogPackages,
    isPending: catalogPackagesPending,
    isSuccess: catalogPackagesSuccess,
  } = useQuery({
    queryKey: ['studio-packages', userId, 'active'],
    queryFn: () => packageService.list({ activeOnly: true }),
    enabled: Boolean(userId) && editing,
  })

  const { data: catalogExtras = [] } = useQuery({
    queryKey: ['studio-extra-services', userId, 'active'],
    queryFn: () => extraServiceService.list({ activeOnly: true }),
    enabled: Boolean(userId) && editing,
  })

  const extras = editing ? (extrasProp ?? []) : remoteExtras
  const availableExtras = catalogExtras.filter(
    (s) => !extras.some((e) => e.extraServiceId === s.id),
  )
  const packageChoices =
    catalogPackagesSuccess && catalogPackages ? catalogPackages : undefined

  function applyPackage(packageId: string) {
    if (!packageChoices) return
    const selected = packageChoices.find((p) => p.id === packageId)
    if (!selected || !onChangeWedding) return
    onChangePackageBasePrice?.(selected.price)
    const extrasTotal = extras.reduce(
      (sum, e) => sum + e.priceSnapshot * e.quantity,
      0,
    )
    onChangeWedding({
      packageId: selected.id,
      packageName: selected.name,
      depositAmount: selected.depositAmount,
      currency: selected.currency,
      accentColor: selected.color ?? wedding.accentColor,
      price: selected.price + extrasTotal,
    })
  }

  function updateExtra(id: string, patch: Partial<WeddingExtraService>) {
    if (!onChangeExtras) return
    const next = extras.map((e) => (e.id === id ? { ...e, ...patch } : e))
    onChangeExtras(next)
    const base = packageBasePrice ?? Math.max(0, wedding.price - extras.reduce((s, e) => s + e.priceSnapshot * e.quantity, 0))
    onChangeWedding?.({
      price:
        base +
        next.reduce((sum, e) => sum + e.priceSnapshot * e.quantity, 0),
    })
  }

  function removeExtra(id: string) {
    if (!onChangeExtras) return
    const next = extras.filter((e) => e.id !== id)
    onChangeExtras(next)
    const base =
      packageBasePrice ??
      Math.max(
        0,
        wedding.price -
          extras.reduce((s, e) => s + e.priceSnapshot * e.quantity, 0),
      )
    onChangeWedding?.({
      price: base + next.reduce((sum, e) => sum + e.priceSnapshot * e.quantity, 0),
    })
  }

  async function addExtra(extraServiceId: string) {
    if (!onChangeExtras || !extraServiceId) return
    const service = catalogExtras.find((s) => s.id === extraServiceId)
    if (!service) return
    const created: WeddingExtraService = {
      id: `temp-${crypto.randomUUID()}`,
      weddingId: wedding.id,
      extraServiceId: service.id,
      priceSnapshot: service.price,
      quantity: 1,
      createdAt: new Date().toISOString(),
      name: service.name,
    }
    const next = [...extras, created]
    onChangeExtras(next)
    const base =
      packageBasePrice ??
      Math.max(
        0,
        wedding.price -
          extras.reduce((s, e) => s + e.priceSnapshot * e.quantity, 0),
      )
    onChangeWedding?.({
      price: base + next.reduce((sum, e) => sum + e.priceSnapshot * e.quantity, 0),
    })
  }

  return (
    <Card>
      <CardHeader title="Pakiet" />
      {editing ? (
        <div className={editStyles.fieldGrid}>
          <Select
            label="Pakiet"
            value={wedding.packageId ?? ''}
            onChange={(e) => applyPackage(e.target.value)}
            disabled={catalogPackagesPending || !packageChoices}
          >
            <option value="">
              {catalogPackagesPending
                ? 'Ładowanie pakietów…'
                : 'Wybierz pakiet…'}
            </option>
            {packageChoices?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatCurrency(p.price)}
              </option>
            ))}
          </Select>
          <Input
            label="Wartość umowy"
            type="number"
            min={0}
            step="0.01"
            value={wedding.price}
            onChange={(e) =>
              onChangeWedding?.({ price: Number(e.target.value) || 0 })
            }
          />
          <Input
            label="Zaliczka"
            type="number"
            min={0}
            step="0.01"
            value={wedding.depositAmount ?? 0}
            onChange={(e) =>
              onChangeWedding?.({
                depositAmount: Number(e.target.value) || 0,
              })
            }
          />
          <Input label="Waluta" value={wedding.currency || 'PLN'} readOnly />
        </div>
      ) : (
        <dl className={styles.list}>
          <div>
            <dt>Nazwa</dt>
            <dd>{wedding.packageName || '—'}</dd>
          </div>
          <div>
            <dt>Wartość umowy</dt>
            <dd>{formatCurrency(wedding.price)}</dd>
          </div>
          <div>
            <dt>Zaliczka</dt>
            <dd>
              {wedding.depositAmount != null
                ? formatCurrency(wedding.depositAmount)
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Waluta</dt>
            <dd>{wedding.currency || 'PLN'}</dd>
          </div>
        </dl>
      )}

      {pkg && pkg.items.length > 0 ? (
        <div className={styles.items}>
          <h3 className={styles.itemsTitle}>Zawartość pakietu</h3>
          <ul>
            {pkg.items.map((item) => (
              <li key={item.id}>{item.title}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={styles.items}>
        <h3 className={styles.itemsTitle}>Usługi dodatkowe</h3>
        {!editing && extrasLoading ? (
          <p className={styles.hint}>Ładowanie…</p>
        ) : extras.length === 0 ? (
          <p className={styles.hint}>Brak wybranych usług dodatkowych.</p>
        ) : (
          <ul className={editStyles.inlineList}>
            {extras.map((extra) => (
              <li key={extra.id} className={editing ? editStyles.inlineItem : undefined}>
                {editing ? (
                  <>
                    <strong>{extra.name ?? 'Usługa'}</strong>
                    <div className={editStyles.fieldRow}>
                      <Input
                        label="Ilość"
                        type="number"
                        min={1}
                        value={extra.quantity}
                        onChange={(e) =>
                          updateExtra(extra.id, {
                            quantity: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                      />
                      <Input
                        label="Cena (snapshot)"
                        type="number"
                        min={0}
                        step="0.01"
                        value={extra.priceSnapshot}
                        onChange={(e) =>
                          updateExtra(extra.id, {
                            priceSnapshot: Math.max(
                              0,
                              Number(e.target.value) || 0,
                            ),
                          })
                        }
                      />
                    </div>
                    <div className={editStyles.inlineActions}>
                      <span className={editStyles.muted}>
                        Razem:{' '}
                        {formatCurrency(extra.priceSnapshot * extra.quantity)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeExtra(extra.id)}
                      >
                        Usuń
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className={styles.extraRow}>
                    <span>
                      {extra.name ?? 'Usługa'} × {extra.quantity} —{' '}
                      {formatCurrency(extra.priceSnapshot * extra.quantity)}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {editing && availableExtras.length > 0 ? (
          <div className={editStyles.toolbar} style={{ marginTop: '0.75rem' }}>
            <Select
              label="Dodaj usługę"
              defaultValue=""
              onChange={(e) => {
                void addExtra(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">Wybierz…</option>
              {availableExtras.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {formatCurrency(s.price)}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
