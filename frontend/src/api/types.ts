export interface ApiError {
  code: string
  message: string
  details: Record<string, string>
}

export interface ApiResponse<T> {
  success: boolean
  data: T | null
  error: ApiError | null
  timestamp: string
  requestId: string
}

export interface SystemInfo {
  service: string
  status: 'READY'
  mapProvider: 'GOOGLE_MAPS'
  version: string
}

export interface TripPlanSummary {
  id: number
  title: string
  destination: string
  startDate: string
  endDate: string
  dayCount: number
  plannedDayCount: number
  createdAt: string
  updatedAt: string
}

export interface DailyRoute {
  id: number
  dayNumber: number
  routeDate: string
  title: string
  notes: string | null
  routeColor: string
  routePoints: RoutePoint[]
  createdAt: string
  updatedAt: string
}

export interface RoutePoint {
  id: number
  googlePlaceId: string
  customName: string | null
  note: string | null
  arrivalTime: string | null
  departureTime: string | null
  position: number
  createdAt: string
  updatedAt: string
}

// Google details exist only in the mounted UI, never in persistence requests.
export interface DisplayPoint extends RoutePoint {
  name: string
  formattedAddress?: string
  latitude?: number
  longitude?: number
  placeError?: string
}
export interface TemporaryPlace {
  googlePlaceId: string
  name: string
  formattedAddress: string
  latitude: number
  longitude: number
}

export interface TripPlanDetail {
  timezone: string
  id: number
  title: string
  destination: string
  startDate: string
  endDate: string
  notes: string | null
  dayCount: number
  dailyRoutes: DailyRoute[]
  createdAt: string
  updatedAt: string
}

export interface TripPlanInput {
  timezone: string
  title: string
  destination: string
  startDate: string
  endDate: string
  notes: string
}

export interface DailyRouteInput {
  routeDate: string
  title: string
  notes: string
  routeColor: string
}

export interface RoutePointInput {
  googlePlaceId: string
  customName?: string | null
  note?: string | null
  arrivalTime?: string | null
  departureTime?: string | null
}

export interface DeleteTripPlanResponse {
  id: number
  deleted: boolean
}

export type TravelMode = 'WALK' | 'DRIVE' | 'TRANSIT'

export interface RouteLocationInput {
  latitude: number
  longitude: number
}

export interface NavigationRouteInput {
  originPlaceId: string
  destinationPlaceId: string
  dailyRouteId?: number
  originPointId?: number
  destinationPointId?: number
  departureTime?: string | null
  plannedDepartureTime?: string | null
  travelMode: TravelMode
}

export interface NavigationStep {
  travelMode: TravelMode
  instruction: string
  distanceMeters: number
  durationSeconds: number
  distanceText: string
  durationText: string
  transitLine: string | null
  transitHeadsign: string | null
  departureStop: string | null
  arrivalStop: string | null
  departureTime: string | null
  arrivalTime: string | null
  stopCount: number | null
}

export interface NavigationRoute {
  optionId: string
  recommended: boolean
  travelMode: TravelMode
  distanceMeters: number
  durationSeconds: number
  distanceText: string
  durationText: string
  encodedPolyline: string
  steps: NavigationStep[]
  warnings: string[]
}

export interface NavigationRouteOptions {
  travelMode: TravelMode
  options: NavigationRoute[]
  cached: boolean
  stale: boolean
  generatedAt: string
  expiresAt: string
}

export interface NavigationSelection {
  id: number
  dailyRouteId: number
  originPointId: number
  destinationPointId: number
  travelMode: TravelMode
  departureTime: string | null
  status: string
  savedAt: string
}

export interface TripPlanNavigationSelections {
  tripPlanId: number
  selections: NavigationSelection[]
}
