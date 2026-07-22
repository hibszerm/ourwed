import { useEffect, useRef } from 'react'
import maplibregl, { type Map } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { TravelStop } from '@/features/travel/travelUi'
import { stopsWithCoordinates } from '@/features/travel/travelUi'
import styles from './TravelMap.module.css'

interface TravelMapProps {
  stops: TravelStop[]
}

type LngLatPoint = { latitude: number; longitude: number }

const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster' as const,
      source: 'osm',
    },
  ],
}

function routeLineData(points: LngLatPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features:
      points.length >= 2
        ? [
            {
              type: 'Feature' as const,
              properties: {},
              geometry: {
                type: 'LineString' as const,
                coordinates: points.map((p) => [p.longitude, p.latitude]),
              },
            },
          ]
        : [],
  }
}

function coordsKey(points: LngLatPoint[]): string {
  return points.map((p) => `${p.latitude},${p.longitude}`).join('|')
}

/**
 * Interactive MapLibre + OSM map for wedding travel stops.
 * Connects stops with a polyline; driving metrics come from Geoapify separately.
 */
export function TravelMap({ stops }: TravelMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const points = stopsWithCoordinates(stops)
  const key = coordsKey(points)

  useEffect(() => {
    const currentPoints = stopsWithCoordinates(stops)
    if (!containerRef.current || currentPoints.length === 0) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [currentPoints[0].longitude, currentPoints[0].latitude],
      zoom: 10,
      attributionControl: { compact: true },
    })
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    )
    mapRef.current = map

    map.on('load', () => {
      map.addSource('travel-route', {
        type: 'geojson',
        data: routeLineData(currentPoints),
      })
      map.addLayer({
        id: 'travel-route-line',
        type: 'line',
        source: 'travel-route',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#3d4f5c',
          'line-width': 4,
          'line-opacity': 0.9,
        },
      })

      const bounds = new maplibregl.LngLatBounds()
      currentPoints.forEach((p, index) => {
        bounds.extend([p.longitude, p.latitude])
        const el = document.createElement('div')
        el.className = styles.marker
        el.textContent = String(index + 1)
        el.setAttribute('aria-label', `Przystanek ${index + 1}`)
        markersRef.current.push(
          new maplibregl.Marker({ element: el })
            .setLngLat([p.longitude, p.latitude])
            .addTo(map),
        )
      })

      if (currentPoints.length === 1) {
        map.setCenter([
          currentPoints[0].longitude,
          currentPoints[0].latitude,
        ])
        map.setZoom(12)
      } else {
        map.fitBounds(bounds, { padding: 56, maxZoom: 11, duration: 0 })
      }
    })

    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
    // `key` encodes stop coordinates; rebuild only when the route geometry changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stops identity changes every render
  }, [key])

  if (points.length === 0) return null

  return (
    <div className={styles.wrap}>
      <div
        ref={containerRef}
        className={styles.map}
        role="img"
        aria-label="Mapa trasy"
      />
    </div>
  )
}

