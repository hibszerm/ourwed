/**
 * Run: npm run test:session-validation
 */
import { sessionFormSchema } from '@/features/sessions/sessionFormSchema'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

const base = {
  sessionType: 'engagement' as const,
  date: '2026-08-12',
  totalPrice: 1200,
  depositAmount: 300,
  primaryPerson: {},
  secondaryPerson: {},
}

{
  const r = sessionFormSchema.safeParse({
    ...base,
    customName: 'Sesja produktowa dla Atelier',
    sessionType: 'other',
    customSessionType: 'Produktowa',
    totalPrice: 0,
    depositAmount: 0,
  })
  assert(r.success, 'custom-name-only other ok')
}

{
  const r = sessionFormSchema.safeParse({
    ...base,
    primaryPerson: { firstName: 'Katarzyna', lastName: 'Kowalska' },
    sessionType: 'business',
    depositAmount: 0,
  })
  assert(r.success, 'one-person ok')
}

{
  const r = sessionFormSchema.safeParse({
    ...base,
    sessionType: 'other',
    customName: 'X',
    customSessionType: '',
  })
  assert(!r.success, 'other requires custom type')
}

{
  const r = sessionFormSchema.safeParse({
    ...base,
    customName: 'X',
    depositAmount: 1500,
    totalPrice: 1200,
  })
  assert(!r.success, 'deposit > total')
}

{
  const r = sessionFormSchema.safeParse({
    ...base,
    customName: 'X',
    startTime: '16:00',
    endTime: '14:00',
  })
  assert(!r.success, 'end before start')
}

{
  const r = sessionFormSchema.safeParse({
    ...base,
    date: '2026-08-12',
    totalPrice: 1200,
    depositAmount: 300,
  })
  assert(!r.success, 'needs name or person')
}

console.log('PASS  session validation')
