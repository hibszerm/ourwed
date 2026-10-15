import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import type { CustomCapabilityGrant } from './accessManagementTypes'
import { useCollaborationPermissionPresets, collaborationPermissionPresetKeys } from './useCollaborationPermissionPresets'
import { permissionPresetService } from './permissionPresetService'
import styles from './CollaborationPermissionPresetPicker.module.css'

export function CollaborationPermissionPresetPicker({ onApply }: { onApply: (grants: CustomCapabilityGrant[]) => void }) {
  const userId = useStudioAuthId()
  const client = useQueryClient()
  const presets = useCollaborationPermissionPresets()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [notice, setNotice] = useState('')

  async function apply(presetId: string, name: string) {
    setLoadingId(presetId)
    setError(false)
    setNotice('')
    try {
      const detail = await client.fetchQuery({
        queryKey: collaborationPermissionPresetKeys.detail(userId, presetId),
        queryFn: () => permissionPresetService.get(presetId),
      })
      onApply(detail.grants.map((grant) => ({ ...grant })))
      setNotice(`Zastosowano zestaw „${name}”. Możesz zmienić zakres przed zapisaniem.`)
    } catch {
      setError(true)
      void presets.refetch()
    } finally {
      setLoadingId(null)
    }
  }

  const system = presets.data?.filter((item) => item.scope === 'system') ?? []
  const mine = presets.data?.filter((item) => item.scope === 'user') ?? []
  return <section className={styles.picker} aria-label="Zestawy dostępu">
    <p className={styles.help}>Zestaw uzupełnia zakres dostępu. Po zastosowaniu możesz go dowolnie zmienić przed zapisaniem.</p>
    {presets.isLoading ? <p role="status">Ładowanie zestawów…</p> : null}
    {presets.isError || error ? <div className={styles.error} role="alert">
      <p>Nie udało się wczytać zestawu. Możesz nadal ustawić dostęp ręcznie.</p>
      <button type="button" onClick={() => { setError(false); void presets.refetch() }}>Spróbuj ponownie</button>
    </div> : null}
    {system.length ? <div className={styles.group}><h4>Zestawy OurWed</h4>{system.map((item) => <button
      key={item.preset_id} type="button" className={styles.item} disabled={loadingId !== null}
      onClick={() => void apply(item.preset_id, item.name)}>
      <span><strong>{item.name}</strong>{item.description ? <small>{item.description}</small> : null}</span>
      <span>{loadingId === item.preset_id ? 'Stosowanie…' : 'Zastosuj'}</span>
    </button>)}</div> : null}
    {mine.length ? <div className={styles.group}><h4>Moje zestawy</h4>{mine.map((item) => <button
      key={item.preset_id} type="button" className={styles.item} disabled={loadingId !== null}
      onClick={() => void apply(item.preset_id, item.name)}>
      <span><strong>{item.name}</strong>{item.description ? <small>{item.description}</small> : null}</span>
      <span>{loadingId === item.preset_id ? 'Stosowanie…' : 'Zastosuj'}</span>
    </button>)}</div> : null}
    {!presets.isLoading && !presets.isError && system.length + mine.length === 0 ? <p>Nie masz jeszcze własnych zestawów.</p> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
  </section>
}
