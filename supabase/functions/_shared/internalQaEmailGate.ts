export type InternalQaEmailDispatchResult<T> =
  | { status: 'suppressed' }
  | { status: 'sent'; value: T }

/** Central send-boundary gate; in-app delivery is handled on its own channel. */
export async function dispatchEmailUnlessInternalQa<T>(input: {
  isInternalQa: boolean
  onSuppressed: () => Promise<void>
  send: () => Promise<T>
}): Promise<InternalQaEmailDispatchResult<T>> {
  if (input.isInternalQa) {
    await input.onSuppressed()
    return { status: 'suppressed' }
  }
  return { status: 'sent', value: await input.send() }
}
