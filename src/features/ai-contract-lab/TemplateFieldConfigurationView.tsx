/**
 * Template field configuration screen — decide variable vs fixed per detected field.
 */

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  CATEGORY_LABELS,
  MODE_LABELS,
  PROTECTED_FIXED_WARNING,
  PROTECTED_VARIABLE_ROLES,
  computeTemplateConfigurationReadiness,
  groupFieldsByCategory,
  type ContractTemplateConfiguration,
  type TemplateFieldConfiguration,
  type TemplateFieldMode,
  type TemplateVariableSource,
} from '@/features/ai-contract-lab/templateFieldConfiguration'
import { normalizeSemanticRole } from '@/features/ai-contract-lab/semanticRoleCatalog'
import styles from '@/features/documents/DocumentsTemplates.module.css'

const MODE_OPTIONS: Array<{ value: TemplateFieldMode; label: string }> = [
  { value: 'variable', label: 'Zmienna' },
  { value: 'fixed', label: 'Stała' },
  { value: 'review', label: 'Do sprawdzenia' },
  { value: 'ignored', label: 'Ignorowana' },
]

const SOURCE_OPTIONS: Array<{ value: TemplateVariableSource; label: string }> = [
  { value: 'wedding', label: 'Zlecenie / wesele' },
  { value: 'package', label: 'Pakiet' },
  { value: 'manual', label: 'Wprowadzane ręcznie' },
  { value: 'derived', label: 'Wyliczane przy generowaniu' },
]

function statusLabel(
  status: ReturnType<typeof computeTemplateConfigurationReadiness>['status'],
): string {
  switch (status) {
    case 'ready':
      return 'Gotowy'
    case 'requires_review':
      return 'Wymaga sprawdzenia'
    case 'incomplete':
      return 'Niekompletny'
    default:
      return 'Nieskonfigurowany'
  }
}

export function TemplateFieldConfigurationView(props: {
  configuration: ContractTemplateConfiguration
  onChange: (next: ContractTemplateConfiguration) => void
  onSave: (input: { markReady: boolean; confirmedFixedProtectedIds: string[] }) => void
  saving?: boolean
  errors?: string[]
}) {
  const { configuration, onChange, onSave, saving, errors } = props
  const [confirmFixedIds, setConfirmFixedIds] = useState<string[]>([])
  const [showDev, setShowDev] = useState(false)

  const readiness = useMemo(
    () => computeTemplateConfigurationReadiness(configuration),
    [configuration],
  )
  const groups = useMemo(
    () => groupFieldsByCategory(configuration.fields),
    [configuration.fields],
  )

  function patchField(
    id: string,
    patch: Partial<TemplateFieldConfiguration>,
  ) {
    onChange({
      ...configuration,
      fields: configuration.fields.map((f) =>
        f.id === id
          ? {
              ...f,
              ...patch,
              configuredBy: 'user',
              configuredAt: new Date().toISOString(),
            }
          : f,
      ),
      updatedAt: new Date().toISOString(),
    })
  }

  function trySave(markReady: boolean) {
    const needingConfirm = configuration.fields.filter((f) => {
      const role = normalizeSemanticRole(f.semanticRole) ?? f.semanticRole
      return (
        f.mode === 'fixed' &&
        PROTECTED_VARIABLE_ROLES.has(role) &&
        !f.fixedClientRiskConfirmed &&
        !confirmFixedIds.includes(f.id)
      )
    })
    if (needingConfirm.length > 0) {
      // Surface warning — caller still validates
    }
    onSave({ markReady, confirmedFixedProtectedIds: confirmFixedIds })
  }

  return (
    <div className={styles.studioPage}>
      <header className={styles.studioHero}>
        <h1 className={styles.studioTitle}>Konfiguracja szablonu</h1>
        <p className={styles.studioSubtitle}>
          Wybierz, które dane zmieniają się dla każdego zlecenia, a które mają
          zawsze pozostać bez zmian.
        </p>
      </header>

      <div className={styles.infoCard}>
        <p className={styles.quietHint}>Status konfiguracji</p>
        <p>
          <strong>{statusLabel(readiness.status)}</strong>
          {readiness.status === 'ready' ? ' — Gotowy do generowania umów' : ''}
        </p>
        <p className={styles.quietHint}>
          Zmienne: {readiness.variableCount} · Stałe: {readiness.fixedCount} · Do
          sprawdzenia: {readiness.reviewCount} · Ignorowane:{' '}
          {readiness.ignoredCount}
        </p>
      </div>

      <section className={styles.infoCard}>
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>
          Płatności
        </h2>
        <label className={styles.configToggle}>
          <input
            type="radio"
            name="paymentMode"
            checked={configuration.paymentMode === 'fixed'}
            onChange={() =>
              onChange({
                ...configuration,
                paymentMode: 'fixed',
                updatedAt: new Date().toISOString(),
              })
            }
          />
          Warunki płatności są stałe w tym szablonie
        </label>
        <label className={styles.configToggle}>
          <input
            type="radio"
            name="paymentMode"
            checked={configuration.paymentMode === 'variable'}
            onChange={() =>
              onChange({
                ...configuration,
                paymentMode: 'variable',
                updatedAt: new Date().toISOString(),
              })
            }
          />
          Kwoty i harmonogram płatności zmieniają się między zleceniami
        </label>
      </section>

      <section className={styles.infoCard}>
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Termin realizacji</h2>
        <label className={styles.configToggle}>
          <input
            type="radio"
            name="deliveryMode"
            checked={configuration.deliveryTermMode === 'fixed'}
            onChange={() =>
              onChange({
                ...configuration,
                deliveryTermMode: 'fixed',
                updatedAt: new Date().toISOString(),
              })
            }
          />
          Termin oddania materiałów jest stały
        </label>
        <label className={styles.configToggle}>
          <input
            type="radio"
            name="deliveryMode"
            checked={configuration.deliveryTermMode === 'variable'}
            onChange={() =>
              onChange({
                ...configuration,
                deliveryTermMode: 'variable',
                updatedAt: new Date().toISOString(),
              })
            }
          />
          Termin oddania zależy od pakietu lub zlecenia
        </label>
      </section>

      <section className={styles.infoCard}>
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>
          Szablon ma jedno wspólne pole lokalizacji
        </h2>
        <p className={styles.quietHint}>
          Gdy przygotowania, ceremonia i przyjęcie mają różne miejsca w zleceniu.
        </p>
        <label className={styles.configToggle}>
          <input
            type="radio"
            name="locPolicy"
            checked={
              (configuration.sharedLocationPolicy?.mode ?? 'ask_each_time') ===
              'ask_each_time'
            }
            onChange={() =>
              onChange({
                ...configuration,
                sharedLocationPolicy: {
                  ...configuration.sharedLocationPolicy,
                  mode: 'ask_each_time',
                },
                updatedAt: new Date().toISOString(),
              })
            }
          />
          Pytaj przy każdym zleceniu
        </label>
        <label className={styles.configToggle}>
          <input
            type="radio"
            name="locPolicy"
            checked={
              configuration.sharedLocationPolicy?.mode === 'use_single_location'
            }
            onChange={() =>
              onChange({
                ...configuration,
                sharedLocationPolicy: {
                  mode: 'use_single_location',
                  preferredLocationRole:
                    configuration.sharedLocationPolicy?.preferredLocationRole ??
                    'ceremony',
                  combinedFormat:
                    configuration.sharedLocationPolicy?.combinedFormat,
                },
                updatedAt: new Date().toISOString(),
              })
            }
          />
          Zawsze używaj jednego wybranego miejsca
        </label>
        {configuration.sharedLocationPolicy?.mode === 'use_single_location' ? (
          <select
            value={
              configuration.sharedLocationPolicy.preferredLocationRole ??
              'ceremony'
            }
            onChange={(e) =>
              onChange({
                ...configuration,
                sharedLocationPolicy: {
                  mode: 'use_single_location',
                  preferredLocationRole: e.target.value as
                    | 'preparation'
                    | 'ceremony'
                    | 'reception',
                  combinedFormat:
                    configuration.sharedLocationPolicy?.combinedFormat,
                },
              })
            }
          >
            <option value="preparation">Przygotowania</option>
            <option value="ceremony">Ceremonia</option>
            <option value="reception">Przyjęcie</option>
          </select>
        ) : null}
        <label className={styles.configToggle}>
          <input
            type="radio"
            name="locPolicy"
            checked={
              configuration.sharedLocationPolicy?.mode === 'combine_locations'
            }
            onChange={() =>
              onChange({
                ...configuration,
                sharedLocationPolicy: {
                  mode: 'combine_locations',
                  combinedFormat:
                    configuration.sharedLocationPolicy?.combinedFormat ??
                    'Przygotowania: {preparation}; ceremonia: {ceremony}; przyjęcie: {reception}',
                },
                updatedAt: new Date().toISOString(),
              })
            }
          />
          Łącz wszystkie miejsca w jednym polu
        </label>
        {configuration.sharedLocationPolicy?.mode === 'combine_locations' ? (
          <input
            className={styles.configSlotPreview}
            style={{ width: '100%' }}
            value={
              configuration.sharedLocationPolicy.combinedFormat ??
              'Przygotowania: {preparation}; ceremonia: {ceremony}; przyjęcie: {reception}'
            }
            onChange={(e) =>
              onChange({
                ...configuration,
                sharedLocationPolicy: {
                  mode: 'combine_locations',
                  combinedFormat: e.target.value,
                },
              })
            }
          />
        ) : null}
      </section>

      {groups.map((group) => (
        <section key={group.category}>
          <h2 style={{ fontSize: '1.2rem' }}>{group.label}</h2>
          <ul className={styles.configSlotList}>
            {group.fields.map((field) => {
              const role =
                normalizeSemanticRole(field.semanticRole) ?? field.semanticRole
              const protectedFixed =
                field.mode === 'fixed' && PROTECTED_VARIABLE_ROLES.has(role)
              return (
                <li key={field.id} className={styles.configSlotCard}>
                  <div className={styles.configSlotHeader}>
                    <strong>{field.displayName}</strong>
                    <span className={styles.configSlotBadge}>
                      {CATEGORY_LABELS[field.category]}
                    </span>
                  </div>
                  {field.sourceExamples[0] ? (
                    <p className={styles.configSlotPreview}>
                      «{field.sourceExamples[0]}»
                    </p>
                  ) : null}
                  <p className={styles.configSlotReason}>
                    {field.notes ?? MODE_LABELS[field.mode]}
                  </p>
                  <div className={styles.configSlotActions} role="group">
                    {MODE_OPTIONS.map((opt) => (
                      <label key={opt.value} className={styles.configToggle}>
                        <input
                          type="radio"
                          name={`mode-${field.id}`}
                          checked={field.mode === opt.value}
                          onChange={() =>
                            patchField(field.id, {
                              mode: opt.value,
                              variableSource:
                                opt.value === 'variable'
                                  ? field.variableSource ?? 'wedding'
                                  : undefined,
                            })
                          }
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                  {field.mode === 'variable' ? (
                    <div className={styles.configSlotActions}>
                      <label className={styles.configToggle}>
                        Źródło danych
                        <select
                          value={field.variableSource ?? 'wedding'}
                          onChange={(e) =>
                            patchField(field.id, {
                              variableSource: e.target
                                .value as TemplateVariableSource,
                            })
                          }
                        >
                          {SOURCE_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.configToggle}>
                        <input
                          type="checkbox"
                          checked={field.requiredWhenVariable}
                          onChange={(e) =>
                            patchField(field.id, {
                              requiredWhenVariable: e.target.checked,
                            })
                          }
                        />
                        Wymagane
                      </label>
                    </div>
                  ) : null}
                  {protectedFixed ? (
                    <div className={styles.configWarning}>
                      <p>{PROTECTED_FIXED_WARNING}</p>
                      <label className={styles.configToggle}>
                        <input
                          type="checkbox"
                          checked={
                            field.fixedClientRiskConfirmed ||
                            confirmFixedIds.includes(field.id)
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setConfirmFixedIds((prev) =>
                                prev.includes(field.id)
                                  ? prev
                                  : [...prev, field.id],
                              )
                              patchField(field.id, {
                                fixedClientRiskConfirmed: true,
                              })
                            } else {
                              setConfirmFixedIds((prev) =>
                                prev.filter((x) => x !== field.id),
                              )
                              patchField(field.id, {
                                fixedClientRiskConfirmed: false,
                              })
                            }
                          }}
                        />
                        Rozumiem ryzyko i zostawiam jako stałe
                      </label>
                    </div>
                  ) : null}
                  {showDev ? (
                    <p className={styles.configSlotKey}>
                      {field.semanticRole}
                      {field.canonicalFieldKey
                        ? ` → ${field.canonicalFieldKey}`
                        : ''}{' '}
                      · {field.detectedAnchorIds.join(', ')}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <button
        type="button"
        className={styles.backLink}
        onClick={() => setShowDev((v) => !v)}
      >
        {showDev ? 'Ukryj szczegóły techniczne' : 'Pokaż szczegóły techniczne'}
      </button>

      {errors && errors.length > 0 ? (
        <ul className={styles.configWarning}>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      <div className={styles.configSlotActions}>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={() => trySave(false)}
        >
          Zapisz konfigurację
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={saving}
          onClick={() => trySave(true)}
        >
          Zapisz i oznacz jako gotowy
        </Button>
      </div>
    </div>
  )
}
