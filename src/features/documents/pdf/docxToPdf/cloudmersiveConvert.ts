/**
 * Re-export canonical Cloudmersive convert from Edge module (single implementation).
 * Node/POC/tests import from here; browser must never call Cloudmersive directly.
 */
export {
  CLOUDMERSIVE_DOCX_TO_PDF_URL,
  CLOUDMERSIVE_FREE_TIER_MAX_BYTES,
  assertWithinCloudmersiveFreeTierSize,
  buildCloudmersiveAuthHeaders,
  convertDocxViaCloudmersive,
  mapCloudmersiveHttpError,
  type CloudmersiveConvertConfig,
  type ConvertDocxToPdfResult,
} from '../../../../../supabase/functions/contract-docx-to-pdf/cloudmersiveConvert.ts'

import { convertDocxViaCloudmersive } from '../../../../../supabase/functions/contract-docx-to-pdf/cloudmersiveConvert.ts'
import type { CloudmersiveConvertConfig } from '../../../../../supabase/functions/contract-docx-to-pdf/cloudmersiveConvert.ts'
import type { ConvertDocxToPdfInput } from './types'

export function createCloudmersiveDocxToPdfProvider(
  config: CloudmersiveConvertConfig,
  fetchImpl?: typeof fetch,
): {
  id: 'cloudmersive'
  convertDocxToPdf: (
    input: ConvertDocxToPdfInput,
  ) => Promise<{ pdfBytes: Uint8Array; provider: 'cloudmersive' }>
} {
  return {
    id: 'cloudmersive',
    convertDocxToPdf: (input) =>
      convertDocxViaCloudmersive({
        docxBytes: input.docxBytes,
        filename: input.filename,
        config,
        fetchImpl,
      }),
  }
}
