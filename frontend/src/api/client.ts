import { environment } from '../config/environment'
import type {
  ApiResponse,
  DailyRouteInput,
  DeleteTripPlanResponse,
  SystemInfo,
  TripPlanDetail,
  TripPlanInput,
  TripPlanSummary,
  RoutePointInput,
  NavigationRoute,
  NavigationRouteInput,
  NavigationRouteOptions,
  TripPlanNavigationSelections,
} from './types'

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${environment.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  let payload: ApiResponse<T>
  const responseText = await response.text()
  try {
    payload = JSON.parse(responseText) as ApiResponse<T>
  } catch {
    throw new ApiClientError(`服务返回了无法识别的响应（HTTP ${response.status}）`, response.status)
  }

  if (!response.ok || !payload.success || payload.data === null) {
    throw new ApiClientError(
      payload.error?.message || '服务暂时不可用',
      response.status,
      payload.error?.code,
    )
  }

  return payload.data
}

export const api = {
  updateStop: (id: number, input: Partial<RoutePointInput> & { dailyRouteId?: number }) =>
    request<TripPlanDetail>(`/stops/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  getSystemInfo: (signal?: AbortSignal) =>
    request<SystemInfo>('/system/info', { signal }),
  listTripPlans: (signal?: AbortSignal) =>
    request<TripPlanSummary[]>('/trip-plans', { signal }),
  getTripPlan: (planId: number, signal?: AbortSignal) =>
    request<TripPlanDetail>(`/trip-plans/${planId}`, { signal }),
  createTripPlan: (input: TripPlanInput) =>
    request<TripPlanDetail>('/trip-plans', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateTripPlan: (planId: number, input: TripPlanInput) =>
    request<TripPlanDetail>(`/trip-plans/${planId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  deleteTripPlan: (planId: number) =>
    request<DeleteTripPlanResponse>(`/trip-plans/${planId}`, {
      method: 'DELETE',
    }),
  createDailyRoute: (planId: number, input: DailyRouteInput) =>
    request<TripPlanDetail>(`/trip-plans/${planId}/daily-routes`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  generateDailyRoutes: (planId: number) =>
    request<TripPlanDetail>(`/trip-plans/${planId}/daily-routes/generate`, {
      method: 'POST',
    }),
  updateDailyRoute: (
    planId: number,
    dailyRouteId: number,
    input: DailyRouteInput,
  ) =>
    request<TripPlanDetail>(
      `/trip-plans/${planId}/daily-routes/${dailyRouteId}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      },
    ),
  deleteDailyRoute: (planId: number, dailyRouteId: number) =>
    request<TripPlanDetail>(
      `/trip-plans/${planId}/daily-routes/${dailyRouteId}`,
      { method: 'DELETE' },
    ),
  addRoutePoint: (
    planId: number,
    dailyRouteId: number,
    input: RoutePointInput,
  ) =>
    request<TripPlanDetail>(
      `/trip-plans/${planId}/daily-routes/${dailyRouteId}/route-points`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  reorderRoutePoints: (
    planId: number,
    dailyRouteId: number,
    routePointIds: number[],
  ) =>
    request<TripPlanDetail>(
      `/trip-plans/${planId}/daily-routes/${dailyRouteId}/route-points/reorder`,
      {
        method: 'PUT',
        body: JSON.stringify({ routePointIds }),
      },
    ),
  deleteRoutePoint: (
    planId: number,
    dailyRouteId: number,
    routePointId: number,
  ) =>
    request<TripPlanDetail>(
      `/trip-plans/${planId}/daily-routes/${dailyRouteId}/route-points/${routePointId}`,
      { method: 'DELETE' },
    ),
  computeNavigationRoute: (input: NavigationRouteInput, signal?: AbortSignal) =>
    request<NavigationRoute>('/navigation/routes', {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }),
  computeNavigationRouteOptions: (input: NavigationRouteInput, signal?: AbortSignal) =>
    request<NavigationRouteOptions>('/routes/compute', {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }),
  getTripPlanNavigationSelections: (tripPlanId: number, signal?: AbortSignal) =>
    request<TripPlanNavigationSelections>(
      `/navigation/selections/trip-plan/${tripPlanId}`,
      { signal },
    ),
}
