/**
 * CLOSED padlock parts for the real HeroPhoneFrame morph.
 * Shackle: closed U — both legs enter the body. Never open.
 */

type PartProps = {
  className?: string
}

export function LockShackle({ className }: PartProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 158 96"
      width="158"
      height="96"
      aria-hidden="true"
      focusable="false"
      data-security-lock-shackle=""
      data-security-lock-shackle-closed="true"
    >
      <path
        d="M 36 96
           L 36 42
           C 36 18 54 4 79 4
           C 104 4 122 18 122 42
           L 122 96"
        fill="none"
        stroke="currentColor"
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LockKeyhole({ className }: PartProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 44 58"
      width="44"
      height="58"
      aria-hidden="true"
      focusable="false"
      data-security-lock-keyhole-shape=""
    >
      <circle cx="22" cy="18" r="10" fill="var(--lv2-paper, #f3efe8)" />
      <path d="M15 18 L15 48 Q22 56 29 48 L29 18 Z" fill="var(--lv2-paper, #f3efe8)" />
    </svg>
  )
}

type FullProps = {
  className?: string
}

/** Tiny CLOSED lock for Studio History anchor ONLY (never the large morph body). */
export function SecurityLockGraphic({ className }: FullProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 248"
      width="200"
      height="248"
      aria-hidden="true"
      focusable="false"
      data-security-lock=""
      data-security-lock-keyhole="true"
      data-security-lock-open="false"
      data-security-lock-shackle-closed="true"
      data-security-lock-studio-anchor="true"
    >
      <path
        data-security-lock-shackle=""
        d="M 58 118 L 58 70 C 58 40 76 24 100 24 C 124 24 142 40 142 70 L 142 118"
        fill="none"
        stroke="currentColor"
        strokeWidth="20"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        data-security-lock-body=""
        x="30"
        y="108"
        width="140"
        height="116"
        rx="28"
        ry="28"
        fill="currentColor"
      />
      <g data-security-lock-keyhole-shape="">
        <circle cx="100" cy="156" r="13" fill="var(--lv2-paper, #f3efe8)" />
        <path d="M92 156 L92 194 Q100 204 108 194 L108 156 Z" fill="var(--lv2-paper, #f3efe8)" />
      </g>
    </svg>
  )
}
