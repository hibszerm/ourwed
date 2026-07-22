import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { LocationSearchField } from '@/features/travel/LocationSearchField'
import {
  locationVerificationStatus,
} from '@/features/travel/locationVerification'
import { shortLocationDisplay } from '@/features/travel/shortLocationDisplay'
import { coupleName, formatDate, getCountdownParts } from '@/lib/utils/dates'
import { travelService } from '@/lib/api/travelService'
import { weddingActionsService } from '@/lib/api/weddingActionsService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import type { GeoPlace, WeddingPlace, WeddingPlaceRole } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import editStyles from '@/features/weddings/edit/WeddingEdit.module.css'
import styles from './WeddingDetailHero.module.css'

export type WeddingHeroAction =
  | 'send_contract_questionnaire'
  | 'generate_contract'
  | 'add_payment'
  | 'add_note'
  | 'add_deposit'

interface WeddingDetailHeroProps {
  wedding: Wedding
  onAction: (action: WeddingHeroAction) => void
  editing?: boolean
  onChangeWedding?: (patch: Partial<Wedding>) => void
}

const LOCATION_FIELDS: Array<{ role: WeddingPlaceRole; label: string }> = [
  { role: 'preparation', label: 'Przygotowania' },
  { role: 'ceremony', label: 'Ceremonia' },
  { role: 'reception', label: 'Przyjęcie weselne' },
]

function countdownLabel(date: string): string {
  const { days, isPast, isToday } = getCountdownParts(date)
  if (isPast) return 'Ślub już się odbył'
  if (isToday) return 'Dziś'
  return `Za ${days} dni`
}

function placeToGeo(place: WeddingPlace | null | undefined): GeoPlace | null {
  if (!place) return null
  return {
    placeId: place.placeId,
    formattedAddress: place.formattedAddress,
    latitude: place.latitude,
    longitude: place.longitude,
    label: place.label,
  }
}

/** Display text from wedding_places only — never wedding scalar / form fallbacks. */
function placeDisplayText(place: WeddingPlace | null | undefined): string {
  if (!place) return ''
  return shortLocationDisplay({
    label: place.label,
    formattedAddress: place.formattedAddress,
  })
}

/**
 * Wedding hero — sole owner of Preparation / Ceremony / Reception editing.
 * Persisted wedding_places is the single source of truth for location fields.
 */
export function WeddingDetailHero({
  wedding,
  onAction,
  editing = false,
  onChangeWedding,
}: WeddingDetailHeroProps) {
  const queryClient = useQueryClient()
  const weddingId = wedding.id

  const { data: places = [], isLoading: placesLoading } = useQuery({
    queryKey: ['wedding-places', weddingId],
    queryFn: () => weddingPlaceService.listByWeddingId(weddingId),
  })

  const byRole = new Map(places.map((p) => [p.role, p]))

  const saveMutation = useMutation({
    mutationFn: async (input: {
      role: WeddingPlaceRole
      place: GeoPlace | null
    }) => {
      if (!input.place) {
        await weddingPlaceService.removeByRole(weddingId, input.role)
      } else {
        await weddingPlaceService.upsert({
          weddingId,
          role: input.role,
          place: input.place,
          addressText: input.place.formattedAddress,
          resolve: false,
        })
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wedding-places', weddingId] }),
        queryClient.invalidateQueries({ queryKey: ['weddings', weddingId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      try {
        await travelService.recalculate(weddingId)
        await queryClient.invalidateQueries({
          queryKey: ['travel-plan', weddingId],
        })
      } catch {
        // Place save already succeeded; travel cache is best-effort.
      }
    },
  })

  const name = coupleName(
    [
      wedding.couple.partner1FirstName,
      wedding.couple.partner1LastName,
    ]
      .filter(Boolean)
      .join(' ') || wedding.couple.partner1,
    [
      wedding.couple.partner2FirstName,
      wedding.couple.partner2LastName,
    ]
      .filter(Boolean)
      .join(' ') || wedding.couple.partner2,
  )
  const contractSent = wedding.questionnaires.contractData.status !== 'not_sent'
  const showDeposit = !weddingActionsService.hasDepositPayment(wedding)

  return (
    <section className={styles.hero} id="wedding-hero">
      <div className={editStyles.toolbar}>
        <h1 className={styles.title}>{name}</h1>
        {wedding.status === 'archived' ? (
          <span className={editStyles.archivedBadge}>Zarchiwizowany</span>
        ) : null}
      </div>

      {editing ? (
        <div className={editStyles.fieldGrid} style={{ marginTop: '1rem' }}>
          <div className={editStyles.fieldRow}>
            <Input
              label="Data ślubu"
              type="date"
              value={wedding.date}
              onChange={(e) => onChangeWedding?.({ date: e.target.value })}
            />
            <Input
              label="Godzina ceremonii"
              type="time"
              value={wedding.ceremonyTime ?? ''}
              onChange={(e) =>
                onChangeWedding?.({ ceremonyTime: e.target.value || undefined })
              }
            />
          </div>
        </div>
      ) : (
        <div className={styles.meta}>
          <time className={styles.date}>{formatDate(wedding.date)}</time>
          {wedding.ceremonyTime ? (
            <>
              <span className={styles.metaDot}>·</span>
              <span>{wedding.ceremonyTime}</span>
            </>
          ) : null}
          <span className={styles.metaDot}>·</span>
          <span className={styles.countdown}>{countdownLabel(wedding.date)}</span>
        </div>
      )}

      <div className={styles.locations} id="wedding-locations">
        {placesLoading ? (
          <p className={styles.locationsMuted}>Ładowanie lokalizacji…</p>
        ) : editing ? (
          LOCATION_FIELDS.map(({ role, label }) => {
            const saved = byRole.get(role) ?? null
            return (
              <LocationSearchField
                key={role}
                label={label}
                value={placeDisplayText(saved)}
                place={placeToGeo(saved)}
                compactDisplay
                showSavedHint={false}
                disabled={saveMutation.isPending}
                placeholder="Start typing an address..."
                onSelectPlace={async (place) => {
                  await saveMutation.mutateAsync({ role, place })
                }}
              />
            )
          })
        ) : (
          LOCATION_FIELDS.map(({ role, label }) => {
            const saved = byRole.get(role) ?? null
            const text = placeDisplayText(saved)
            const status = locationVerificationStatus(saved)
            return (
              <div key={role} className={styles.packageRow}>
                <span className={styles.label}>{label}</span>
                {status === 'empty' ? (
                  <span className={styles.value}>—</span>
                ) : status === 'verified' ? (
                  <span className={styles.valueVerified}>
                    <span className={styles.verifyMark} aria-hidden>
                      ✓
                    </span>
                    {text}
                  </span>
                ) : (
                  <div className={styles.valueNeedsVerify}>
                    <span className={styles.valueNeedsVerifyLine}>
                      <span className={styles.warnMark} aria-hidden>
                        ⚠
                      </span>
                      {text}
                    </span>
                    <span className={styles.verifyHint}>Requires verification</span>
                  </div>
                )}
              </div>
            )
          })
        )}
        <div className={styles.packageRow}>
          <span className={styles.label}>Pakiet</span>
          <span className={styles.value}>{wedding.packageName || '—'}</span>
        </div>
      </div>

      {!editing ? (
        <div className={styles.actions}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={contractSent}
            onClick={() => onAction('send_contract_questionnaire')}
          >
            Wyślij ankietę
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onAction('generate_contract')}
          >
            Generuj umowę
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onAction('add_payment')}
          >
            Dodaj wpłatę
          </Button>
          {showDeposit && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onAction('add_deposit')}
            >
              Dodaj zadatek
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onAction('add_note')}
          >
            Dodaj notatkę
          </Button>
        </div>
      ) : null}
    </section>
  )
}
