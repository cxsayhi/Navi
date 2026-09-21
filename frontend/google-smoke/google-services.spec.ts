import { expect, test } from '@playwright/test'

test('Google Maps, Places, and Routes work with dedicated smoke credentials', async ({ page, request }) => {
  let planId: number | undefined
  try {
    const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const creation = await request.post('/api/trip-plans', {
      data: {
        title: 'Google services smoke',
        destination: 'Istanbul',
        timezone: 'Europe/Istanbul',
        startDate: date,
        endDate: date,
        notes: 'Temporary protected smoke data',
      },
    })
    expect(creation.ok()).toBeTruthy()
    const created = await creation.json() as { data: { id: number } }
    planId = created.data.id

    await page.goto('/')
    await expect(page.locator('.gm-style')).toBeVisible()

    const origin = await page.evaluate(async () => {
      const { Place } = await google.maps.importLibrary('places') as google.maps.PlacesLibrary
      const { places } = await Place.searchByText({
        textQuery: 'Sultan Ahmed Mosque Istanbul',
        fields: ['id', 'displayName'],
      })
      const place = places[0]
      return place ? { id: place.id, displayName: place.displayName } : null
    })
    expect(origin?.id).toBeTruthy()

    const route = await request.post('/api/routes/compute', {
      data: {
        originPlaceId: origin!.id,
        destinationPlaceId: 'ChIJJxwBkr65yhQRrk9EN29vbiM',
        travelMode: 'WALK',
        departureTime: new Date(Date.now() + 3_600_000).toISOString(),
      },
    })
    expect(route.ok()).toBeTruthy()
    const result = await route.json() as {
      success: boolean
      data: { options: unknown[] } | null
    }
    expect(result.success).toBe(true)
    expect(result.data?.options.length).toBeGreaterThan(0)
  } finally {
    if (planId !== undefined) {
      await request.delete(`/api/trip-plans/${planId}`)
    }
  }
})
