import { create } from 'zustand'
import type { TemporaryPlace, TravelMode } from '../../api/types'

export const useEditorStore = create<{
  temporaryPlace: TemporaryPlace | null
  segment: number | null
  mode: TravelMode
  setPlace: (place: TemporaryPlace | null) => void
  setSegment: (segment: number | null) => void
  setMode: (mode: TravelMode) => void
  reset: () => void
}>((set) => ({
  temporaryPlace: null, segment: null, mode: 'WALK',
  setPlace: (temporaryPlace) => set({ temporaryPlace }),
  setSegment: (segment) => set({ segment }),
  setMode: (mode) => set({ mode }),
  reset: () => set({ temporaryPlace: null, segment: null, mode: 'WALK' }),
}))
