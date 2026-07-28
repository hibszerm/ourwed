/**
 * Content hash for analysis cache keys (SHA-256 hex).
 */

function digestToHex(digest: ArrayBuffer): string {
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashDocumentText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return digestToHex(digest)
}

export async function hashBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return digestToHex(digest)
}
