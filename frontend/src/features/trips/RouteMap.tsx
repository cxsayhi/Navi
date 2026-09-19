import { useEffect, useRef, useState } from 'react'
import type {
  NavigationRoute,
  DisplayPoint,
  TemporaryPlace,
  TravelMode,
} from '../../api/types'
import { hasLocation } from './placeDetails'
import { environment } from '../../config/environment'
import {
  loadGoogleMapsLibraries,
  type GoogleMapsLibraries,
} from '../../maps/googleMapsLoader'

interface RouteMapProps {
  routePoints: DisplayPoint[]
  routeColor: string
  previewPoint: TemporaryPlace | null
  selectedSegmentIndex: number | null
  navigationRoute: NavigationRoute | null
  navigationMode: TravelMode
  onRouteSegmentClick: (segmentIndex: number) => void
}

type MapMarker = google.maps.marker.AdvancedMarkerElement

function navigationColor(mode: TravelMode) {
  return {
    WALK: '#E95F43',
    DRIVE: '#2773B8',
    TRANSIT: '#6A4BBC',
  }[mode]
}

function createPinContent(index: number, color: string, preview = false) {
  const pin = document.createElement('div')
  pin.className = preview ? 'map-pin map-pin--preview' : 'map-pin'
  pin.style.setProperty('--pin-color', color)
  const label = document.createElement('span')
  label.textContent = preview ? '+' : String(index + 1)
  pin.append(label)
  return pin
}

function removeMarker(marker: MapMarker) {
  marker.map = null
}

function createMapMarker(
  libraries: GoogleMapsLibraries,
  map: google.maps.Map,
  position: google.maps.LatLngLiteral,
  title: string,
  index: number,
  color: string,
  preview = false,
): MapMarker {
  return new libraries.marker.AdvancedMarkerElement({
      map,
      position,
      title,
      content: createPinContent(index, color, preview),
      zIndex: preview ? 100 : 20 + index,
  })
}

export function RouteMap({
  routePoints,
  routeColor,
  previewPoint,
  selectedSegmentIndex,
  navigationRoute,
  navigationMode,
  onRouteSegmentClick,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<MapMarker[]>([])
  const segmentPolylinesRef = useRef<google.maps.Polyline[]>([])
  const navigationPolylinesRef = useRef<google.maps.Polyline[]>([])
  const [libraries, setLibraries] = useState<GoogleMapsLibraries | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadGoogleMapsLibraries()
      .then((nextLibraries) => {
        if (active) setLibraries(nextLibraries)
      })
      .catch(() => {
        if (active) setLoadError('Google Maps 加载失败，请检查密钥、API 权限和网络连接')
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!libraries || !containerRef.current || mapRef.current) return
    const mapOptions: google.maps.MapOptions = {
      center: { lat: 34.2, lng: 108.9 },
      zoom: 4,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: 'greedy',
    }
    mapOptions.mapId = environment.googleMapsMapId
    mapRef.current = new libraries.maps.Map(containerRef.current, mapOptions)
  }, [libraries])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !libraries) return

    markersRef.current.forEach(removeMarker)
    markersRef.current = []

    segmentPolylinesRef.current.forEach((polyline) => {
      google.maps.event.clearInstanceListeners(polyline)
      polyline.setMap(null)
    })
    segmentPolylinesRef.current = []
    navigationPolylinesRef.current.forEach((polyline) => polyline.setMap(null))
    navigationPolylinesRef.current = []

    const bounds = new google.maps.LatLngBounds()
    routePoints.forEach((point, index) => {
      if (!hasLocation(point)) return
      const position = { lat: point.latitude, lng: point.longitude }
      bounds.extend(position)
      markersRef.current.push(createMapMarker(
        libraries,
        map,
        position,
        `${index + 1}. ${point.name}`,
        index,
        routeColor,
      ))
    })

    routePoints.slice(0, -1).forEach((point, index) => {
      const selected = selectedSegmentIndex === index
      const nextPoint = routePoints[index + 1]
      if (!hasLocation(point) || !hasLocation(nextPoint)) return
      const path = [
        { lat: point.latitude, lng: point.longitude },
        { lat: nextPoint.latitude, lng: nextPoint.longitude },
      ]
      const polyline = new libraries.maps.Polyline({
        map,
        path,
        strokeColor: routeColor,
        strokeOpacity: selected ? 1 : 0.78,
        strokeWeight: selected ? 7 : 5,
        clickable: true,
        zIndex: selected ? 14 : 12,
      })
      const hitArea = new libraries.maps.Polyline({
        map,
        path,
        strokeColor: routeColor,
        strokeOpacity: 0.01,
        strokeWeight: 24,
        clickable: true,
        zIndex: selected ? 13 : 11,
      })
      const highlight = () => polyline.setOptions({ strokeOpacity: 1, strokeWeight: 7 })
      const restore = () => polyline.setOptions({
        strokeOpacity: selected ? 1 : 0.78,
        strokeWeight: selected ? 7 : 5,
      })
      polyline.addListener('click', () => onRouteSegmentClick(index))
      hitArea.addListener('click', () => onRouteSegmentClick(index))
      polyline.addListener('mouseover', highlight)
      hitArea.addListener('mouseover', highlight)
      polyline.addListener('mouseout', restore)
      hitArea.addListener('mouseout', restore)
      segmentPolylinesRef.current.push(polyline, hitArea)
    })

    let navigationPath: google.maps.LatLng[] = []
    if (navigationRoute?.encodedPolyline) {
      try {
        navigationPath = libraries.geometry.encoding.decodePath(navigationRoute.encodedPolyline)
      } catch {
        navigationPath = []
      }
    }

    if (navigationPath.length > 1) {
      const outline = new libraries.maps.Polyline({
        map,
        path: navigationPath,
        strokeColor: '#FFF8EE',
        strokeOpacity: 0.92,
        strokeWeight: 10,
        clickable: false,
        zIndex: 15,
      })
      const routeLine = new libraries.maps.Polyline({
        map,
        path: navigationPath,
        strokeColor: navigationColor(navigationMode),
        strokeOpacity: 1,
        strokeWeight: 6,
        clickable: false,
        zIndex: 16,
      })
      navigationPolylinesRef.current = [outline, routeLine]
    }

    if (previewPoint) {
      const position = { lat: previewPoint.latitude, lng: previewPoint.longitude }
      bounds.extend(position)
      markersRef.current.push(createMapMarker(
        libraries,
        map,
        position,
        `待添加：${previewPoint.name}`,
        routePoints.length,
        '#24231f',
        true,
      ))
    }

    if (navigationPath.length > 1) {
      const navigationBounds = new google.maps.LatLngBounds()
      navigationPath.forEach((position) => navigationBounds.extend(position))
      map.fitBounds(navigationBounds, 74)
    } else if (!bounds.isEmpty()) {
      if (routePoints.length + (previewPoint ? 1 : 0) === 1) {
        map.setCenter(bounds.getCenter())
        map.setZoom(15)
      } else {
        map.fitBounds(bounds, 70)
      }
    }
  }, [
    libraries,
    navigationMode,
    navigationRoute,
    onRouteSegmentClick,
    previewPoint,
    routeColor,
    routePoints,
    selectedSegmentIndex,
  ])

  useEffect(() => () => {
    markersRef.current.forEach(removeMarker)
    segmentPolylinesRef.current.forEach((polyline) => polyline.setMap(null))
    navigationPolylinesRef.current.forEach((polyline) => polyline.setMap(null))
  }, [])

  if (loadError) {
    return (
      <div className="map-load-error" role="alert">
        <span aria-hidden="true">!</span>
        <strong>地图没有成功载入</strong>
        <p>{loadError}</p>
      </div>
    )
  }

  return (
    <div className="route-map-wrap">
      {!libraries && <div className="map-loading">正在展开地图…</div>}
      <div ref={containerRef} className="route-map" aria-label="Google 地图路线编辑区" />
      {libraries && routePoints.length === 0 && !previewPoint && (
        <div className="map-context-state map-context-state--empty" role="status">
          <span aria-hidden="true">00</span>
          <div>
            <strong>当天还没有地点</strong>
            <p>从右侧搜索地点并加入路线，第一个 Pin 会成为当天起点。</p>
          </div>
        </div>
      )}
      {libraries && routePoints.length === 1 && !previewPoint && (
        <div className="map-context-state map-context-state--single" role="status">
          <span aria-hidden="true">01</span>
          <div>
            <strong>只有一个 Pin</strong>
            <p>再加入一个地点后，地图会显示可点击的路线段。</p>
          </div>
        </div>
      )}
      <div className="map-coordinate-label">GOOGLE MAPS · ROUTE MODE</div>
    </div>
  )
}
