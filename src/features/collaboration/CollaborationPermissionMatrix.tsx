import type { KeyboardEvent } from 'react'
import type { CustomCapabilityGrant } from './accessManagementTypes'
import { ACTIVE_PERMISSION_GROUPS, replacePermissionGroup } from './CollaborationPermissionMatrixModel'
import styles from './CollaborationPermissionMatrix.module.css'

function groupLevel(grants: CustomCapabilityGrant[], key: string) {
  return grants.find((grant) => grant.capability_key === key)?.level ?? 0
}

function Group({ group, grants, onChange, disabled }: {
  group: typeof ACTIVE_PERMISSION_GROUPS[number]
  grants: CustomCapabilityGrant[]
  onChange: (capabilities: readonly string[], level: number) => void
  disabled?: boolean
}) {
  const levels = group.capabilities.map((key) => groupLevel(grants, key))
  const selected = levels.every((level) => level === levels[0]) ? levels[0] : -1
  const mixedId = `${group.key}-mixed-state`
  function handleKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = Math.max(0, group.levels.indexOf(selected as never))
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % group.levels.length
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + group.levels.length - 1) % group.levels.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? group.levels.length - 1 : -1
    if (next < 0) return
    event.preventDefault()
    onChange(group.capabilities, group.levels[next])
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }
  return <div className={styles.row}>
    <span className={styles.label}>{group.label}</span>
    <div className={styles.controls} role="radiogroup" aria-label={group.label}
      aria-describedby={selected === -1 ? mixedId : undefined}>
      {group.levels.map((level) => <button key={level} type="button" role="radio"
        aria-checked={selected === level} disabled={disabled}
        tabIndex={selected === level || (selected === -1 && level === group.levels[0]) ? 0 : -1}
        className={selected === level ? styles.selected : ''}
        onClick={() => onChange(group.capabilities, level)} onKeyDown={handleKey}>
        {level === 0 ? 'Brak' : level === 1 ? 'Podgląd' : 'Edycja'}
      </button>)}
    </div>
    {selected === -1 ? <small id={mixedId} className={styles.mixed}>Różne poziomy</small> : null}
  </div>
}

export function CollaborationPermissionMatrix({ grants, onChange, disabled }: {
  grants: CustomCapabilityGrant[]
  onChange: (grants: CustomCapabilityGrant[]) => void
  disabled?: boolean
}) {
  return <div className={styles.matrix}>
    {ACTIVE_PERMISSION_GROUPS.map((group) => <Group key={group.key} group={group} grants={grants}
      disabled={disabled} onChange={(capabilities, level) => onChange(replacePermissionGroup(grants, capabilities, level))} />)}
  </div>
}
