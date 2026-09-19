import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DndContext, KeyboardSensor, MeasuringStrategy, PointerSensor, closestCenter, useSensor, useSensors, type KeyboardCoordinateGetter } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api, ApiClientError } from '../../api/client'
import type { DailyRoute, DisplayPoint, RoutePointInput, TravelMode } from '../../api/types'
import { environment } from '../../config/environment'
import { loadGoogleMapsLibraries } from '../../maps/googleMapsLoader'
import { RouteMap } from './RouteMap'
import { RouteNavigationPanel, type NavigationIssue } from './RouteNavigationPanel'
import { usePlaceDetails } from './placeDetails'
import { useEditorStore } from './editorStore'
import { TimePicker } from './TimePicker'
import navigationIcon from '../../assets/navi.svg'

interface Props {
  route: DailyRoute
  days: DailyRoute[]
  timezone: string
  busy: boolean
  onAddPoint: (routeId: number, point: RoutePointInput) => Promise<boolean>
  onDeletePoint: (routeId: number, pointId: number) => Promise<boolean>
  onReorderPoints: (routeId: number, pointIds: number[]) => Promise<boolean>
  onUpdatePoint: (pointId: number, input: Partial<RoutePointInput> & { dailyRouteId?: number }) => Promise<boolean>
}

const verticalKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const direction = event.code === 'ArrowDown' ? 1 : event.code === 'ArrowUp' ? -1 : 0
  const sortable = context.active?.data.current?.sortable as { index: number; items: Array<string | number> } | undefined
  const currentIndex = (context.over?.data.current?.sortable as { index: number } | undefined)?.index ?? sortable?.index
  const targetId = currentIndex === undefined ? undefined : sortable?.items[currentIndex + direction]
  const target = direction && targetId !== undefined ? context.droppableRects.get(targetId) : undefined
  if (!target) return
  event.preventDefault()
  return { x: target.left, y: target.top }
}

function routeIssue(error: Error | null): NavigationIssue | null {
  if (!error) return null
  const code = error instanceof ApiClientError ? error.code : ''
  return { kind: code === 'MAP_ROUTE_NOT_FOUND' || code === 'NOT_FOUND' ? 'NO_ROUTE' : code === 'MAP_TIMEOUT' ? 'TIMEOUT' : code === 'MAP_RATE_LIMITED' ? 'QUOTA' : 'SERVICE', message: error.message }
}

function SortableStop({ point, index, disabled, editing, onEdit, children }: { point: DisplayPoint; index: number; disabled: boolean; editing: boolean; onEdit: () => void; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: point.id, disabled })
  return <li ref={setNodeRef} data-stop-id={point.id} className={`route-point${editing ? ' route-point--editing' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
    <button ref={setActivatorNodeRef} type="button" className="point-drag-handle" aria-label={`拖动 ${point.name}`} {...attributes} {...listeners}>⠿</button>
    <span className="point-order">{index + 1}</span><button type="button" className="point-copy point-edit-trigger" aria-label={`编辑地点 ${point.name}`} aria-expanded={editing} onClick={onEdit}><strong>{point.name}</strong><span>{point.placeError || point.formattedAddress}</span></button>{children}
  </li>
}

function StopEditor({ point, route, days, busy, onUpdate, onClose }: { point: DisplayPoint; route: DailyRoute; days: DailyRoute[]; busy: boolean; onUpdate: Props['onUpdatePoint']; onClose: () => void }) {
  const [name, setName] = useState(point.customName ?? '')
  const [note, setNote] = useState(point.note ?? '')
  const [arrival, setArrival] = useState(point.arrivalTime ?? '')
  const [departure, setDeparture] = useState(point.departureTime ?? '')
  const [day, setDay] = useState(route.id)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (await onUpdate(point.id, { customName: name || null, note: note || null, arrivalTime: arrival || null, departureTime: departure || null, dailyRouteId: day })) onClose()
  }
  return <form className="editor-form stop-editor" onSubmit={submit} aria-label="编辑地点">
    <label className="field"><span>自定义名称</span><input maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></label>
    <label className="field"><span>地点备注</span><textarea maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
    <TimePicker label="预计到达" value={arrival} onChange={setArrival} />
    <TimePicker label="预计离开" value={departure} onChange={setDeparture} />
    <label className="field"><span>移至日期</span><select value={day} onChange={(e) => setDay(Number(e.target.value))}>{days.map((d) => <option key={d.id} value={d.id}>Day {d.dayNumber} · {d.routeDate}</option>)}</select></label>
    <footer className="form-actions"><button type="button" className="text-button" onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={busy}>保存地点<span aria-hidden="true">↗</span></button></footer>
  </form>
}

export function RoutePlanner({ route, days, timezone, busy, onAddPoint, onDeletePoint, onReorderPoints, onUpdatePoint }: Props) {
  const points = usePlaceDetails(route.routePoints)
  const { temporaryPlace, setPlace, segment, setSegment, mode, setMode, reset } = useEditorStore()
  const [departure, setDeparture] = useState<string | undefined>()
  const [optionId, setOptionId] = useState<string | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const client = useQueryClient()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: verticalKeyboardCoordinates }))
  useEffect(() => { reset(); return reset }, [route.id, reset])
  useEffect(() => {
    if (!environment.googleMapsApiKey) return
    let active = true
    let widget: google.maps.places.PlaceAutocompleteElement | undefined
    loadGoogleMapsLibraries().then(({ places }) => {
      if (!active || !host.current) return
      widget = new places.PlaceAutocompleteElement({})
      widget.setAttribute('aria-label', '搜索 Google Maps 地点')
      widget.addEventListener('gmp-select', async (event) => {
        setSearching(true); setSearchError(null); setPlace(null)
        try {
          const place = (event as Event & { placePrediction: google.maps.places.PlacePrediction }).placePrediction.toPlace()
          await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location'] })
          if (!place.location) throw new Error('此地点没有可用坐标')
          if (active) setPlace({ googlePlaceId: place.id, name: place.displayName ?? place.id, formattedAddress: place.formattedAddress ?? '', latitude: place.location.lat(), longitude: place.location.lng() })
        } catch (error) { if (active) setSearchError(error instanceof Error ? error.message : '无法读取地点详情') }
        finally { if (active) setSearching(false) }
      })
      widget.addEventListener('gmp-error', () => setSearchError('地点搜索失败，请检查 Places API (New)、网站密钥限制和结算配置'))
      host.current.replaceChildren(widget)
    }).catch((error: Error) => { if (active) setSearchError(error.message) })
    return () => { active = false; widget?.remove() }
  }, [setPlace])
  const origin = segment === null ? undefined : points[segment]
  const destination = segment === null ? undefined : points[segment + 1]
  const activeMode = mode
  const departureValue = departure ?? ''
  const options = useQuery({ queryKey: ['routes', route.id, route.routeDate, timezone, origin?.id, destination?.id, activeMode, departureValue, origin?.departureTime], enabled: !!origin && !!destination,
    queryFn: ({ signal }) => api.computeNavigationRouteOptions({ originPlaceId: origin!.googlePlaceId, destinationPlaceId: destination!.googlePlaceId, dailyRouteId: route.id, originPointId: origin!.id, destinationPointId: destination!.id, travelMode: activeMode, plannedDepartureTime: departureValue || origin!.departureTime || '09:00' }, signal) })
  const activeRoute = options.data?.options.find((item) => item.optionId === optionId) ?? options.data?.options[0] ?? null
  const routeLineClick = useCallback((index: number) => { setSegment(index); setDeparture(undefined); setOptionId(null) }, [setSegment])
  const reorder = async (ids: number[]) => { if (await onReorderPoints(route.id, ids)) { setSegment(null); await client.invalidateQueries({ queryKey: ['selection'] }) } }
  const selectedStop = points.find((point) => point.id === editing)
  return <div className="route-planner">
    <div className="route-planner-map">
      {environment.googleMapsApiKey ? <RouteMap routePoints={points} routeColor={route.routeColor} previewPoint={temporaryPlace} selectedSegmentIndex={segment} navigationRoute={activeRoute} navigationMode={activeMode} onRouteSegmentClick={routeLineClick} /> : <div className="maps-config-state">配置 VITE_GOOGLE_MAPS_API_KEY 后加载 Google 地图与地点搜索。</div>}
    </div>
    <aside className="route-drafting-panel" aria-label={`${route.title} 地点编辑器`}>
      <header className="drafting-header"><div><p>Day {route.dayNumber} · {timezone}</p><h3>{route.title}</h3></div></header>
      <div className="place-search"><label>搜索 Google Maps 地点</label><div ref={host} />{searching && <p role="status">正在读取地点…</p>}{searchError && <p role="alert">{searchError}</p>}
        {temporaryPlace && <div className="place-preview-card"><div><strong>{temporaryPlace.name}</strong><p>{temporaryPlace.formattedAddress}</p></div><button className="primary-button" disabled={busy} onClick={async () => { if (await onAddPoint(route.id, { googlePlaceId: temporaryPlace.googlePlaceId })) setPlace(null) }}>加入路线</button></div>}
      </div>
      {points.some((p) => p.placeError) && <button className="text-button" onClick={() => void client.refetchQueries({ queryKey: ['place'] })}>重试地点详情</button>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} onDragEnd={({ active, over }) => { if (over && active.id !== over.id) void reorder(arrayMove(points, points.findIndex((p) => p.id === active.id), points.findIndex((p) => p.id === over.id)).map((p) => p.id)) }}>
        <SortableContext items={points.map((p) => p.id)} strategy={verticalListSortingStrategy}><ol className="route-point-list">
          {points.map((point, index) => <Fragment key={point.id}><SortableStop point={point} index={index} disabled={busy} editing={editing === point.id} onEdit={() => { setEditing(point.id); setSegment(null) }}>
            <div className="point-actions"><button disabled={busy || index === 0} aria-label={`上移 ${point.name}`} onClick={() => void reorder(arrayMove(points, index, index - 1).map((p) => p.id))}>↑</button><button disabled={busy || index === points.length - 1} aria-label={`下移 ${point.name}`} onClick={() => void reorder(arrayMove(points, index, index + 1).map((p) => p.id))}>↓</button><button disabled={busy} aria-label={`删除 ${point.name}`} onClick={async () => { if (await onDeletePoint(route.id, point.id)) setSegment(null) }}>×</button></div>
          </SortableStop>{index < points.length - 1 && <li className="route-segment-row"><button type="button" className="route-segment-nav-button" onClick={() => routeLineClick(index)} aria-label={`规划 ${point.name} 到 ${points[index + 1].name} 的导航`}><img src={navigationIcon} alt="" aria-hidden="true" /></button></li>}</Fragment>)}
        </ol></SortableContext>
      </DndContext>
      {!points.length && <p className="p-4">搜索并加入第一个地点。</p>}
      {selectedStop && <StopEditor key={selectedStop.id} point={selectedStop} route={route} days={days} busy={busy} onUpdate={onUpdatePoint} onClose={() => { setEditing(null); setSegment(null) }} />}
      {origin && destination && <><div className="p-4"><TimePicker label={`路段出发时间 · ${timezone}`} value={departureValue} onChange={setDeparture} hint="留空使用起点离开时间，再默认当天 09:00。" /></div>
        <RouteNavigationPanel origin={origin} destination={destination} segmentIndex={segment!} mode={activeMode} options={options.data?.options ?? []} route={activeRoute} selectedOptionId={activeRoute?.optionId ?? null} loading={options.isFetching} error={routeIssue(options.error)} onModeChange={(next: TravelMode) => { setMode(next); setOptionId(null) }} onOptionChange={setOptionId} onRetry={() => void options.refetch()} onClose={() => setSegment(null)} />
      </>}
    </aside>
  </div>
}
