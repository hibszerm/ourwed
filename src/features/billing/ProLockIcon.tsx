import type { SVGProps } from 'react'

/** Shared lock glyph for PRO-locked affordances (no emoji). */
export function ProLockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M5.25 6.5V5a2.75 2.75 0 0 1 5.5 0v1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <rect
        x="3.25"
        y="6.5"
        width="9.5"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="8" cy="10" r="1" fill="currentColor" />
    </svg>
  )
}
