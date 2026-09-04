import { useLayoutEffect, useRef } from 'react'
import { motion, useTransform, type MotionValue } from 'framer-motion'
import styles from './MobileNavigationDemo.module.css'
import { mobileOurWedDemo } from '@/features/landing-v2/mobile-story/app/data/mobileOurWedDemoData'
import {
  travelPathProgressAt,
  travelProgressAt,
} from '@/features/landing-v2/mobile-story/app/motion/mobileAppStoryProgress'

type Props = {
  appProgress: MotionValue<number>
  opacity: MotionValue<number>
}

/**
 * Active navigation route toward Ceremony (church).
 * Same `d` for measure, muted remaining, and dark travelled stroke.
 * Framed high enough that START stays inside the map viewport at rest.
 */
const ROUTE_D =
  'M 130 340 C 150 310, 170 285, 190 260 S 230 220, 250 195 S 275 165, 285 145 S 295 125, 270 130'

const ROUTE_START = { x: 130, y: 340 }
const ROUTE_END = { x: 270, y: 130 }

/**
 * Navigation screen — Ceremony destination + street-map composition.
 * Travelled dark route endpoint === GPS marker (one travelProgress source).
 */
export function MobileNavigationDemo({ appProgress, opacity }: Props) {
  const pathRef = useRef<SVGPathElement | null>(null)
  const travelledRef = useRef<SVGPathElement | null>(null)
  const markerGroupRef = useRef<SVGGElement | null>(null)
  const lengthRef = useRef(0)
  const etaLabelRef = useRef<HTMLParagraphElement | null>(null)
  const distLabelRef = useRef<HTMLParagraphElement | null>(null)
  const nav = mobileOurWedDemo.navigation
  const dayNow = mobileOurWedDemo.weddingDay.now

  // Rest framing: both endpoints inside viewport; mild follow during travel.
  const mapScale = useTransform(appProgress, (p) => {
    const t = travelProgressAt(p)
    return 1 + t * 0.05
  })
  const mapX = useTransform(appProgress, (p) => {
    const t = travelProgressAt(p)
    return t * -8
  })
  const mapY = useTransform(appProgress, (p) => {
    const t = travelProgressAt(p)
    return t * -6
  })

  useLayoutEffect(() => {
    const path = pathRef.current
    const travelled = travelledRef.current
    const markerGroup = markerGroupRef.current
    if (!path || !travelled || !markerGroup) return
    const length = path.getTotalLength()
    lengthRef.current = length
    path.dataset.routeLength = String(Math.round(length))
    travelled.setAttribute('stroke-dasharray', `${length}`)

    const apply = (app: number) => {
      const total = lengthRef.current
      if (total <= 0) return
      // Single path fraction for marker + dark travelled stroke (identical).
      const pathT = travelPathProgressAt(app)
      const travelledLen = pathT * total
      travelled.setAttribute('stroke-dashoffset', `${total - travelledLen}`)
      const pt = path.getPointAtLength(travelledLen)
      markerGroup.setAttribute('transform', `translate(${pt.x} ${pt.y})`)
      markerGroup.dataset.navX = String(pt.x)
      markerGroup.dataset.navY = String(pt.y)
      // Soften GPS over START at rest to avoid ugly double-circles.
      const gpsOp = pathT < 0.02 ? 0.45 + (pathT / 0.02) * 0.55 : 1
      markerGroup.style.opacity = String(gpsOp)
      if (etaLabelRef.current) {
        const arrived = pathT >= 0.92
        etaLabelRef.current.textContent = arrived ? nav.arrivedLabel : nav.eta
        etaLabelRef.current.classList.toggle(styles.etaArrived, arrived)
      }
      if (distLabelRef.current) {
        distLabelRef.current.textContent = pathT >= 0.92 ? '' : nav.distance
      }
    }

    apply(appProgress.get())
    return appProgress.on('change', apply)
  }, [appProgress, nav.arrivedLabel, nav.eta, nav.distance])

  return (
    <motion.div
      className={styles.root}
      style={{ opacity }}
      data-mobile-app-screen="navigation"
      data-mobile-nav-destination={nav.destination.label}
    >
      <header className={styles.header} data-mobile-nav-header="">
        <div className={styles.headerTop}>
          <p className={styles.back}>{nav.backLabel}</p>
          <p className={styles.eyebrow}>{nav.title}</p>
        </div>
        <p className={styles.celLabel}>CEL</p>
        <p className={styles.dest}>{nav.destination.label}</p>
        <p className={styles.cityLine}>
          <span>{nav.destination.city}</span>
          <span aria-hidden>·</span>
          <span data-mobile-nav-eta="">{nav.eta}</span>
          <span aria-hidden>·</span>
          <span data-mobile-nav-distance="">{nav.distance}</span>
        </p>
      </header>

      <div className={styles.mapWrap} data-mobile-nav-map="">
        <motion.div
          className={styles.mapCanvas}
          style={{ scale: mapScale, x: mapX, y: mapY }}
          data-mobile-nav-camera=""
        >
          <svg
            className={styles.svg}
            viewBox="0 0 360 520"
            preserveAspectRatio="xMidYMid slice"
            data-mobile-route-map=""
          >
            <rect width="360" height="520" fill="#f3f1ed" />

            {/* Soft land-use */}
            <path
              d="M12 70 C58 40, 110 55, 132 98 C148 132, 118 168, 78 162 C38 156, 4 110, 12 70 Z"
              fill="#dde5d6"
              opacity="0.72"
            />
            <path
              d="M240 300 C286 278, 340 298, 348 348 C356 392, 310 430, 268 416 C226 402, 210 336, 240 300 Z"
              fill="#d9e2cf"
              opacity="0.65"
            />
            <path
              d="M40 360 C78 348, 118 368, 128 402 C136 428, 98 452, 66 440 C40 430, 28 382, 40 360 Z"
              fill="#d4dde8"
              opacity="0.45"
            />

            {/* Building blocks — quiet polygons */}
            <g fill="#ebe7e0" stroke="#e0dbd3" strokeWidth="0.6" opacity="0.9">
              <path d="M72 200 L108 188 L128 222 L94 236 Z" />
              <path d="M150 250 L186 236 L204 274 L168 286 Z" />
              <path d="M210 140 L246 128 L262 168 L226 178 Z" />
              <path d="M88 320 L124 308 L138 346 L102 356 Z" />
            </g>

            {/* Minor / local roads — irregular curves */}
            <g
              className={styles.minorRoads}
              fill="none"
              stroke="#d6d0c6"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              data-mobile-map-roads-minor=""
            >
              <path d="M18 120 C55 108, 90 130, 128 118 S 190 95, 230 108" />
              <path d="M30 180 C70 168, 105 195, 145 182 S 210 160, 255 175" />
              <path d="M22 250 C60 238, 98 268, 140 252 S 215 230, 260 248" />
              <path d="M35 320 C72 305, 110 335, 150 318 S 220 295, 270 315" />
              <path d="M48 400 C85 385, 125 415, 165 398 S 235 375, 285 395" />
              <path d="M55 90 C70 150, 58 210, 78 270 S 95 350, 85 420" />
              <path d="M130 50 C142 120, 118 185, 138 250 S 155 340, 142 430" />
              <path d="M195 40 C205 110, 185 180, 202 250 S 215 345, 200 450" />
              <path d="M265 55 C278 130, 255 200, 272 275 S 285 360, 268 460" />
              <path d="M320 80 C332 150, 310 220, 328 300 S 340 390, 318 480" />
              <path d="M95 155 C120 148, 145 175, 172 160" />
              <path d="M175 290 C205 278, 235 305, 265 290" />
              <path d="M110 360 C140 348, 175 375, 210 358" />
              <path d="M80 440 C115 428, 155 455, 195 438" />
              <path d="M200 100 C230 92, 255 118, 285 105" />
              <path d="M40 280 C55 255, 48 230, 65 208" />
              <path d="M290 200 C305 230, 295 265, 312 295" />
              <path d="M160 470 C190 455, 225 485, 255 468" />
            </g>

            {/* Secondary arterials */}
            <g
              className={styles.secondaryRoads}
              fill="none"
              stroke="#c2bbb0"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              data-mobile-map-roads-secondary=""
            >
              <path d="M10 210 C80 185, 160 225, 240 200 S 330 175, 355 195" />
              <path d="M25 365 C95 340, 170 385, 245 355 S 325 330, 350 350" />
              <path d="M100 20 C115 110, 90 200, 115 300 S 130 420, 118 510" />
              <path d="M220 15 C238 105, 210 205, 235 310 S 250 430, 238 505" />
              <path d="M50 145 C100 135, 150 165, 200 145 S 290 120, 340 140" />
              <path d="M70 430 C130 410, 190 445, 250 420 S 320 400, 355 415" />
            </g>

            {/* Primary roads — stronger corridors the route rides */}
            <g
              className={styles.primaryRoads}
              fill="none"
              stroke="#a89f93"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              data-mobile-map-roads-primary=""
            >
              <path d="M45 500 C70 450, 100 400, 130 350 S 190 270, 230 220 S 285 140, 315 80" />
              <path d="M5 290 C70 265, 140 305, 210 275 S 300 245, 358 265" />
              <path d="M160 10 C175 95, 155 185, 175 280 S 190 400, 175 515" />
            </g>

            {/* Subtle labels */}
            <g
              className={styles.mapLabels}
              fill="#9a9288"
              fontSize="9"
              fontFamily="system-ui, sans-serif"
              letterSpacing="0.04em"
            >
              <text x="28" y="58" data-mobile-map-label="">
                Kraków
              </text>
              <text x="195" y="72" opacity="0.85" data-mobile-map-label="">
                Stare Miasto
              </text>
              <text x="250" y="250" opacity="0.8" data-mobile-map-label="">
                Wawel
              </text>
            </g>

            {/* Route casing */}
            <path
              d={ROUTE_D}
              fill="none"
              stroke="#fffcf8"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.92"
              data-mobile-route-underlay=""
            />

            {/* Full muted remaining route (always visible) — also measure source */}
            <path
              ref={pathRef}
              d={ROUTE_D}
              fill="none"
              stroke="rgba(26,22,20,0.28)"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              data-mobile-route-path=""
              data-mobile-route-remaining=""
            />

            {/* Dark travelled route — dashoffset synced to marker (same pathT) */}
            <path
              ref={travelledRef}
              d={ROUTE_D}
              fill="none"
              stroke="#1a1614"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              data-mobile-route-travelled=""
              data-mobile-route-reveal=""
            />

            {/* Static START — preceding schedule origin (Hotel Saski → Ceremonia leg). */}
            <g data-mobile-route-start="" data-mobile-route-origin="">
              <circle
                cx={ROUTE_START.x}
                cy={ROUTE_START.y}
                r="7.5"
                fill="rgba(26,22,20,0.08)"
              />
              <circle
                cx={ROUTE_START.x}
                cy={ROUTE_START.y}
                r="5.2"
                fill="#fffcf8"
                stroke="#1a1614"
                strokeWidth="1.5"
              />
              <circle cx={ROUTE_START.x} cy={ROUTE_START.y} r="2.2" fill="#1a1614" />
              <text
                x={ROUTE_START.x + 10}
                y={ROUTE_START.y + 3}
                fill="#6b6560"
                fontSize="7.5"
                fontFamily="system-ui, sans-serif"
                fontWeight="600"
                letterSpacing="0.04em"
              >
                Start
              </text>
            </g>

            {/* Destination — Ceremonia (church). Static map coordinate. */}
            <g data-mobile-route-dest="">
              <circle
                cx={ROUTE_END.x}
                cy={ROUTE_END.y}
                r="9"
                fill="rgba(255,252,248,0.85)"
                stroke="#1a1614"
                strokeWidth="1.5"
              />
              <circle cx={ROUTE_END.x} cy={ROUTE_END.y} r="3.4" fill="#1a1614" />
              <text
                x={ROUTE_END.x - 28}
                y={ROUTE_END.y - 14}
                fill="#3d3834"
                fontSize="8"
                fontFamily="system-ui, sans-serif"
                fontWeight="650"
              >
                Ceremonia
              </text>
            </g>

            {/* GPS current location — center == travelled endpoint (DOM-owned) */}
            <g ref={markerGroupRef} data-mobile-route-marker="">
              <circle r="14" fill="rgba(26,22,20,0.1)" data-mobile-route-halo="" />
              <circle r="7.5" fill="#fffcf8" stroke="#1a1614" strokeWidth="1.5" />
              <circle r="4.2" fill="#2a353f" data-mobile-route-dot="" />
            </g>
          </svg>
        </motion.div>

        <footer className={styles.footer} data-mobile-nav-tripbar="">
          <div className={styles.footerMain}>
            <p className={styles.fromLabel}>{dayNow.role}</p>
            <p className={styles.fromVal}>{nav.destination.label}</p>
            <p className={styles.fromCity}>{nav.destination.city}</p>
          </div>
          <div className={styles.etaBlock}>
            <p ref={etaLabelRef} className={styles.eta} data-mobile-route-eta="">
              {nav.eta}
            </p>
            <p ref={distLabelRef} className={styles.dist} data-mobile-route-dist="">
              {nav.distance}
            </p>
          </div>
        </footer>
      </div>
    </motion.div>
  )
}
