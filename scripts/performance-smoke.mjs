import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export function percentile(samples, p) {
  if (!samples.length) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]
}

export function parsePositiveInteger(name, value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function parseNonNegativeInteger(name, value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return parsed
}

export async function requestJson(url, init = {}, fetchImpl = fetch, timeoutMs = 5000) {
  const started = performance.now()
  try {
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    const response = await fetchImpl(url, {
      ...init,
      signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
    const text = await response.text()
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      throw new Error(`invalid JSON (HTTP ${response.status})`)
    }
    if (!response.ok || payload.success !== true || payload.data == null) {
      throw new Error(payload.error?.message || `request failed (HTTP ${response.status})`)
    }
    return { ok: true, durationMs: performance.now() - started, data: payload.data, error: null }
  } catch (error) {
    return {
      ok: false,
      durationMs: performance.now() - started,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function runPool(items, concurrency, operation) {
  const results = new Array(items.length)
  let nextIndex = 0
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await operation(items[index], index)
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(concurrency, items.length) },
    worker,
  ))
  return results
}

export function routePointIdsFromLatestWrite(results, dailyRouteId) {
  const latest = results.findLast(({ ok }) => ok)
  const route = latest?.data?.dailyRoutes?.find(({ id }) => id === dailyRouteId)
  return route?.routePoints?.map(({ id }) => id) ?? []
}

export function assertThresholds(report, thresholds) {
  for (const [name, operation] of Object.entries(report.operations)) {
    if (operation.failures > 0) {
      throw new Error(`${name} failed ${operation.failures} request(s)`)
    }
    if (operation.p95Ms > thresholds[name]) {
      throw new Error(`${name} P95 ${operation.p95Ms}ms exceeded ${thresholds[name]}ms`)
    }
  }
}

const defaults = {
  baseUrl: 'http://127.0.0.1:8083',
  concurrency: 4,
  readRequests: 24,
  writeRequests: 8,
  routeRequests: 8,
  durationMs: 0,
  timeoutMs: 5000,
  reportPath: 'artifacts/performance/report.json',
}

const thresholds = { list: 500, detail: 500, write: 800, routes: 1500 }

function settings(env) {
  return {
    baseUrl: env.WANDERLINE_PERF_BASE_URL || defaults.baseUrl,
    concurrency: parsePositiveInteger('WANDERLINE_PERF_CONCURRENCY', env.WANDERLINE_PERF_CONCURRENCY || defaults.concurrency),
    readRequests: parsePositiveInteger('WANDERLINE_PERF_READ_REQUESTS', env.WANDERLINE_PERF_READ_REQUESTS || defaults.readRequests),
    writeRequests: parsePositiveInteger('WANDERLINE_PERF_WRITE_REQUESTS', env.WANDERLINE_PERF_WRITE_REQUESTS || defaults.writeRequests),
    routeRequests: parsePositiveInteger('WANDERLINE_PERF_ROUTE_REQUESTS', env.WANDERLINE_PERF_ROUTE_REQUESTS || defaults.routeRequests),
    durationMs: parseNonNegativeInteger('WANDERLINE_PERF_DURATION_MS', env.WANDERLINE_PERF_DURATION_MS ?? defaults.durationMs),
    timeoutMs: parsePositiveInteger('WANDERLINE_PERF_TIMEOUT_MS', env.WANDERLINE_PERF_TIMEOUT_MS || defaults.timeoutMs),
    reportPath: env.WANDERLINE_PERF_REPORT_PATH || defaults.reportPath,
  }
}

function summarize(samples, wallMs) {
  const durations = samples.map(({ durationMs }) => durationMs)
  const successes = samples.filter(({ ok }) => ok).length
  return {
    requests: samples.length,
    successes,
    failures: samples.length - successes,
    requestsPerSecond: Number((samples.length / Math.max(wallMs / 1000, 0.001)).toFixed(2)),
    averageMs: Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(2)),
  }
}

async function requireSuccess(result, action) {
  if (!result.ok) throw new Error(`${action}: ${result.error}`)
  return result.data
}

export async function runPerformanceSmoke(env = process.env) {
  const config = settings(env)
  const startedAt = new Date()
  const samples = Object.fromEntries(Object.keys(thresholds).map((name) => [name, []]))
  const wallMs = Object.fromEntries(Object.keys(thresholds).map((name) => [name, 0]))
  const api = (pathname, init) => requestJson(`${config.baseUrl}${pathname}`, init, fetch, config.timeoutMs)
  let planId
  let pointIndex = 0

  const benchmark = async (name, count, operation, concurrency = config.concurrency) => {
    const started = performance.now()
    const results = await runPool(Array.from({ length: count }), concurrency, operation)
    wallMs[name] += performance.now() - started
    samples[name].push(...results)
    return results
  }

  try {
    const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const plan = await requireSuccess(await api('/api/trip-plans', {
      method: 'POST',
      body: JSON.stringify({
        title: `Performance smoke ${Date.now()}`,
        destination: 'Shanghai',
        timezone: 'Asia/Shanghai',
        startDate: date,
        endDate: date,
        notes: 'Temporary performance gate data',
      }),
    }), 'create plan')
    planId = plan.id
    const generated = await requireSuccess(
      await api(`/api/trip-plans/${planId}/daily-routes/generate`, { method: 'POST' }),
      'generate daily route',
    )
    const dailyRouteId = generated.dailyRoutes[0].id
    const deadline = config.durationMs > 0 ? performance.now() + config.durationMs : 0

    do {
      await benchmark('list', config.readRequests, () => api('/api/trip-plans'))
      await benchmark('detail', config.readRequests, () => api(`/api/trip-plans/${planId}`))
      const writes = await benchmark('write', config.writeRequests, () => api(
        `/api/trip-plans/${planId}/daily-routes/${dailyRouteId}/route-points`,
        {
          method: 'POST',
          body: JSON.stringify({ googlePlaceId: `perf-place-${pointIndex++}` }),
        },
      ), 1)
      for (const routePointId of routePointIdsFromLatestWrite(writes, dailyRouteId)) {
        await requireSuccess(
          await api(
            `/api/trip-plans/${planId}/daily-routes/${dailyRouteId}/route-points/${routePointId}`,
            { method: 'DELETE' },
          ),
          `remove route point ${routePointId}`,
        )
      }
      await benchmark('routes', config.routeRequests, () => api('/api/routes/compute', {
        method: 'POST',
        body: JSON.stringify({
          originPlaceId: 'ChIJ4fRwZb25yhQRpHwVijb3LeU',
          destinationPlaceId: 'ChIJJxwBkr65yhQRrk9EN29vbiM',
          travelMode: 'WALK',
          departureTime: new Date(Date.now() + 3_600_000).toISOString(),
        }),
      }))
    } while (deadline && performance.now() < deadline)

    const report = {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      baseUrl: config.baseUrl,
      concurrency: config.concurrency,
      operations: Object.fromEntries(Object.keys(thresholds).map((name) => [
        name,
        summarize(samples[name], wallMs[name]),
      ])),
    }
    await mkdir(path.dirname(config.reportPath), { recursive: true })
    await writeFile(config.reportPath, `${JSON.stringify(report, null, 2)}\n`)
    assertThresholds(report, thresholds)
    return report
  } finally {
    if (planId) await api(`/api/trip-plans/${planId}`, { method: 'DELETE' })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPerformanceSmoke()
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
}
