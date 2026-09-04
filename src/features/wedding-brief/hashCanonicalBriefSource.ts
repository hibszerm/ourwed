import { hashDocumentText } from '@/features/documents/ai/hash'
import {
  serializeCanonicalBriefSource,
  type CanonicalBriefSource,
} from '@/features/wedding-brief/canonicalBriefSource'

/** SHA-256 hex (lowercase) of the canonical Brief source JSON. */
export async function hashCanonicalBriefSource(
  source: CanonicalBriefSource,
): Promise<string> {
  return hashDocumentText(serializeCanonicalBriefSource(source))
}
