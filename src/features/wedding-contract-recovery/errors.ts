export type ContractRecoveryErrorCode =
  | 'CONTRACT_RECOVERY_UNSUPPORTED_FILE'
  | 'CONTRACT_RECOVERY_FILE_TOO_LARGE'
  | 'CONTRACT_RECOVERY_EMPTY_DOCUMENT_TEXT'
  | 'CONTRACT_RECOVERY_PASSWORD_PROTECTED_PDF'
  | 'CONTRACT_RECOVERY_DOCUMENT_PARSE_FAILED'
  | 'CONTRACT_RECOVERY_AI_FAILED'
  | 'CONTRACT_RECOVERY_INVALID_AI_OUTPUT'
  | 'CONTRACT_RECOVERY_NOT_FOUND'
  | 'CONTRACT_RECOVERY_ALREADY_APPLIED'
  | 'CONTRACT_RECOVERY_WEDDING_CHANGED'
  | 'CONTRACT_RECOVERY_UNAUTHORIZED'

const USER_MESSAGES: Record<ContractRecoveryErrorCode, string> = {
  CONTRACT_RECOVERY_UNSUPPORTED_FILE:
    'Obsługiwane są tylko pliki PDF i DOCX.',
  CONTRACT_RECOVERY_FILE_TOO_LARGE:
    'Plik jest zbyt duży. Maksymalny rozmiar to 15 MB.',
  CONTRACT_RECOVERY_EMPTY_DOCUMENT_TEXT:
    'Nie udało się odczytać tekstu z tego pliku. Obsługa skanowanych umów zostanie dodana później.',
  CONTRACT_RECOVERY_PASSWORD_PROTECTED_PDF:
    'Ten plik PDF jest zabezpieczony hasłem i nie może zostać odczytany.',
  CONTRACT_RECOVERY_DOCUMENT_PARSE_FAILED:
    'Nie udało się odczytać pliku. Sprawdź, czy dokument nie jest uszkodzony.',
  CONTRACT_RECOVERY_AI_FAILED:
    'Analiza umowy nie powiodła się. Spróbuj ponownie za chwilę.',
  CONTRACT_RECOVERY_INVALID_AI_OUTPUT:
    'Nie udało się poprawnie rozpoznać danych z umowy.',
  CONTRACT_RECOVERY_NOT_FOUND: 'Nie znaleziono analizy umowy.',
  CONTRACT_RECOVERY_ALREADY_APPLIED:
    'Te dane zostały już zapisane. Rozpocznij ponowną analizę, aby wprowadzić nowe zmiany.',
  CONTRACT_RECOVERY_WEDDING_CHANGED:
    'Dane ślubu zmieniły się od czasu przygotowania podglądu. Odśwież porównanie.',
  CONTRACT_RECOVERY_UNAUTHORIZED: 'Brak dostępu do tego zasobu.',
}

export class ContractRecoveryError extends Error {
  readonly code: ContractRecoveryErrorCode

  constructor(code: ContractRecoveryErrorCode, message?: string) {
    super(message ?? USER_MESSAGES[code])
    this.name = 'ContractRecoveryError'
    this.code = code
  }
}

export function contractRecoveryUserMessage(code: ContractRecoveryErrorCode): string {
  return USER_MESSAGES[code]
}
