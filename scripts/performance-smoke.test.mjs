import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertThresholds,
  parsePositiveInteger,
  percentile,
  requestJson,
  routePointIdsFromLatestWrite,
  runPool,
} from './performance-smoke.mjs'

test('finds written points to remove before the next soak iteration', () => {
  const ids = routePointIdsFromLatestWrite([
    { ok: true, data: { dailyRoutes: [{ id: 7, routePoints: [{ id: 12 }] }] } },
    { ok: true, data: { dailyRoutes: [{ id: 7, routePoints: [{ id: 12 }, { id: 13 }] }] } },
    { ok: false, data: null },
  ], 7)

  assert.deepEqual(ids, [12, 13])
})

test('computes nearest-rank percentiles', () => {
  assert.equal(percentile([40, 10, 30, 20], 0.95), 40)
  assert.equal(percentile([7], 0.95), 7)
})

test('accepts only positive integers', () => {
  assert.equal(parsePositiveInteger('CONCURRENCY', '4'), 4)
  assert.throws(() => parsePositiveInteger('CONCURRENCY', '0'), /positive integer/)
  assert.throws(() => parsePositiveInteger('CONCURRENCY', '1.5'), /positive integer/)
  assert.throws(() => parsePositiveInteger('CONCURRENCY', 'many'), /positive integer/)
})

test('requestJson reports timeouts and invalid API responses', async () => {
  const abortingFetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    const keepAlive = setTimeout(() => {}, 100)
    signal.addEventListener('abort', () => {
      clearTimeout(keepAlive)
      reject(signal.reason)
    }, { once: true })
  })
  assert.equal((await requestJson('http://example.test', {}, abortingFetch, 5)).ok, false)

  const invalidJson = await requestJson(
    'http://example.test',
    {},
    async () => new Response('not-json', { status: 200 }),
    50,
  )
  assert.equal(invalidJson.ok, false)

  const apiFailure = await requestJson(
    'http://example.test',
    {},
    async () => Response.json({ success: false, data: null }),
    50,
  )
  assert.equal(apiFailure.ok, false)
})

test('runPool never exceeds the requested concurrency', async () => {
  let active = 0
  let peak = 0
  const results = await runPool([1, 2, 3, 4, 5], 2, async (item) => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 5))
    active -= 1
    return item * 2
  })

  assert.deepEqual(results, [2, 4, 6, 8, 10])
  assert.equal(peak, 2)
})

test('threshold errors name the operation and P95', () => {
  assert.throws(
    () => assertThresholds(
      { operations: { list: { failures: 0, p95Ms: 501 } } },
      { list: 500 },
    ),
    /list.*P95/i,
  )
})
