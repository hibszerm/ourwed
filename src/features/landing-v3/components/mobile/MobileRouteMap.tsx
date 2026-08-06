import {
  MOBILE_ROUTE_MAP_BOUNDS,
  MOBILE_ROUTE_SUMMARY,
} from '@/features/landing-v3/motion/mobileWeddingDaySequence'
import styles from './MobileRouteMap.module.css'

type Props = {
  routeProgress: number
}

const ROUTE_LENGTH = 520

/**
 * Intentionally designed conceptual map fragment.
 * viewBox 0 0 360 430 — safe area x 24–336, y 28–392.
 * Not real geography. Not procedural.
 */
export function MobileRouteMap({ routeProgress }: Props) {
  const r = MOBILE_ROUTE_SUMMARY
  const b = MOBILE_ROUTE_MAP_BOUNDS
  const destVisible = routeProgress >= 0.85
  const destLabelVisible = routeProgress >= 0.9

  return (
    <svg
      className={styles.svg}
      viewBox={b.viewBox}
      preserveAspectRatio="xMidYMid meet"
      data-map-svg="intentional"
      data-map-component="MobileRouteMap"
      data-map-safe="24-336,28-392"
    >
      <rect width="360" height="430" fill="#ebe6de" />

      {/* Organic park / soft land */}
      <path
        d="M36 56 C72 34, 118 44, 136 78 C152 108, 122 134, 86 128 C52 122, 24 88, 36 56 Z"
        fill="#d5e0d2"
        opacity="0.88"
      />
      <path
        d="M220 268 C258 248, 308 262, 324 300 C338 334, 304 368, 262 360 C224 352, 198 304, 220 268 Z"
        fill="#d2ddcf"
        opacity="0.82"
      />

      {/* Subtle water */}
      <path
        d="M28 188 C78 176, 130 198, 178 186 S268 168, 332 184"
        fill="none"
        stroke="#c5d5e2"
        strokeWidth="14"
        opacity="0.42"
        strokeLinecap="round"
      />

      {/* Built-up blocks */}
      <rect x="52" y="140" width="30" height="22" rx="3" fill="#ddd6cc" />
      <rect x="92" y="150" width="24" height="18" rx="3" fill="#e0d9cf" />
      <rect x="208" y="156" width="34" height="24" rx="3" fill="#ddd6cc" />
      <rect x="256" y="168" width="26" height="18" rx="3" fill="#e0d9cf" />

      {/* Local roads — support corridor, avoid spaghetti */}
      <g
        fill="none"
        stroke="#c5beb4"
        strokeWidth="1.15"
        strokeLinecap="round"
        data-road-tier="local"
      >
        <path d="M28 78 C55 72, 95 78, 128 70" />
        <path d="M48 118 C78 112, 112 120, 148 114" />
        <path d="M160 72 C168 110, 162 150, 170 188" />
        <path d="M236 96 C242 140, 238 185, 248 228" />
        <path d="M100 236 C140 228, 180 236, 220 230" />
        <path d="M64 292 C110 280, 158 290, 204 282" />
        <path d="M132 348 C176 338, 222 348, 268 340" />
        <path d="M300 120 C296 165, 304 210, 298 255" />
      </g>

      {/* Main roads — route corridor */}
      <g
        fill="none"
        stroke="#aea79d"
        strokeWidth="2.35"
        strokeLinecap="round"
        data-road-tier="main"
      >
        <path d="M40 92 C95 98, 145 108, 190 130 S250 180, 270 230 S290 300, 310 340" />
        <path d="M70 60 C100 90, 115 140, 125 190 S145 270, 175 310 S230 350, 280 360" />
        <path d="M48 240 C110 228, 170 240, 230 232 S300 218, 330 236" />
      </g>

      <g fill="#b5aea4" data-road-nodes="">
        <circle cx="190" cy="130" r="2" />
        <circle cx="125" cy="190" r="2" />
        <circle cx="230" cy="232" r="1.8" />
        <circle cx="175" cy="310" r="1.8" />
      </g>

      {/*
        Blue route: right → down → lower-right.
        Pronounced bends — not a single diagonal.
      */}
      <path
        className={styles.route}
        d="M72 96
           C108 98, 145 102, 175 118
           C205 134, 218 158, 210 188
           C202 218, 185 245, 188 275
           C191 305, 220 318, 250 322
           C270 325, 282 326, 292 328"
        pathLength={ROUTE_LENGTH}
        style={{
          strokeDasharray: ROUTE_LENGTH,
          strokeDashoffset: ROUTE_LENGTH * (1 - routeProgress),
        }}
        data-route-curved="true"
        data-route-stroke="thin-blue"
        data-route-start={`${b.start.x},${b.start.y}`}
        data-route-end={`${b.end.x},${b.end.y}`}
      />

      <g data-route-marker="start">
        <circle
          cx={b.start.x}
          cy={b.start.y}
          r="6.5"
          fill="#fff"
          stroke="#2f6fed"
          strokeWidth="2.4"
        />
        <circle cx={b.start.x} cy={b.start.y} r="2.6" fill="#2f6fed" />
        <g data-route-label="start">
          <rect
            x="78"
            y="66"
            width="128"
            height="20"
            rx="6"
            fill="#fbf9f5"
            stroke="rgba(39,32,25,0.12)"
            strokeWidth="1"
          />
          <text x="86" y="80" className={styles.label}>
            {r.from}
          </text>
        </g>
      </g>

      <g
        data-route-marker="end"
        style={{ opacity: destVisible ? 1 : 0 }}
        transform={`translate(${b.end.x} ${b.end.y})`}
      >
        <path
          d="M0 -14 C7.5 -14 13 -8 13 0 C13 8 0 18 0 18 C0 18 -13 8 -13 0 C-13 -8 -7.5 -14 0 -14 Z"
          fill="#c44536"
        />
        <circle cx="0" cy="-2.5" r="3.2" fill="#fff" />
        <g
          data-route-label="end"
          style={{ opacity: destLabelVisible ? 1 : 0 }}
        >
          <rect
            x="-78"
            y="-38"
            width="72"
            height="18"
            rx="6"
            fill="#fbf9f5"
            stroke="rgba(39,32,25,0.12)"
            strokeWidth="1"
          />
          <text x="-70" y="-26" className={styles.label}>
            {r.to}
          </text>
        </g>
      </g>
    </svg>
  )
}
