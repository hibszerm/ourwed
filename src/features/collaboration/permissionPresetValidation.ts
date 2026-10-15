const CONTROL_CHARACTERS = /\p{Cc}/u

export function presetNameError(value: string): string {
  const canonical = value.trim()
  if (!canonical) return 'Podaj nazwę zestawu.'
  if (CONTROL_CHARACTERS.test(value)) return 'Nazwa nie może zawierać znaków sterujących.'
  if (Array.from(canonical).length > 80) return 'Nazwa może mieć maksymalnie 80 znaków.'
  return ''
}

export function presetDescriptionError(value: string): string {
  if (CONTROL_CHARACTERS.test(value)) return 'Opis nie może zawierać znaków sterujących.'
  if (Array.from(value.trim()).length > 240) return 'Opis może mieć maksymalnie 240 znaków.'
  return ''
}
