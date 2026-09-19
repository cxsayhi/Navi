import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ApiClientError, api } from '../../api/client'
import type {
  DailyRoute,
  NavigationSelection,
  TravelMode,
  TripPlanDetail,
} from '../../api/types'
import { environment } from '../../config/environment'
import { formatCompactDate } from '../../utils/dates'
import { AllDaysPreviewMap } from './AllDaysPreviewMap'
import { useQueries } from '@tanstack/react-query'
import { usePlaceDetails } from './placeDetails'

interface TripPreviewProps {
  plan: TripPlanDetail
  onReturnToEdit: (routeId?: number) => void
}

const modeLabels: Record<TravelMode, string> = {
  WALK: '步行',
  DRIVE: '驾车',
  TRANSIT: '公交',
}

function loadErrorMessage(error: unknown) {
  return error instanceof ApiClientError ? error.message : '已保存导航方案暂时无法读取'
}

function segmentCount(route: DailyRoute) {
  return Math.max(0, route.routePoints.length - 1)
}

export function TripPreview({ plan, onReturnToEdit }: TripPreviewProps) {
  const [selections, setSelections] = useState<NavigationSelection[]>([])
  const [focusedRouteId, setFocusedRouteId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const details = usePlaceDetails(plan.dailyRoutes.flatMap((day) => day.routePoints))
  const displayRoutes = plan.dailyRoutes.map((day) => ({ ...day, routePoints: day.routePoints.map((point) => details.find((detail) => detail.id === point.id)!) }))
  const live = useQueries({ queries: selections.map((selection) => {
    const day = plan.dailyRoutes.find((route) => route.id === selection.dailyRouteId)
    const origin = day?.routePoints.find((point) => point.id === selection.originPointId)
    const destination = day?.routePoints.find((point) => point.id === selection.destinationPointId)
    return { queryKey: ['preview-route', selection.id, selection.savedAt, plan.timezone, day?.routeDate, origin?.departureTime, retryVersion], enabled: !!origin && !!destination,
      queryFn: ({ signal }: { signal: AbortSignal }) => api.computeNavigationRouteOptions({ originPlaceId: origin!.googlePlaceId, destinationPlaceId: destination!.googlePlaceId, dailyRouteId: selection.dailyRouteId, originPointId: selection.originPointId, destinationPointId: selection.destinationPointId, travelMode: selection.travelMode }, signal) }
  }) })
  const liveSelections = selections.map((selection, index) => ({ ...selection, liveRoute: live[index].data?.options[0] }))
  const liveErrors = live.filter((query) => query.error)

  useEffect(() => {
    const controller = new AbortController()
    api.getTripPlanNavigationSelections(plan.id, controller.signal)
      .then((response) => setSelections(response.selections))
      .catch((nextError: unknown) => {
        if (!(nextError instanceof DOMException && nextError.name === 'AbortError')) {
          setSelections([])
          setError(loadErrorMessage(nextError))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [plan.id, retryVersion])

  const focusRoute = useCallback((routeId: number | null) => {
    setFocusedRouteId(routeId)
  }, [])

  const retryLoad = () => {
    setLoading(true)
    setError(null)
    setRetryVersion((value) => value + 1)
  }

  const selectionKeys = useMemo(() => new Set(selections.map((selection) => (
    `${selection.dailyRouteId}:${selection.originPointId}:${selection.destinationPointId}`
  ))), [selections])
  const pointCount = plan.dailyRoutes.reduce((total, route) => total + route.routePoints.length, 0)
  const totalSegments = plan.dailyRoutes.reduce((total, route) => total + segmentCount(route), 0)
  const savedSegmentCount = plan.dailyRoutes.reduce((total, route) => (
    total + route.routePoints.slice(0, -1).filter((origin, index) => (
      selectionKeys.has(`${route.id}:${origin.id}:${route.routePoints[index + 1].id}`)
    )).length
  ), 0)
  const focusedRoute = plan.dailyRoutes.find((route) => route.id === focusedRouteId) ?? null

  if (!environment.googleMapsApiKey) {
    return (
      <div className="maps-config-state">
        <div className="config-compass" aria-hidden="true"><span>N</span><i /></div>
        <div>
          <p>Google Maps configuration</p>
          <h3>多日预览已经就位，等待你的浏览器密钥。</h3>
          <span>在前端环境文件配置 Maps JavaScript API 密钥后，即可查看逐日分色总览。</span>
          <code>VITE_GOOGLE_MAPS_API_KEY=你的密钥</code>
        </div>
      </div>
    )
  }

  if (pointCount === 0) {
    return (
      <div className="preview-empty-state">
        <span aria-hidden="true">00</span>
        <p>Preview contact sheet</p>
        <h3>还没有可以装订进地图的 Pin。</h3>
        <small>返回按日编辑，为任意一天加入地点后即可生成总览。</small>
        <button className="primary-button" type="button" onClick={() => onReturnToEdit()}>
          返回路线编辑 <span aria-hidden="true">↗</span>
        </button>
      </div>
    )
  }

  return (
    <section className="trip-preview" aria-labelledby="preview-title">
      <header className="preview-heading">
        <div>
          <p>All days contact sheet</p>
          <h2 id="preview-title">旅程总览</h2>
          <span>
            {focusedRoute
              ? `正在聚焦 Day ${String(focusedRoute.dayNumber).padStart(2, '0')} · 再次点击可恢复全部路线`
              : '所有每日路线按各自颜色叠加；首个 Pin 标记对应 Day 与日期。'}
          </span>
        </div>
        <div className="preview-stat-strip" aria-label="总览统计">
          <span><strong>{plan.dailyRoutes.length}</strong> days</span>
          <span><strong>{pointCount}</strong> pins</span>
          <span><strong>{savedSegmentCount}/{totalSegments}</strong> routes</span>
        </div>
      </header>

      {error && (
        <div className="preview-warning" role="alert">
          <span>导航折线读取失败，当前以 Pin 间虚线继续展示：{error}</span>
          <button type="button" onClick={retryLoad}>重新读取</button>
        </div>
      )}
      {liveErrors.length > 0 && <div className="preview-warning" role="alert">{liveErrors.length} 个路段实时计算失败：{liveErrors.map((query) => query.error?.message).join('；')}<button onClick={retryLoad}>重试</button></div>}
      {details.some((point) => point.placeError) && <p role="status">部分地点详情正在加载或不可用，地图仅显示取得坐标的地点。</p>}
      {selections.some((selection) => selection.travelMode === 'WALK') && <p className="navigation-warning">步行路线处于 Beta 阶段，可能缺少人行道或步行路径，请留意实际路况。</p>}

      <div className="preview-atlas">
        <div className="preview-map-panel">
          <AllDaysPreviewMap
            routes={displayRoutes}
            selections={liveSelections}
            focusedRouteId={focusedRouteId}
            onRouteFocus={focusRoute}
          />
          {(loading || live.some((query) => query.isFetching)) && <span className="preview-loading-badge">正在实时计算各路段…</span>}
          <div className="preview-map-key" aria-label="地图线型说明">
            <span><i className="preview-key-line preview-key-line--saved" /> 实时导航</span>
            <span><i className="preview-key-line preview-key-line--draft" /> Pin 顺序连线</span>
          </div>
        </div>

        <aside className="preview-ledger" aria-label="每日路线图例">
          <div className="preview-ledger-topline">
            <span>DAY INDEX</span>
            <button
              type="button"
              className={focusedRouteId === null ? 'preview-all-button preview-all-button--active' : 'preview-all-button'}
              onClick={() => setFocusedRouteId(null)}
            >
              查看全部
            </button>
          </div>
          <ol>
            {plan.dailyRoutes.map((route) => {
              const savedForDay = route.routePoints.slice(0, -1).filter((origin, index) => (
                selectionKeys.has(`${route.id}:${origin.id}:${route.routePoints[index + 1].id}`)
              )).length
              const routeSelections = selections.filter((selection) => selection.dailyRouteId === route.id)
              const modes = [...new Set(routeSelections.map((selection) => selection.travelMode))]
              const active = focusedRouteId === route.id
              return (
                <li
                  key={route.id}
                  className={active ? 'preview-day-card preview-day-card--active' : 'preview-day-card'}
                  style={{ '--route-color': route.routeColor } as CSSProperties}
                >
                  <button
                    type="button"
                    onClick={() => setFocusedRouteId(active ? null : route.id)}
                    aria-pressed={active}
                  >
                    <span className="preview-day-number">{String(route.dayNumber).padStart(2, '0')}</span>
                    <span className="preview-day-copy">
                      <small>{formatCompactDate(route.routeDate)}</small>
                      <strong>{route.title}</strong>
                      <em>{route.routePoints.length} pins · {savedForDay}/{segmentCount(route)} 实时路线</em>
                      {modes.length > 0 && (
                        <span className="preview-mode-list">
                          {modes.map((mode) => <i key={mode}>{modeLabels[mode]}</i>)}
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    className="preview-edit-day"
                    type="button"
                    onClick={() => onReturnToEdit(route.id)}
                  >编辑此日 ↗</button>
                </li>
              )
            })}
          </ol>
          <footer>
            <span>WL / {String(plan.id).padStart(4, '0')}</span>
            <span>Google Maps preview</span>
          </footer>
        </aside>
      </div>
    </section>
  )
}
