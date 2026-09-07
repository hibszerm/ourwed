import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { motionValue } from 'framer-motion'
import { HeroModernDashboard } from '@/features/landing-v2/hero/HeroModernDashboard'
import { applyHeroDemoThemeToElement } from '@/features/landing-v2/hero/heroDemoThemeInterpolation'
import { ProductStoryWorkspace } from '@/features/landing-v2/product-story/ProductStoryWorkspace'
import { MobileOurWedApp } from '@/features/landing-v2/mobile-story/app/MobileOurWedApp'
import styles from './LandingDeviceCapturePage.module.css'

/**
 * DEV/capture-only boards for Landing V2 flattened device assets.
 * Marketing demo data only — never real client CRM rows.
 *
 * Query:
 *   ?board=hero-light | hero-dark | product-overview | product-logistics |
 *          product-finance | product-questionnaire | phone&p=0.2
 */
export function LandingDeviceCapturePage() {
  const params = useMemo(
    () => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''),
    [],
  )
  const board = params.get('board') ?? 'hero-light'
  const phoneP = Math.min(1, Math.max(0, Number(params.get('p') ?? '0') || 0))
  const heroTheme = board === 'hero-dark' ? 1 : 0
  const productTab =
    board === 'product-logistics'
      ? 'logistics'
      : board === 'product-finance'
        ? 'finance'
        : board === 'product-questionnaire'
          ? 'questionnaire'
          : 'overview'
  const heroRootRef = useRef<HTMLDivElement | null>(null)
  const phoneProgress = useMemo(() => motionValue(phoneP), [phoneP])

  useEffect(() => {
    document.documentElement.dataset.landingCapture = board
    document.body.style.margin = '0'
    document.body.style.background = '#f3efe8'
  }, [board])

  useEffect(() => {
    phoneProgress.set(phoneP)
  }, [phoneP, phoneProgress])

  useEffect(() => {
    if (board !== 'hero-light' && board !== 'hero-dark') return
    const node = heroRootRef.current?.querySelector(
      '[data-testid="lv2-hero-modern-dashboard"]',
    ) as HTMLElement | null
    if (node) applyHeroDemoThemeToElement(node, heroTheme)
  }, [board, heroTheme])

  return (
    <div className={styles.page} data-landing-device-capture={board}>
      {(board === 'hero-light' || board === 'hero-dark') && (
        <div
          ref={heroRootRef}
          className={styles.tabletBoard}
          data-capture-target="hero-tablet"
        >
          <HeroModernDashboard revealComplete themeStatic={heroTheme} />
        </div>
      )}

      {(board === 'product-overview' ||
        board === 'product-logistics' ||
        board === 'product-finance' ||
        board === 'product-questionnaire') && (
        <div className={styles.tabletBoard} data-capture-target="product-tablet">
          <ProductStoryWorkspace
            activeTab={productTab}
            style={
              {
                ['--ps-tab-progress' as string]:
                  productTab === 'overview'
                    ? 0
                    : productTab === 'logistics'
                      ? 1
                      : productTab === 'finance'
                        ? 2
                        : 3,
              } as CSSProperties
            }
          />
        </div>
      )}

      {board === 'phone' && (
        <div className={styles.phoneBoard} data-capture-target="phone-app">
          <div className={styles.phoneViewport}>
            <MobileOurWedApp appProgress={phoneProgress} />
          </div>
        </div>
      )}
    </div>
  )
}
