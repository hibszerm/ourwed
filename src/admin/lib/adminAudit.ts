import { supabase } from '@/lib/supabase'
import { maskEmail } from '@/admin/lib/maskEmail'

export { maskEmail }

export async function appendAdminAuditEvent(input: {
  action: string
  targetType?: string | null
  targetId?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await supabase.rpc('append_admin_audit_event', {
      p_action: input.action,
      p_target_type: input.targetType ?? null,
      p_target_id: input.targetId ?? null,
      p_metadata: input.metadata ?? {},
    })
  } catch {
    // Audit must never block auth UX.
  }
}
