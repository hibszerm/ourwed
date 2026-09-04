export function assertBriefPdfBytes(bytes: ArrayBuffer): void {
  if (!bytes || bytes.byteLength < 8) {
    throw new Error('Wygenerowany plik PDF jest pusty.')
  }
  const prefix = new TextDecoder().decode(
    new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength)),
  )
  if (prefix !== '%PDF-') {
    throw new Error('Usługa konwersji nie zwróciła prawidłowego pliku PDF.')
  }
}
