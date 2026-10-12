import Foundation
import Security

guard CommandLine.arguments.count == 4 else {
  fputs("Expected action, account, and label.\n", stderr)
  exit(2)
}

let action = CommandLine.arguments[1]
let account = CommandLine.arguments[2]
let label = CommandLine.arguments[3]
let service = "OurWed Internal QA"
let base: [String: Any] = [
  kSecClass as String: kSecClassGenericPassword,
  kSecAttrService as String: service,
  kSecAttrAccount as String: account,
]

if action == "store" {
  let secret = FileHandle.standardInput.readDataToEndOfFile()
  guard !secret.isEmpty else {
    fputs("Credential input is empty.\n", stderr)
    exit(2)
  }
  let updates: [String: Any] = [
    kSecValueData as String: secret,
    kSecAttrLabel as String: label,
    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
  ]
  let updateStatus = SecItemUpdate(base as CFDictionary, updates as CFDictionary)
  if updateStatus == errSecItemNotFound {
    var add = base
    updates.forEach { add[$0.key] = $0.value }
    let addStatus = SecItemAdd(add as CFDictionary, nil)
    guard addStatus == errSecSuccess else {
      fputs("Keychain write failed.\n", stderr)
      exit(1)
    }
  } else if updateStatus != errSecSuccess {
    fputs("Keychain update failed.\n", stderr)
    exit(1)
  }
} else if action == "delete" {
  let status = SecItemDelete(base as CFDictionary)
  guard status == errSecSuccess || status == errSecItemNotFound else {
    fputs("Keychain delete failed.\n", stderr)
    exit(1)
  }
} else {
  fputs("Unsupported Keychain action.\n", stderr)
  exit(2)
}
