import styles from './Avatar.module.css'

interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  color?: string
}

function getInitials(name: string): string {
  const coupleParts = name.split(/\s*&\s*/)
  if (coupleParts.length >= 2) {
    const left = coupleParts[0]?.trim().split(/\s+/)[0] ?? ''
    const right = coupleParts[1]?.trim().split(/\s+/)[0] ?? ''
    // Prefer partner first-name initials (Anna & Michał → AM).
    // Fall back to classic first+last of the left side when needed.
    if (left && right) {
      return `${left[0] ?? ''}${right[0] ?? ''}`.toUpperCase()
    }
  }

  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function Avatar({ name, size = 'md', color }: AvatarProps) {
  return (
    <div
      className={`${styles.avatar} ${styles[size]} ${color ? styles.custom : ''}`}
      style={color ? { background: color } : undefined}
      aria-hidden
    >
      {getInitials(name)}
    </div>
  )
}
