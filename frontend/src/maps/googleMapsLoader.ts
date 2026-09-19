import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import { environment } from '../config/environment'

export interface GoogleMapsLibraries {
  maps: google.maps.MapsLibrary
  marker: google.maps.MarkerLibrary
  places: google.maps.PlacesLibrary
  geometry: google.maps.GeometryLibrary
}

let librariesPromise: Promise<GoogleMapsLibraries> | null = null

export function loadGoogleMapsLibraries(): Promise<GoogleMapsLibraries> {
  if (!environment.googleMapsApiKey) {
    return Promise.reject(new Error('尚未配置 Google Maps 浏览器 API 密钥'))
  }
  if (!environment.googleMapsMapId) {
    return Promise.reject(new Error('生产环境需配置 VITE_GOOGLE_MAPS_MAP_ID 以使用 Advanced Marker'))
  }

  if (!librariesPromise) {
    setOptions({
      key: environment.googleMapsApiKey,
      v: 'weekly',
      language: 'zh-CN',
    })
    librariesPromise = Promise.all([
      importLibrary('maps'),
      importLibrary('marker'),
      importLibrary('places'),
      importLibrary('geometry'),
    ]).then(([maps, marker, places, geometry]) => ({ maps, marker, places, geometry })).catch((error: unknown) => {
      librariesPromise = null
      throw error
    })
  }

  return librariesPromise
}
