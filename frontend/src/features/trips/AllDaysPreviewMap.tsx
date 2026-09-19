import { useEffect, useRef, useState } from 'react'
import type {
  DailyRoute,
  NavigationSelection,
  NavigationRoute,
  DisplayPoint,
} from '../../api/types'
import { hasLocation } from './placeDetails'
import { environment } from '../../config/environment'
import {
  loadGoogleMapsLibraries,
  type GoogleMapsLibraries,
} from '../../maps/googleMapsLoader'
import { formatCompactDate } from '../../utils/dates'

interface AllDaysPreviewMapProps {
  routes: (Omit<DailyRoute, 'routePoints'> & { routePoints: DisplayPoint[] })[]
  selections: (NavigationSelection & { liveRoute?: NavigationRoute })[]
  focusedRouteId: number | null
  onRouteFocus: (routeId: number | null) => void
}

type MapMarker = google.maps.marker.AdvancedMarkerElement

function selectionKey(dailyRouteId: number, originPointId: number, destinationPointId: number) {
  return `${dailyRouteId}:${originPointId}:${destinationPointId}`
}

function createPinContent(index: number, color: string, subdued: boolean) {
  const pin = document.createElement('div')
  pin.className = 'map-pin map-pin--overview'
  pin.style.setProperty('--pin-color', color)
  if (subdued) pin.classList.add('map-pin--subdued')
  const label = document.createElement('span')
  label.textContent = String(index + 1)
  pin.append(label)
  return pin
}

function createMapMarker(
  libraries: GoogleMapsLibraries,
  map: google.maps.Map,
  point: DisplayPoint & { latitude: number; longitude: number },
  index: number,
  route: DailyRoute,
  subdued: boolean,
): MapMarker {
  const position = { lat: point.latitude, lng: point.longitude }
  const title = `Day ${String(route.dayNumber).padStart(2, '0')} · ${index + 1}. ${point.name}`
  return new libraries.marker.AdvancedMarkerElement({
      map,
      position,
      title,
      content: createPinContent(index, route.routeColor, subdued),
      zIndex: subdued ? 10 + index : 70 + index,
  })
}

function removeMarker(marker: MapMarker) {
  google.maps.event.clearInstanceListeners(marker)
  marker.map = null
}

function createDayLabel(
  map: google.maps.Map,
  point: DisplayPoint & { latitude: number; longitude: number },
  route: DailyRoute,
  subdued: boolean,
  onClick: () => void,
) {
  class DayLabelOverlay extends google.maps.OverlayView {
    private readonly position = new google.maps.LatLng(point.latitude, point.longitude)
    private readonly element = document.createElement('button')

    constructor() {
      super()
      this.element.type = 'button'
      this.element.className = subdued
        ? 'preview-day-label preview-day-label--subdued'
        : 'preview-day-label'
      this.element.style.setProperty('--route-color', route.routeColor)
      this.element.setAttribute('aria-label', `聚焦 Day ${route.dayNumber}，${route.title}`)
      this.element.innerHTML = `<strong>DAY ${String(route.dayNumber).padStart(2, '0')}</strong><span>${formatCompactDate(route.routeDate)}</span>`
      this.element.addEventListener('click', onClick)
    }

    onAdd() {
      this.getPanes()?.floatPane.appendChild(this.element)
    }

    draw() {
      const pixel = this.getProjection().fromLatLngToDivPixel(this.position)
      if (!pixel) return
      this.element.style.left = `${Math.round(pixel.x + 18)}px`
      this.element.style.top = `${Math.round(pixel.y - 54)}px`
    }

    onRemove() {
      this.element.removeEventListener('click', onClick)
      this.element.remove()
    }
  }

  const overlay = new DayLabelOverlay()
  overlay.setMap(map)
  return overlay
}

export function AllDaysPreviewMap({
  routes,
  selections,
  focusedRouteId,
  onRouteFocus,
}: AllDaysPreviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<MapMarker[]>([])
  const polylinesRef = useRef<google.maps.Polyline[]>([])
  const labelsRef = useRef<google.maps.OverlayView[]>([])
  const [libraries, setLibraries] = useState<GoogleMapsLibraries | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadGoogleMapsLibraries()
      .then((nextLibraries) => {
        if (active) setLibraries(nextLibraries)
      })
      .catch(() => {
        if (active) setLoadError('Google Maps 加载失败，请检查浏览器密钥、API 权限和网络连接')
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!libraries || !containerRef.current || mapRef.current) return
    const options: google.maps.MapOptions = {
      center: { lat: 34.2, lng: 108.9 },
      zoom: 4,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: 'greedy',
    }
    options.mapId = environment.googleMapsMapId
    mapRef.current = new libraries.maps.Map(containerRef.current, options)
  }, [libraries])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !libraries) return

    markersRef.current.forEach(removeMarker)
    markersRef.current = []
    polylinesRef.current.forEach((line) => line.setMap(null))
    polylinesRef.current = []
    labelsRef.current.forEach((label) => label.setMap(null))
    labelsRef.current = []

    const selectionMap = new Map(
      selections.map((selection) => [
        selectionKey(
          selection.dailyRouteId,
          selection.originPointId,
          selection.destinationPointId,
        ),
        selection,
      ]),
    )
    const allBounds = new google.maps.LatLngBounds()
    const focusedBounds = new google.maps.LatLngBounds()
    let totalPointCount = 0
    let focusedPointCount = 0

    routes.forEach((route) => {
      const subdued = focusedRouteId !== null && focusedRouteId !== route.id
      const routeOpacity = subdued ? 0.18 : 0.92

      route.routePoints.forEach((point, index) => {
        if (!hasLocation(point)) return
        const position = { lat: point.latitude, lng: point.longitude }
        allBounds.extend(position)
        totalPointCount += 1
        if (focusedRouteId === route.id) {
          focusedBounds.extend(position)
          focusedPointCount += 1
        }
        const marker = createMapMarker(libraries, map, point, index, route, subdued)
        marker.addListener('click', () => onRouteFocus(focusedRouteId === route.id ? null : route.id))
        markersRef.current.push(marker)

        if (index === 0) {
          labelsRef.current.push(createDayLabel(
            map,
            point,
            route,
            subdued,
            () => onRouteFocus(focusedRouteId === route.id ? null : route.id),
          ))
        }
      })

      route.routePoints.slice(0, -1).forEach((origin, index) => {
        const destination = route.routePoints[index + 1]
        if (!hasLocation(origin) || !hasLocation(destination)) return
        const selection = selectionMap.get(selectionKey(route.id, origin.id, destination.id))
        let path: google.maps.LatLng[] | google.maps.LatLngLiteral[] = [
          { lat: origin.latitude, lng: origin.longitude },
          { lat: destination.latitude, lng: destination.longitude },
        ]
        let saved = false
        if (selection?.liveRoute?.encodedPolyline) {
          try {
            const decoded = libraries.geometry.encoding.decodePath(
              selection.liveRoute.encodedPolyline,
            )
            if (decoded.length > 1) {
              path = decoded
              saved = true
            }
          } catch {
            saved = false
          }
        }

        if (saved) {
          const outline = new libraries.maps.Polyline({
            map,
            path,
            strokeColor: '#FFF8EE',
            strokeOpacity: subdued ? 0.12 : 0.76,
            strokeWeight: subdued ? 6 : 9,
            clickable: false,
            zIndex: subdued ? 4 : 20,
          })
          polylinesRef.current.push(outline)
        }

        const line = new libraries.maps.Polyline({
          map,
          path,
          strokeColor: route.routeColor,
          strokeOpacity: saved ? routeOpacity : (subdued ? 0.12 : 0.38),
          strokeWeight: saved ? (subdued ? 3 : 5) : 3,
          clickable: true,
          zIndex: subdued ? 5 : 21,
          icons: saved ? undefined : [{
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: route.routeColor,
              fillOpacity: subdued ? 0.25 : 0.86,
              scale: 1.6,
              strokeOpacity: 0,
            },
            offset: '0',
            repeat: '12px',
          }],
        })
        line.addListener('click', () => onRouteFocus(focusedRouteId === route.id ? null : route.id))
        polylinesRef.current.push(line)
      })
    })

    const activeBounds = focusedRouteId !== null && !focusedBounds.isEmpty()
      ? focusedBounds
      : allBounds
    const activePointCount = focusedRouteId !== null && focusedPointCount > 0
      ? focusedPointCount
      : totalPointCount
    if (!activeBounds.isEmpty()) {
      if (activePointCount === 1) {
        map.setCenter(activeBounds.getCenter())
        map.setZoom(15)
      } else {
        map.fitBounds(activeBounds, 86)
      }
    }
  }, [focusedRouteId, libraries, onRouteFocus, routes, selections])

  useEffect(() => () => {
    markersRef.current.forEach(removeMarker)
    polylinesRef.current.forEach((line) => line.setMap(null))
    labelsRef.current.forEach((label) => label.setMap(null))
  }, [])

  if (loadError) {
    return (
      <div className="map-load-error" role="alert">
        <span aria-hidden="true">!</span>
        <strong>总览地图没有成功载入</strong>
        <p>{loadError}</p>
      </div>
    )
  }

  return (
    <div className="route-map-wrap all-days-map-wrap">
      {!libraries && <div className="map-loading">正在装订多日地图…</div>}
      <div ref={containerRef} className="route-map" aria-label="Google 地图旅游计划多日总览" />
      <div className="map-coordinate-label">GOOGLE MAPS · ALL DAYS PREVIEW</div>
    </div>
  )
}
