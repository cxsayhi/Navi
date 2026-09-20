import { useState, type CSSProperties } from 'react'
import type {
  DailyRoute,
  RoutePointInput,
  TripPlanDetail,
} from '../../api/types'
import {
  formatCompactDate,
  formatDateRange,
  formatLongDate,
} from '../../utils/dates'
import { RoutePlanner } from './RoutePlanner'
import { TripPreview } from './TripPreview'

interface TripWorkspaceProps {
  plan: TripPlanDetail
  busy: boolean
  onEditPlan: () => void
  onDeletePlan: () => void
  onAddDay: () => void
  onGenerateDays: () => void
  onEditDay: (route: DailyRoute) => void
  onDeleteDay: (route: DailyRoute) => void
  onAddPoint: (routeId: number, point: RoutePointInput) => Promise<boolean>
  onDeletePoint: (routeId: number, pointId: number) => Promise<boolean>
  onReorderPoints: (routeId: number, pointIds: number[]) => Promise<boolean>
  onUpdatePoint: (pointId: number, input: Partial<RoutePointInput> & { dailyRouteId?: number }) => Promise<boolean>
}

export function TripWorkspace({
  plan,
  busy,
  onEditPlan,
  onDeletePlan,
  onAddDay,
  onGenerateDays,
  onEditDay,
  onDeleteDay,
  onAddPoint,
  onDeletePoint,
  onReorderPoints,
  onUpdatePoint,
}: TripWorkspaceProps) {
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(
    plan.dailyRoutes[0]?.id ?? null,
  )
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
  const missingDayCount = plan.dayCount - plan.dailyRoutes.length
  const completion = Math.round((plan.dailyRoutes.length / plan.dayCount) * 100)
  const pointCount = plan.dailyRoutes.reduce((total, route) => total + route.routePoints.length, 0)
  const selectedRoute = plan.dailyRoutes.find((route) => route.id === selectedRouteId)
    ?? plan.dailyRoutes[0]

  return (
    <section className="trip-workspace" aria-labelledby="trip-title">
      <header className="trip-cover trip-cover--planner">
        <div className="trip-cover-main">
          <p className="destination-line">
            <span>Destination</span>
            {plan.destination}
          </p>
          <h1 id="trip-title">{plan.title}</h1>
          <p className="trip-date-range">{formatDateRange(plan.startDate, plan.endDate)}</p>
          {plan.notes && <p className="trip-notes">{plan.notes}</p>}
          <div className="trip-cover-actions">
            <button
              className="primary-button primary-button--small"
              type="button"
              onClick={() => setViewMode((mode) => mode === 'edit' ? 'preview' : 'edit')}
            >
              {viewMode === 'edit' ? '预览全部路线' : '返回按日编辑'}
              <span aria-hidden="true">{viewMode === 'edit' ? '↗' : '←'}</span>
            </button>
            <button className="outline-button" type="button" onClick={onEditPlan}>
              编辑计划
            </button>
            <button className="quiet-danger-button" type="button" onClick={onDeletePlan}>
              删除
            </button>
          </div>
        </div>

        <div className="trip-passport" aria-label="计划概览">
          <div className="passport-topline">
            <span>WL / ROUTE BOOK</span>
            <span>NO. {String(plan.id).padStart(4, '0')}</span>
          </div>
          <div className="passport-number">
            <strong>{String(pointCount).padStart(2, '0')}</strong>
            <span>pins</span>
          </div>
          <div className="passport-progress">
            <span style={{ width: `${completion}%` }} />
          </div>
          <p>{plan.dailyRoutes.length} / {plan.dayCount} 天已建立 · {pointCount} 个地点</p>
          <div className="passport-stamp">READY TO GO</div>
        </div>
      </header>

      {viewMode === 'preview' ? (
        <TripPreview
          plan={plan}
          onReturnToEdit={(routeId) => {
            if (routeId !== undefined) setSelectedRouteId(routeId)
            setViewMode('edit')
          }}
        />
      ) : (
        <>
        <div className="route-section-heading route-section-heading--planner">
        <div>
          <p>Daily route navigation</p>
          <h2>按日编辑与导航</h2>
        </div>
        <div className="route-section-actions">
          {missingDayCount > 0 && (
            <button className="outline-button" type="button" disabled={busy} onClick={onGenerateDays}>
              {plan.dailyRoutes.length === 0
                ? `生成全部 ${plan.dayCount} 天`
                : `补齐剩余 ${missingDayCount} 天`}
            </button>
          )}
          <button
            className="primary-button primary-button--small"
            type="button"
            disabled={busy || missingDayCount === 0}
            onClick={onAddDay}
          >
            ＋ 添加一天
          </button>
        </div>
      </div>

        {plan.dailyRoutes.length === 0 ? (
        <div className="route-empty-state">
          <div className="empty-route-sketch" aria-hidden="true">
            <span className="empty-route-dot empty-route-dot--one" />
            <span className="empty-route-line" />
            <span className="empty-route-dot empty-route-dot--two" />
          </div>
          <p>路线册还是空白</p>
          <h3>先为旅程建立每日章节。</h3>
          <span>生成日期后，就能为每一天搜索地点并排列 Pin。</span>
          <div>
            <button className="primary-button" type="button" disabled={busy} onClick={onGenerateDays}>
              生成全部日期 <span aria-hidden="true">↗</span>
            </button>
            <button className="text-button" type="button" disabled={busy} onClick={onAddDay}>
              手动添加一天
            </button>
          </div>
        </div>
        ) : (
        <div className="day-editor-layout">
          <ol className="day-route-strip" aria-label="选择每日路线">
            {plan.dailyRoutes.map((route) => (
              <li
                key={route.id}
                className={route.id === selectedRoute?.id
                  ? 'day-route-tab day-route-tab--selected'
                  : 'day-route-tab'}
                style={{ '--route-color': route.routeColor } as CSSProperties}
              >
                <button
                  className="day-route-select"
                  type="button"
                  onClick={() => setSelectedRouteId(route.id)}
                  aria-pressed={route.id === selectedRoute?.id}
                >
                  <span>DAY {String(route.dayNumber).padStart(2, '0')}</span>
                  <strong>{route.title}</strong>
                  <small>{formatCompactDate(route.routeDate)} · {route.routePoints.length} pins</small>
                </button>
                <div className="day-route-tab-actions">
                  <button type="button" onClick={() => onEditDay(route)} aria-label={`编辑 ${route.title}`}>编辑</button>
                  <button type="button" onClick={() => onDeleteDay(route)} aria-label={`删除 ${route.title}`}>×</button>
                </div>
              </li>
            ))}
          </ol>

          {selectedRoute && (
            <div className="selected-day-meta">
              <span style={{ backgroundColor: selectedRoute.routeColor }} />
              <p>
                <strong>{formatLongDate(selectedRoute.routeDate)}</strong>
                {selectedRoute.notes || '搜索地点并排列 Pin；点击任意两个 Pin 之间的连线即可比较导航方案。'}
              </p>
            </div>
          )}

          {selectedRoute && (
            <RoutePlanner
              key={selectedRoute.id}
              route={selectedRoute}
              days={plan.dailyRoutes}
              timezone={plan.timezone}
              busy={busy}
              onAddPoint={onAddPoint}
              onDeletePoint={onDeletePoint}
              onReorderPoints={onReorderPoints}
              onUpdatePoint={onUpdatePoint}
            />
          )}
        </div>
        )}
        </>
      )}
    </section>
  )
}
