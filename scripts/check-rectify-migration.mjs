import assert from 'node:assert/strict'

// Run only against the isolated migration-check server, never the user's live API.
const base = 'http://127.0.0.1:8083/api'
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json()
  assert.equal(response.ok, true, JSON.stringify(payload.error))
  return payload.data
}

let plan = await request('/trips', 'POST', {
  title: 'Rectify PostgreSQL check', destination: 'Istanbul',
  startDate: '2027-05-01', endDate: '2027-05-02', timezone: 'Europe/Istanbul',
})
try {
  const [first, second] = plan.dailyRoutes
  const stopsPath = `/trips/${plan.id}/days/${first.id}/stops`
  for (const googlePlaceId of ['hotel', 'museum', 'hotel', 'station']) {
    plan = await request(stopsPath, 'POST', { googlePlaceId })
  }
  const [a, b, c, d] = plan.dailyRoutes[0].routePoints
  assert.equal(a.googlePlaceId, c.googlePlaceId)
  assert.notEqual(a.id, c.id)
  for (const field of ['name', 'formattedAddress', 'latitude', 'longitude']) {
    assert.equal(field in a, false)
  }
  const preference = await request('/navigation/selections', 'PUT', {
    dailyRouteId: first.id, originPointId: a.id, destinationPointId: b.id,
    travelMode: 'TRANSIT', departureTime: '10:30',
  })
  assert.equal('selectedRoute' in preference, false)
  plan = await request(`${stopsPath}/order`, 'PUT', { routePointIds: [a.id, b.id, d.id, c.id] })
  assert.deepEqual(plan.dailyRoutes[0].routePoints.map((p) => p.id), [a.id, b.id, d.id, c.id])
  let saved = await request(`/navigation/selections/trip-plan/${plan.id}`)
  assert.equal(saved.selections.length, 1)
  assert.equal(saved.selections[0].id, preference.id)
  plan = await request(`/stops/${d.id}`, 'PATCH', {
    dailyRouteId: second.id, customName: 'My station', departureTime: '11:00', note: 'Tickets',
  })
  assert.equal(plan.dailyRoutes[1].routePoints[0].id, d.id)
  assert.equal(plan.dailyRoutes[1].routePoints[0].customName, 'My station')
  saved = await request(`/navigation/selections/trip-plan/${plan.id}`)
  assert.equal(saved.selections[0].id, preference.id)
  await request(`/stops/${b.id}`, 'DELETE')
  saved = await request(`/navigation/selections/trip-plan/${plan.id}`)
  assert.equal(saved.selections.length, 0)
  console.log('PASS: PostgreSQL repeat visits, ordering, cross-day IDs, metadata and selective preference invalidation')
} finally {
  await request(`/trips/${plan.id}`, 'DELETE')
}
