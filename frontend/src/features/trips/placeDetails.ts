import { useQueries } from '@tanstack/react-query'
import type { DisplayPoint, RoutePoint } from '../../api/types'
import { loadGoogleMapsLibraries } from '../../maps/googleMapsLoader'
import { environment } from '../../config/environment'

export function usePlaceDetails(points: RoutePoint[]): DisplayPoint[] {
  const uniquePoints = [...new Map(points.map((point) => [point.googlePlaceId, point])).values()]
  const results = useQueries({ queries: uniquePoints.map((point) => ({
    queryKey: ['place', point.googlePlaceId],
    enabled: !!environment.googleMapsApiKey,
    queryFn: async () => {
      const { places } = await loadGoogleMapsLibraries()
      const place = new places.Place({ id: point.googlePlaceId })
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] })
      if (!place.location) throw new Error('此地点暂无可用坐标')
      return { name: place.displayName ?? point.googlePlaceId, formattedAddress: place.formattedAddress ?? undefined,
        latitude: place.location.lat(), longitude: place.location.lng() }
    },
  })) })
  return points.map((point) => {
    const result = results[uniquePoints.findIndex((item) => item.googlePlaceId === point.googlePlaceId)]
    return { ...point, ...result.data,
      name: point.customName || result.data?.name || point.googlePlaceId,
      placeError: !environment.googleMapsApiKey ? '尚未配置地图密钥' : result.error ? '地点详情加载失败，请重试' : result.isPending ? '正在加载地点详情…' : undefined,
    }
  })
}

export function hasLocation(point: DisplayPoint): point is DisplayPoint & { latitude: number; longitude: number } {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
}
