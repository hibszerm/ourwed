import type { ContractGenerationAnswer, MissingInput } from './generationProtocol'

export function answersForMissingInputs(
  requirements: readonly MissingInput[],
  values: Readonly<Record<string, string>>,
): ContractGenerationAnswer[] {
  return requirements.map((requirement) => ({
    missingInputId: requirement.id,
    value: requirement.answerKind === 'date' || requirement.answerKind === 'number'
      ? values[requirement.id] ?? ''
      : (values[requirement.id] ?? '').trim(),
  }))
}
