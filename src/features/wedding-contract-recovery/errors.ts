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
  | 'CONTRACT_RECOVERY_INVALID_DECISIONS'
  | 'CONTRACT_RECOVERY_APPLY_FAILED'
  | 'CONTRACT_RECOVERY_WEDDING_CHANGED'
  | 'CONTRACT_RECOVERY_UNAUTHORIZED'
  | 'CONTRACT_RECOVERY_DUPLICATE_SOURCE'

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
  CONTRACT_RECOVERY_INVALID_DECISIONS:
    'Niektóre zmiany nie są już dostępne. Wróć do sprawdzania danych i spróbuj ponownie.',
  CONTRACT_RECOVERY_APPLY_FAILED:
    'Nie udało się zapisać danych z umowy. Spróbuj ponownie za chwilę.',
  CONTRACT_RECOVERY_WEDDING_CHANGED:
    'Dane ślubu zmieniły się od czasu przygotowania podglądu. Odśwież porównanie.',
  CONTRACT_RECOVERY_UNAUTHORIZED: 'Brak dostępu do tego zasobu.',
  CONTRACT_RECOVERY_DUPLICATE_SOURCE:
    'Ta sama umowa jest już dodana do tego zlecenia. Otwórz istniejący dokument źródłowy.',
}

export class ContractRecoveryError extends Error {
  readonly code: ContractRecoveryErrorCode
  readonly diagnosticCategory?: 'rpc_type_mismatch' | 'rpc_constraint' | 'rpc_database_error'

  constructor(
    code: ContractRecoveryErrorCode,
    message?: string,
    diagnosticCategory?: ContractRecoveryError['diagnosticCategory'],
  ) {
    super(message ?? USER_MESSAGES[code])
    this.name = 'ContractRecoveryError'
    this.code = code
    this.diagnosticCategory = diagnosticCategory
  }
}

export function contractRecoveryUserMessage(code: ContractRecoveryErrorCode): string {
  return USER_MESSAGES[code]
}
