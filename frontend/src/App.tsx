import { useCallback, useEffect, useState } from 'react'
import { ApiClientError, api } from './api/client'
import type {
  DailyRoute,
  DailyRouteInput,
  RoutePointInput,
  SystemInfo,
  TripPlanDetail,
  TripPlanInput,
  TripPlanSummary,
} from './api/types'
import { Modal } from './components/Modal'
import { SiteInformation, type SiteInformationKind } from './components/SiteInformation'
import { ConfirmDelete } from './features/trips/ConfirmDelete'
import { DailyRouteForm } from './features/trips/DailyRouteForm'
import { EmptyWorkspace } from './features/trips/EmptyWorkspace'
import { PlanSidebar } from './features/trips/PlanSidebar'
import { TripPlanForm } from './features/trips/TripPlanForm'
import { TripWorkspace } from './features/trips/TripWorkspace'

type ConnectionState =
  | { status: 'checking'; info: null }
  | { status: 'ready'; info: SystemInfo }
  | { status: 'offline'; info: null }

type DeleteTarget =
  | { kind: 'plan'; name: string }
  | { kind: 'day'; route: DailyRoute }
  | null

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function errorMessage(error: unknown) {
  return error instanceof ApiClientError ? error.message : '操作没有完成，请稍后重试'
}

function App() {
  const [connection, setConnection] = useState<ConnectionState>({ status: 'checking', info: null })
  const [plans, setPlans] = useState<TripPlanSummary[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<TripPlanDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [planFormMode, setPlanFormMode] = useState<'create' | 'edit' | null>(null)
  const [routeForm, setRouteForm] = useState<DailyRoute | null | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const [siteInformation, setSiteInformation] = useState<SiteInformationKind | null>(null)

  const refreshSummaries = useCallback(async () => {
    const nextPlans = await api.listTripPlans()
    setPlans(nextPlans)
    return nextPlans
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const bootstrap = async () => {
      setLoading(true)
      const systemPromise = api
        .getSystemInfo(controller.signal)
        .then((info) => setConnection({ status: 'ready' as const, info }))
        .catch((error: unknown) => {
          if (!isAbortError(error)) setConnection({ status: 'offline', info: null })
        })

      try {
        const nextPlans = await api.listTripPlans(controller.signal)
        if (controller.signal.aborted) return
        setPlans(nextPlans)
        if (nextPlans.length > 0) {
          const firstPlan = await api.getTripPlan(nextPlans[0].id, controller.signal)
          if (controller.signal.aborted) return
          setSelectedPlanId(firstPlan.id)
          setSelectedPlan(firstPlan)
        }
      } catch (error) {
        if (!isAbortError(error)) setGlobalError(errorMessage(error))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }

      await systemPromise
    }

    void bootstrap()
    return () => controller.abort()
  }, [])

  const selectPlan = async (planId: number) => {
    if (planId === selectedPlanId) return
    setSelectedPlanId(planId)
    setLoading(true)
    setGlobalError(null)
    try {
      setSelectedPlan(await api.getTripPlan(planId))
    } catch (error) {
      setGlobalError(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const commitPlan = async (input: TripPlanInput) => {
    setBusy(true)
    setFormError(null)
    try {
      const plan = planFormMode === 'edit' && selectedPlan
        ? await api.updateTripPlan(selectedPlan.id, input)
        : await api.createTripPlan(input)
      setSelectedPlan(plan)
      setSelectedPlanId(plan.id)
      setPlanFormMode(null)
      await refreshSummaries()
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const commitDailyRoute = async (input: DailyRouteInput) => {
    if (!selectedPlan) return
    setBusy(true)
    setFormError(null)
    try {
      const plan = routeForm
        ? await api.updateDailyRoute(selectedPlan.id, routeForm.id, input)
        : await api.createDailyRoute(selectedPlan.id, input)
      setSelectedPlan(plan)
      setRouteForm(undefined)
      await refreshSummaries()
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const generateDays = async () => {
    if (!selectedPlan) return
    setBusy(true)
    setGlobalError(null)
    try {
      setSelectedPlan(await api.generateDailyRoutes(selectedPlan.id))
      await refreshSummaries()
    } catch (error) {
      setGlobalError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const addRoutePoint = async (dailyRouteId: number, input: RoutePointInput) => {
    if (!selectedPlan) return false
    setBusy(true)
    setGlobalError(null)
    try {
      setSelectedPlan(await api.addRoutePoint(selectedPlan.id, dailyRouteId, input))
      await refreshSummaries()
      return true
    } catch (error) {
      setGlobalError(errorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  const deleteRoutePoint = async (dailyRouteId: number, routePointId: number) => {
    if (!selectedPlan) return false
    setBusy(true)
    setGlobalError(null)
    try {
      setSelectedPlan(await api.deleteRoutePoint(selectedPlan.id, dailyRouteId, routePointId))
      await refreshSummaries()
      return true
    } catch (error) {
      setGlobalError(errorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  const updateRoutePoint = async (pointId: number, input: Partial<RoutePointInput> & { dailyRouteId?: number }) => {
    setBusy(true)
    setGlobalError(null)
    try {
      setSelectedPlan(await api.updateStop(pointId, input))
      await refreshSummaries()
      return true
    } catch (error) {
      setGlobalError(errorMessage(error))
      return false
    } finally { setBusy(false) }
  }

  const reorderRoutePoints = async (dailyRouteId: number, routePointIds: number[]) => {
    if (!selectedPlan) return false
    setBusy(true)
    setGlobalError(null)
    try {
      setSelectedPlan(await api.reorderRoutePoints(selectedPlan.id, dailyRouteId, routePointIds))
      await refreshSummaries()
      return true
    } catch (error) {
      setGlobalError(errorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!selectedPlan || !deleteTarget) return
    setBusy(true)
    setGlobalError(null)
    try {
      if (deleteTarget.kind === 'plan') {
        await api.deleteTripPlan(selectedPlan.id)
        const nextPlans = await refreshSummaries()
        if (nextPlans.length > 0) {
          const nextPlan = await api.getTripPlan(nextPlans[0].id)
          setSelectedPlanId(nextPlan.id)
          setSelectedPlan(nextPlan)
        } else {
          setSelectedPlanId(null)
          setSelectedPlan(null)
        }
      } else {
        setSelectedPlan(await api.deleteDailyRoute(selectedPlan.id, deleteTarget.route.id))
        await refreshSummaries()
      }
      setDeleteTarget(null)
    } catch (error) {
      setDeleteTarget(null)
      setGlobalError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const openPlanForm = (mode: 'create' | 'edit') => {
    setFormError(null)
    setPlanFormMode(mode)
  }

  const openRouteForm = (route: DailyRoute | null) => {
    setFormError(null)
    setRouteForm(route)
  }

  const connectionLabel = {
    checking: '正在连接',
    ready: '服务已连接',
    offline: '服务离线',
  }[connection.status]

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Wanderline 行迹首页">
          <span className="brand-mark" aria-hidden="true">W</span>
          <span>
            <strong>Wanderline</strong>
            <small>行迹</small>
          </span>
        </a>
        <div className="header-edition" aria-label="Wanderline 旅行规划">
          <span>PLAN · MAP · GO</span>
          <strong>TRAVEL PLANNER</strong>
        </div>
        <div className={`connection-pill connection-pill--${connection.status}`}>
          <span aria-hidden="true" />
          {connectionLabel}
        </div>
      </header>

      {globalError && (
        <div className="global-error" role="alert">
          <span>{globalError}</span>
          <button type="button" onClick={() => setGlobalError(null)} aria-label="关闭错误提示">×</button>
        </div>
      )}

      <main className="planner-layout" id="top">
        <PlanSidebar
          plans={plans}
          selectedPlanId={selectedPlanId}
          loading={loading}
          onCreate={() => openPlanForm('create')}
          onSelect={(planId) => void selectPlan(planId)}
        />

        <div className="workspace-panel">
          {loading && !selectedPlan ? (
            <div className="workspace-loading" aria-label="正在读取旅程">
              <span />
              <span />
              <span />
            </div>
          ) : selectedPlan ? (
            <TripWorkspace
              key={selectedPlan.id}
              plan={selectedPlan}
              busy={busy}
              onEditPlan={() => openPlanForm('edit')}
              onDeletePlan={() => setDeleteTarget({ kind: 'plan', name: selectedPlan.title })}
              onAddDay={() => openRouteForm(null)}
              onGenerateDays={() => void generateDays()}
              onEditDay={(route) => openRouteForm(route)}
              onDeleteDay={(route) => setDeleteTarget({ kind: 'day', route })}
              onAddPoint={addRoutePoint}
              onDeletePoint={deleteRoutePoint}
              onReorderPoints={reorderRoutePoints}
              onUpdatePoint={updateRoutePoint}
            />
          ) : (
            <EmptyWorkspace onCreate={() => openPlanForm('create')} />
          )}
        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-identity">
          <strong>Wanderline / 行迹</strong>
          <span>Wanderline {connection.info?.version ?? '1.0.0'} · 把想去的地方连成旅程</span>
        </div>
        <nav className="footer-navigation" aria-label="站点信息">
          <button type="button" onClick={() => setSiteInformation('help')}>使用帮助</button>
          <button type="button" onClick={() => setSiteInformation('privacy')}>隐私政策</button>
          <button type="button" onClick={() => setSiteInformation('terms')}>服务条款</button>
          <a href="mailto:ChanceT66@outlook.com">意见反馈</a>
        </nav>
      </footer>

      {siteInformation && (
        <SiteInformation kind={siteInformation} onClose={() => setSiteInformation(null)} />
      )}

      {planFormMode && (
        <Modal
          eyebrow={planFormMode === 'edit' ? 'Edit travel plan' : 'Create travel plan'}
          title={planFormMode === 'edit' ? '编辑旅游计划' : '从目的地开始'}
          onClose={() => !busy && setPlanFormMode(null)}
        >
          <TripPlanForm
            key={planFormMode === 'edit' ? selectedPlan?.id : 'create'}
            initialPlan={planFormMode === 'edit' ? selectedPlan ?? undefined : undefined}
            submitting={busy}
            serverError={formError}
            onCancel={() => setPlanFormMode(null)}
            onSubmit={commitPlan}
          />
        </Modal>
      )}

      {routeForm !== undefined && selectedPlan && (
        <Modal
          eyebrow={routeForm ? `Day ${String(routeForm.dayNumber).padStart(2, '0')}` : 'Add daily route'}
          title={routeForm ? '编辑每日路线' : '添加一天'}
          onClose={() => !busy && setRouteForm(undefined)}
        >
          <DailyRouteForm
            key={routeForm?.id ?? 'create'}
            route={routeForm ?? undefined}
            startDate={selectedPlan.startDate}
            endDate={selectedPlan.endDate}
            usedDates={selectedPlan.dailyRoutes
              .filter((route) => route.id !== routeForm?.id)
              .map((route) => route.routeDate)}
            submitting={busy}
            serverError={formError}
            onCancel={() => setRouteForm(undefined)}
            onSubmit={commitDailyRoute}
          />
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDelete
          kind={deleteTarget.kind}
          name={deleteTarget.kind === 'plan' ? deleteTarget.name : deleteTarget.route.title}
          submitting={busy}
          onCancel={() => !busy && setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

export default App
