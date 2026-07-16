import styles from './Avatar.module.css'

interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  color?: string
}

function getInitials(name: string): string {
  return name
    .split(/[&\s]+/)
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
