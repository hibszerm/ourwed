/** Polish domain copy — used-service delete is blocked by ON DELETE RESTRICT. */
export const EXTRA_SERVICE_IN_USE_MESSAGE =
  'Ta usługa jest już przypisana do ślubu. Nie można jej usunąć, bo zachowujemy historię zlecenia.'

export function isExtraServiceInUseError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false
  const record = error as { code?: string; message?: string }
  if (record.code === '23503') return true
  const message = typeof record.message === 'string' ? record.message : ''
  return /foreign key constraint/i.test(message) || /wedding_extra_services/i.test(message)
}
