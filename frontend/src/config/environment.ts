const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

export const environment = Object.freeze({
  apiBaseUrl: trimTrailingSlash(import.meta.env.VITE_API_BASE_URL || '/api'),
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  googleMapsMapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) ? 'DEMO_MAP_ID' : ''),
})
