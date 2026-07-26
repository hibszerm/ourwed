import { resolveClientNameParts } from '@/features/ai-contract-lab/clientNameParts'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import type { CompanyDetails } from '@/types/company'
import type { WeddingExtraService } from '@/types/package'
import type { WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import type {
  ContractCanonicalField,
  ContractDataSnapshot,
} from '@/features/ai-contract-lab/aiContractLabTypes'

function formatCompanyAddressLocal(details: CompanyDetails): string {
  return [details.address, details.postalCode, details.city]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ')
}

function field(
  partial: Omit<ContractCanonicalField, 'formattedValue'> & {
    formattedValue?: string | null
  },
): ContractCanonicalField {
  const raw = partial.value
  let formatted: string | null =
    partial.formattedValue !== undefined ? partial.formattedValue : null
  if (formatted == null && raw != null && raw !== '') {
    if (typeof raw === 'boolean') formatted = raw ? 'Tak' : 'Nie'
    else formatted = String(raw)
  }
  if (formatted != null && !formatted.trim()) formatted = null
  return {
    ...partial,
    formattedValue: formatted,
  }
}

function money(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null
  return formatCurrency(n)
}

/** Canonical laboratory payload — reuses commercial helpers, never catalog live prices. */
export function buildContractDataSnapshot(input: {
  wedding: Wedding
  company: CompanyDetails | null
  extras: WeddingExtraService[]
  places: WeddingPlace[]
}): ContractDataSnapshot {
  const { wedding, company, extras, places } = input
  const c = wedding.couple
  const commercial = getWeddingCommercialSummary(wedding)
  const byRole = new Map(places.map((p) => [p.role, p]))

  const brideParts = resolveClientNameParts({
    firstName: c.partner1FirstName,
    lastName: c.partner1LastName,
    fullName: c.partner1,
  })
  const groomParts = resolveClientNameParts({
    firstName: c.partner2FirstName,
    lastName: c.partner2LastName,
    fullName: c.partner2,
  })
  const brideFirst = brideParts.firstName
  const brideLast = brideParts.lastName
  const groomFirst = groomParts.firstName
  const groomLast = groomParts.lastName
  const brideFull =
    [brideFirst, brideLast].filter(Boolean).join(' ') || c.partner1.trim()
  const groomFull =
    [groomFirst, groomLast].filter(Boolean).join(' ') || c.partner2.trim()

  const fields: ContractCanonicalField[] = [
    field({
      key: 'bride.first_name',
      label: 'Imię Panny Młodej',
      category: 'client',
      value: brideFirst || null,
      dataType: 'text',
      source: 'wedding.couple',
    }),
    field({
      key: 'bride.last_name',
      label: 'Nazwisko Panny Młodej',
      category: 'client',
      value: brideLast || null,
      dataType: 'text',
      source: 'wedding.couple',
    }),
    field({
      key: 'bride.full_name',
      label: 'Panna Młoda — imię i nazwisko',
      category: 'client',
      value: brideFull || null,
      dataType: 'text',
      source: 'wedding.couple',
    }),
    field({
      key: 'bride.phone',
      label: 'Telefon Panny Młodej',
      category: 'client',
      value: c.partner1Phone?.trim() || c.phone?.trim() || null,
      dataType: 'phone',
      source: 'wedding.couple',
    }),
    field({
      key: 'bride.email',
      label: 'E-mail Panny Młodej',
      category: 'client',
      value: c.partner1Email?.trim() || c.email?.trim() || null,
      dataType: 'email',
      source: 'wedding.couple',
    }),
    field({
      key: 'bride.address',
      label: 'Adres Panny Młodej',
      category: 'client',
      value:
        [c.partner1Address, c.partner1PostalCode, c.partner1City]
          .filter(Boolean)
          .join(', ') || null,
      dataType: 'address',
      source: 'wedding.couple',
    }),
    field({
      key: 'groom.first_name',
      label: 'Imię Pana Młodego',
      category: 'client',
      value: groomFirst || null,
      dataType: 'text',
      source: 'wedding.couple',
    }),
    field({
      key: 'groom.last_name',
      label: 'Nazwisko Pana Młodego',
      category: 'client',
      value: groomLast || null,
      dataType: 'text',
      source: 'wedding.couple',
    }),
    field({
      key: 'groom.full_name',
      label: 'Pan Młody — imię i nazwisko',
      category: 'client',
      value: groomFull || null,
      dataType: 'text',
      source: 'wedding.couple',
    }),
    field({
      key: 'groom.phone',
      label: 'Telefon Pana Młodego',
      category: 'client',
      value: c.partner2Phone?.trim() || null,
      dataType: 'phone',
      source: 'wedding.couple',
    }),
    field({
      key: 'groom.email',
      label: 'E-mail Pana Młodego',
      category: 'client',
      value: c.partner2Email?.trim() || null,
      dataType: 'email',
      source: 'wedding.couple',
    }),
    field({
      key: 'groom.address',
      label: 'Adres Pana Młodego',
      category: 'client',
      value:
        [c.partner2Address, c.partner2PostalCode, c.partner2City]
          .filter(Boolean)
          .join(', ') || null,
      dataType: 'address',
      source: 'wedding.couple',
    }),
    field({
      key: 'couple.full_names',
      label: 'Para — pełne imiona',
      category: 'client',
      value:
        brideFull && groomFull ? `${brideFull} i ${groomFull}` : null,
      dataType: 'text',
      source: 'wedding.couple',
    }),
    field({
      key: 'wedding.date',
      label: 'Data ślubu',
      category: 'wedding',
      value: wedding.date || null,
      formattedValue: wedding.date ? formatDotDate(wedding.date) : null,
      dataType: 'date',
      source: 'wedding',
    }),
    field({
      key: 'contract.execution_date',
      label: 'Data zawarcia umowy',
      category: 'wedding',
      // Lab-only canonical slot — not wedding.date. Prefer signedAt when present.
      value:
        (wedding.contract as { signedAt?: string } | undefined)?.signedAt?.trim() ||
        null,
      formattedValue: (() => {
        const raw =
          (wedding.contract as { signedAt?: string } | undefined)?.signedAt?.trim() ||
          null
        if (!raw) return null
        const iso = raw.slice(0, 10)
        return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDotDate(iso) : formatDate(raw)
      })(),
      dataType: 'date',
      source: 'wedding.contract.signedAt',
    }),
    field({
      key: 'wedding.ceremony_time',
      label: 'Godzina ceremonii',
      category: 'wedding',
      value: wedding.ceremonyTime?.trim() || null,
      dataType: 'text',
      source: 'wedding',
    }),
    field({
      key: 'wedding.workflow_stage',
      label: 'Etap workflow',
      category: 'wedding',
      value: wedding.workflowStage,
      dataType: 'text',
      source: 'wedding',
    }),
    field({
      key: 'company.legal_name',
      label: 'Nazwa firmy',
      category: 'company',
      value: company?.companyName?.trim() || null,
      dataType: 'text',
      source: 'studio_details',
    }),
    field({
      key: 'company.owner_name',
      label: 'Właściciel',
      category: 'company',
      value: company?.ownerName?.trim() || null,
      dataType: 'text',
      source: 'studio_details',
    }),
    field({
      key: 'company.address',
      label: 'Adres firmy',
      category: 'company',
      value: company ? formatCompanyAddressLocal(company) || null : null,
      dataType: 'address',
      source: 'studio_details',
    }),
    field({
      key: 'company.city',
      label: 'Miasto firmy',
      category: 'company',
      value: company?.city?.trim() || null,
      dataType: 'text',
      source: 'studio_details',
    }),
    field({
      key: 'company.nip',
      label: 'NIP',
      category: 'company',
      value: company?.nip?.trim() || null,
      dataType: 'text',
      source: 'studio_details',
    }),
    field({
      key: 'company.regon',
      label: 'REGON',
      category: 'company',
      value: company?.regon?.trim() || null,
      dataType: 'text',
      source: 'studio_details',
    }),
    field({
      key: 'company.bank_account',
      label: 'Numer konta',
      category: 'company',
      value: company?.bankAccount?.trim() || company?.iban?.trim() || null,
      dataType: 'text',
      source: 'studio_details',
    }),
    field({
      key: 'company.email',
      label: 'E-mail firmy',
      category: 'company',
      value: company?.email?.trim() || null,
      dataType: 'email',
      source: 'studio_details',
    }),
    field({
      key: 'company.phone',
      label: 'Telefon firmy',
      category: 'company',
      value: company?.phone?.trim() || null,
      dataType: 'phone',
      source: 'studio_details',
    }),
    field({
      key: 'package.name',
      label: 'Nazwa pakietu',
      category: 'package',
      value: commercial.packageName || null,
      dataType: 'text',
      source: 'wedding.package_snapshot',
    }),
    field({
      key: 'package.contract_value',
      label: 'Wartość umowy',
      category: 'package',
      value: commercial.contractValue,
      formattedValue: money(commercial.contractValue),
      dataType: 'money',
      source: 'wedding.commercial',
    }),
    field({
      key: 'package.coverage_hours',
      label: 'Czas reportażu (h)',
      category: 'package',
      value: commercial.coverageHours,
      dataType: 'duration',
      source: 'wedding.package_snapshot',
    }),
    field({
      key: 'package.coverage_end_time',
      label: 'Koniec reportażu',
      category: 'package',
      value: commercial.coverageEndTime,
      dataType: 'text',
      source: 'wedding.package_snapshot',
    }),
    field({
      key: 'package.overtime_rate',
      label: 'Stawka nadgodziny',
      category: 'package',
      value: commercial.overtimeRate,
      formattedValue: money(commercial.overtimeRate),
      dataType: 'money',
      source: 'wedding.package_snapshot',
    }),
    field({
      key: 'package.delivery_term',
      label: 'Termin oddania',
      category: 'package',
      value:
        commercial.deliveryMonths != null
          ? `${commercial.deliveryMonths} mies.`
          : commercial.deliveryDays != null
            ? `${commercial.deliveryDays} dni`
            : null,
      dataType: 'text',
      source: 'wedding.package_snapshot',
    }),
    field({
      key: 'package.contents',
      label: 'Zawartość pakietu',
      category: 'package',
      value:
        commercial.packageItems
          .filter((i) => i.enabled !== false)
          .map((i) => i.title)
          .join('; ') || null,
      dataType: 'text',
      source: 'wedding.package_items_snapshot',
    }),
    field({
      key: 'payments.agreed_deposit',
      label: 'Uzgodniony zadatek',
      category: 'payments',
      value: commercial.agreedDeposit,
      formattedValue: money(commercial.agreedDeposit),
      dataType: 'money',
      source: 'wedding.commercial',
    }),
    field({
      key: 'payments.deposit_paid',
      label: 'Wpłacony zadatek',
      category: 'payments',
      value: commercial.depositPaid,
      formattedValue: money(commercial.depositPaid),
      dataType: 'money',
      source: 'wedding.payments',
    }),
    field({
      key: 'payments.total_paid',
      label: 'Suma wpłat',
      category: 'payments',
      value: commercial.totalPaid,
      formattedValue: money(commercial.totalPaid),
      dataType: 'money',
      source: 'wedding.payments',
    }),
    field({
      key: 'payments.remaining',
      label: 'Pozostało do zapłaty',
      category: 'payments',
      value: commercial.remainingToPay,
      formattedValue: money(commercial.remainingToPay),
      dataType: 'money',
      source: 'wedding.commercial',
    }),
    field({
      key: 'payments.final_due_date',
      label: 'Termin płatności końcowej',
      category: 'payments',
      value: commercial.finalPaymentDueDate,
      formattedValue: commercial.finalPaymentDueDate
        ? formatDate(commercial.finalPaymentDueDate)
        : null,
      dataType: 'date',
      source: 'wedding',
    }),
  ]

  extras.forEach((e, i) => {
    fields.push(
      field({
        key: `extras.${i}.label`,
        label: `Usługa dodatkowa: ${e.name || 'Usługa'}`,
        category: 'extras',
        value: e.name?.trim() || null,
        dataType: 'text',
        source: 'wedding_extra_services',
      }),
      field({
        key: `extras.${i}.line_total`,
        label: `Wartość: ${e.name || 'Usługa'}`,
        category: 'extras',
        value: e.priceSnapshot * e.quantity,
        formattedValue: money(e.priceSnapshot * e.quantity),
        dataType: 'money',
        source: 'wedding_extra_services',
      }),
    )
  })

  const loc = (
    role: string,
    key: string,
    label: string,
    fallback: string | undefined,
  ) => {
    const place = byRole.get(role as WeddingPlace['role'])
    const text =
      place?.formattedAddress?.trim() ||
      place?.label?.trim() ||
      fallback?.trim() ||
      null
    fields.push(
      field({
        key,
        label,
        category: 'location',
        value: text,
        dataType: 'address',
        source: place ? 'wedding_places' : 'wedding',
      }),
    )
  }

  loc(
    'bride_preparation',
    'location.bride_preparation',
    'Przygotowania Panny Młodej',
    wedding.bridePreparationLocation,
  )
  loc(
    'groom_preparation',
    'location.groom_preparation',
    'Przygotowania Pana Młodego',
    wedding.groomPreparationLocation,
  )
  loc(
    'ceremony',
    'location.ceremony',
    'Ceremonia',
    wedding.ceremonyLocation,
  )
  loc(
    'reception',
    'location.reception',
    'Przyjęcie weselne',
    wedding.receptionLocation,
  )

  // Derived semantic providers (Phase B) — not stored wedding columns
  const weddingIso = wedding.date?.trim() || null
  const contractSigned =
    (wedding.contract as { signedAt?: string } | undefined)?.signedAt?.trim() ||
    null
  const contractIso =
    contractSigned && /^\d{4}-\d{2}-\d{2}/.test(contractSigned)
      ? contractSigned.slice(0, 10)
      : null

  if (contractIso) {
    const depositDueIso = addDaysIso(contractIso, 7)
    fields.push(
      field({
        key: 'derived.deposit_due_from_contract_date',
        label: 'Termin zadatku (data umowy + 7 dni)',
        category: 'payments',
        value: depositDueIso,
        formattedValue: depositDueIso ? formatDotDate(depositDueIso) : null,
        dataType: 'date',
        source: 'derived:contract.executionDate+7d',
      }),
    )
  }

  if (weddingIso) {
    fields.push(
      field({
        key: 'derived.final_payment_due_on_wedding_date',
        label: 'Termin dopłaty (dzień ślubu)',
        category: 'payments',
        value: weddingIso,
        formattedValue: formatDotDate(weddingIso),
        dataType: 'date',
        source: 'derived:wedding.date',
      }),
    )
    const deliveryMonths = commercial.deliveryMonths
    if (deliveryMonths != null && Number.isFinite(deliveryMonths) && deliveryMonths > 0) {
      const deliveryIso = addMonthsIso(weddingIso, deliveryMonths)
      fields.push(
        field({
          key: 'derived.delivery_deadline',
          label: 'Termin oddania materiałów',
          category: 'package',
          value: deliveryIso,
          formattedValue: deliveryIso ? formatDotDate(deliveryIso) : null,
          dataType: 'date',
          source: 'derived:wedding.date+deliveryMonths',
        }),
      )
    }
    const previewDays =
      typeof (wedding as { teaserDays?: number }).teaserDays === 'number'
        ? (wedding as { teaserDays?: number }).teaserDays
        : null
    if (previewDays != null && previewDays > 0) {
      const previewIso = addDaysIso(weddingIso, previewDays)
      fields.push(
        field({
          key: 'derived.preview_deadline',
          label: 'Termin podglądu / teasera',
          category: 'package',
          value: previewIso,
          formattedValue: previewIso ? formatDotDate(previewIso) : null,
          dataType: 'date',
          source: 'derived:wedding.date+previewDays',
        }),
      )
    }
  }

  const availableCount = fields.filter((f) => f.formattedValue != null).length
  const unavailableCount = fields.length - availableCount

  return {
    weddingId: wedding.id,
    generatedAt: new Date().toISOString(),
    fields,
    availableCount,
    unavailableCount,
  }
}

/** DD.MM.YYYY for Polish contract date literals (calendar date, no TZ shift). */
function formatDotDate(isoDate: string): string {
  const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}.${m[2]}.${m[1]}`
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return isoDate
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

function addMonthsIso(isoDate: string, months: number): string | null {
  const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const day = Number(m[3])
  const d = new Date(Date.UTC(y, mo + Math.round(months), day))
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function addDaysIso(isoDate: string, days: number): string | null {
  const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const day = Number(m[3])
  const d = new Date(Date.UTC(y, mo, day + Math.round(days)))
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}
