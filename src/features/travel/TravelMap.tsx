/**
 * Interactive Google Maps overview for wedding travel stops.
 * Markers from provider-independent coordinates; optional Routes API polyline.
 * Does not call Places or Routes from the browser.
 */

import { useEffect, useRef, useState } from 'react'
import type { TravelStop } from '@/features/travel/travelUi'
import { stopsWithCoordinates } from '@/features/travel/travelUi'
import { decodeEncodedPolyline } from '@/services/decodeEncodedPolyline'
import {
  getGoogleMapsBrowserConfig,
  GoogleMapsBrowserError,
  loadGoogleMapsLibrary,
  loadGoogleMarkerLibrary,
} from '@/services/googleMapsBrowserLoader'
import styles from './TravelMap.module.css'

export interface TravelMapProps {
  stops: TravelStop[]
  /** Optional Google Routes encoded polyline (not recalculated in the browser). */
  encodedPolyline?: string | null
}

type LngLatPoint = { latitude: number; longitude: number; title?: string }

type MapStatus = 'loading' | 'ready' | 'empty' | 'missing_key' | 'error'

const POLAND_CENTER = { lat: 52.1, lng: 19.4 }
const DEFAULT_ZOOM = 6
const SINGLE_ZOOM = 12

function coordsKey(points: LngLatPoint[], polyline: string): string {
  return `${points.map((p) => `${p.latitude},${p.longitude}`).join('|')}::${polyline}`
}

function clearOverlays(
  markers: google.maps.Marker[],
  advanced: google.maps.marker.AdvancedMarkerElement[],
  polyline: google.maps.Polyline | null,
): void {
  markers.forEach((m) => m.setMap(null))
  advanced.forEach((m) => {
    m.map = null
  })
  polyline?.setMap(null)
}

/**
 * Google Maps JavaScript API travel overview.
 */
export function TravelMap({ stops, encodedPolyline = null }: TravelMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])
  const advancedMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>(
    [],
  )
  const polylineRef = useRef<google.maps.Polyline | null>(null)
  const lastFitKeyRef = useRef<string>('')

  const points = stopsWithCoordinates(stops).map((s) => ({
    latitude: s.latitude,
    longitude: s.longitude,
    title: s.title || s.address,
  }))
  const poly = (encodedPolyline ?? '').trim()
  const dataKey = coordsKey(points, poly)

  const [status, setStatus] = useState<MapStatus>(() =>
    points.length === 0 ? 'empty' : 'loading',
  )

  useEffect(() => {
    if (points.length === 0) {
      setStatus('empty')
      return
    }

    let cancelled = false
    const container = containerRef.current
    if (!container) return

    setStatus('loading')

    void (async () => {
      try {
        const config = getGoogleMapsBrowserConfig()
        await loadGoogleMapsLibrary()
        if (cancelled || !containerRef.current) return

        const mapOptions: google.maps.MapOptions = {
          center: POLAND_CENTER,
          zoom: DEFAULT_ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          gestureHandling: 'cooperative',
          clickableIcons: false,
          keyboardShortcuts: false,
        }
        if (config.mapId) {
          mapOptions.mapId = config.mapId
        }

        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(containerRef.current, mapOptions)
        }

        const map = mapRef.current
        clearOverlays(
          markersRef.current,
          advancedMarkersRef.current,
          polylineRef.current,
        )
        markersRef.current = []
        advancedMarkersRef.current = []
        polylineRef.current = null

        const bounds = new google.maps.LatLngBounds()
        let usedAdvanced = false

        if (config.mapId) {
          try {
            const markerLib = await loadGoogleMarkerLibrary()
            if (cancelled) return
            usedAdvanced = true
            points.forEach((p, index) => {
              const position = { lat: p.latitude, lng: p.longitude }
              bounds.extend(position)
              const content = document.createElement('div')
              content.className = styles.marker
              content.textContent = String(index + 1)
              content.setAttribute(
                'aria-label',
                p.title
                  ? `${index + 1}. ${p.title}`
                  : `Przystanek ${index + 1}`,
              )
              const marker = new markerLib.AdvancedMarkerElement({
                map,
                position,
                title: p.title,
                content,
              })
              advancedMarkersRef.current.push(marker)
            })
          } catch {
            usedAdvanced = false
          }
        }

        if (!usedAdvanced) {
          points.forEach((p, index) => {
            const position = { lat: p.latitude, lng: p.longitude }
            bounds.extend(position)
            const marker = new google.maps.Marker({
              map,
              position,
              title: p.title,
              label: {
                text: String(index + 1),
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '12px',
              },
            })
            markersRef.current.push(marker)
          })
        }

        if (poly) {
          const path = decodeEncodedPolyline(poly).map((c) => ({
            lat: c.lat,
            lng: c.lng,
          }))
          if (path.length >= 2) {
            path.forEach((c) => bounds.extend(c))
            polylineRef.current = new google.maps.Polyline({
              map,
              path,
              geodesic: true,
              strokeColor: '#3d4f5c',
              strokeOpacity: 0.9,
              strokeWeight: 4,
            })
          }
        }

        if (lastFitKeyRef.current !== dataKey) {
          lastFitKeyRef.current = dataKey
          if (points.length === 1 && !poly) {
            map.setCenter({
              lat: points[0].latitude,
              lng: points[0].longitude,
            })
            map.setZoom(SINGLE_ZOOM)
          } else if (!bounds.isEmpty()) {
            map.fitBounds(bounds, 56)
          }
        }

        if (!cancelled) setStatus('ready')
      } catch (err) {
        if (cancelled) return
        clearOverlays(
          markersRef.current,
          advancedMarkersRef.current,
          polylineRef.current,
        )
        markersRef.current = []
        advancedMarkersRef.current = []
        polylineRef.current = null
        mapRef.current = null
        lastFitKeyRef.current = ''
        if (
          err instanceof GoogleMapsBrowserError &&
          err.code === 'missing_key'
        ) {
          setStatus('missing_key')
        } else {
          setStatus('error')
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // dataKey encodes coordinates + polyline; avoid rebuild on stop identity churn
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [dataKey])

  useEffect(() => {
    return () => {
      clearOverlays(
        markersRef.current,
        advancedMarkersRef.current,
        polylineRef.current,
      )
      markersRef.current = []
      advancedMarkersRef.current = []
      polylineRef.current = null
      mapRef.current = null
      lastFitKeyRef.current = ''
    }
  }, [])

  if (status === 'empty' || points.length === 0) {
    return (
      <div className={styles.wrap} data-testid="travel-map-empty">
        <p className={styles.stateMessage}>
          Brak współrzędnych do wyświetlenia mapy.
        </p>
      </div>
    )
  }

  if (status === 'missing_key') {
    return (
      <div className={styles.wrap} data-testid="travel-map-missing-key">
        <p className={styles.stateMessage}>
          Mapa Google nie została skonfigurowana.
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className={styles.wrap} data-testid="travel-map-error">
        <p className={styles.stateMessage}>
          Nie udało się wczytać mapy. Spróbuj ponownie.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.wrap} data-testid="travel-map">
      {status === 'loading' ? (
        <div className={styles.skeleton} aria-hidden data-testid="travel-map-loading" />
      ) : null}
      <div
        ref={containerRef}
        className={styles.map}
        role="img"
        aria-label="Mapa trasy"
        data-google-maps="true"
      />
    </div>
  )
}
