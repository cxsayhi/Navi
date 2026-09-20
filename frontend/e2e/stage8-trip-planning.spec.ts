import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

type TravelMode = 'WALK' | 'DRIVE' | 'TRANSIT'

interface PlaceFixture {
  id: string
  name: string
  address: string
  lat: number
  lng: number
}

interface RouteFailure {
  status: number
  code: string
  message: string
}

interface ApiRoutePoint {
  id: number
  googlePlaceId: string
}

interface ApiDailyRoute {
  id: number
  dayNumber: number
  routeColor: string
  routePoints: ApiRoutePoint[]
}

interface ApiTripPlan {
  id: number
  title: string
  dailyRoutes: ApiDailyRoute[]
}

const places: PlaceFixture[] = [
  { id: 'stage8-shanghai-museum', name: '上海博物馆', address: '上海市黄浦区人民大道201号', lat: 31.2304, lng: 121.4705 },
  { id: 'stage8-bund', name: '外滩', address: '上海市黄浦区中山东一路', lat: 31.2400, lng: 121.4900 },
  { id: 'stage8-yuyuan', name: '豫园', address: '上海市黄浦区福佑路168号', lat: 31.2272, lng: 121.4921 },
  { id: 'stage8-oriental-pearl', name: '东方明珠', address: '上海市浦东新区世纪大道1号', lat: 31.2397, lng: 121.4998 },
  { id: 'stage8-wukang-building', name: '武康大楼', address: '上海市徐汇区淮海中路1850号', lat: 31.2051, lng: 121.4374 },
  { id: 'stage8-shanghai-zoo', name: '上海动物园', address: '上海市长宁区虹桥路2381号', lat: 31.1932, lng: 121.3592 },
  { id: 'stage8-peace-hotel', name: '上海和平饭店', address: '上海市黄浦区南京东路20号', lat: 31.2396, lng: 121.4898 },
  { id: 'stage8-hongqiao-station', name: '上海虹桥火车站', address: '上海市闵行区申贵路1500号', lat: 31.1969, lng: 121.3270 },
]

async function installGoogleMapsMock(page: Page) {
  await page.addInitScript((placeFixtures: PlaceFixture[]) => {
    const mockState = {
      fitBoundsCalls: 0,
      markers: [] as Array<Record<string, unknown>>,
      polylines: [] as Array<Record<string, unknown>>,
    }

    class MockListener {
      remove() {}
    }

    class MockMap {
      fitBounds() {
        mockState.fitBoundsCalls += 1
      }
      setCenter() {}
      setZoom() {}
    }

    class MockMarker {
      map: unknown

      constructor(options: { map?: unknown } & Record<string, unknown>) {
        this.map = options.map
        mockState.markers.push(options)
      }

      setMap(map: unknown) {
        this.map = map
      }

      addListener() {
        return new MockListener()
      }
    }

    class MockPolyline {
      map: unknown

      constructor(options: { map?: unknown } & Record<string, unknown>) {
        this.map = options.map
        mockState.polylines.push(options)
      }

      setMap(map: unknown) {
        this.map = map
      }

      setOptions() {}

      addListener() {
        return new MockListener()
      }
    }

    class MockLatLng {
      constructor(private readonly latitude: number, private readonly longitude: number) {}

      lat() {
        return this.latitude
      }

      lng() {
        return this.longitude
      }
    }

    class MockLatLngBounds {
      private readonly points: MockLatLng[] = []

      extend(point: MockLatLng | { lat: number; lng: number }) {
        this.points.push(point instanceof MockLatLng ? point : new MockLatLng(point.lat, point.lng))
        return this
      }

      isEmpty() {
        return this.points.length === 0
      }

      getCenter() {
        if (this.points.length === 0) return new MockLatLng(0, 0)
        const latitude = this.points.reduce((sum, point) => sum + point.lat(), 0) / this.points.length
        const longitude = this.points.reduce((sum, point) => sum + point.lng(), 0) / this.points.length
        return new MockLatLng(latitude, longitude)
      }
    }

    class MockOverlayView {
      private map: unknown = null

      setMap(map: unknown) {
        this.map = map
        if (map) {
          const overlay = this as MockOverlayView & { onAdd?: () => void; draw?: () => void }
          overlay.onAdd?.()
          overlay.draw?.()
        } else {
          const overlay = this as MockOverlayView & { onRemove?: () => void }
          overlay.onRemove?.()
        }
      }

      getPanes() {
        return { floatPane: document.body }
      }

      getProjection() {
        return {
          fromLatLngToDivPixel: () => ({ x: 120, y: 90 }),
        }
      }
    }

    class MockPlace {
      id: string
      displayName?: string
      formattedAddress?: string
      location?: MockLatLng
      constructor({ id }: { id: string }) { this.id = id }
      async fetchFields() {
        const fixture = placeFixtures.find((place) => place.id === this.id)
        if (!fixture) throw new Error('Place not found')
        this.displayName = fixture.name
        this.formattedAddress = fixture.address
        this.location = new MockLatLng(fixture.lat, fixture.lng)
        return { place: this }
      }
    }

    class MockPlaceAutocompleteElement extends HTMLElement {
      connectedCallback() {
        if (this.firstChild) return
        const input = document.createElement('input')
        input.setAttribute('aria-label', '搜索 Google Maps 地点')
        const suggestions = document.createElement('div')
        suggestions.className = 'place-suggestions'
        input.addEventListener('input', () => {
          suggestions.replaceChildren()
          if (input.value === '触发搜索失败') {
            this.dispatchEvent(new Event('gmp-error'))
            return
          }
          const place = placeFixtures.find((fixture) => fixture.name === input.value)
          if (!place) return
          const button = document.createElement('button')
          button.type = 'button'
          button.textContent = place.name
          button.addEventListener('click', () => {
            const event = new Event('gmp-select')
            Object.assign(event, { placePrediction: { toPlace: () => new MockPlace({ id: place.id }) } })
            this.dispatchEvent(event)
            input.value = ''
            suggestions.replaceChildren()
          })
          suggestions.append(button)
        })
        this.append(input, suggestions)
      }
    }
    customElements.define('gmp-place-autocomplete', MockPlaceAutocompleteElement)

    class MockAutocompleteSessionToken {}

    class MockPlacePrediction {
      readonly placeId: string
      readonly mainText: { text: string }
      readonly secondaryText: { text: string }
      readonly text: { text: string }

      constructor(private readonly place: PlaceFixture) {
        this.placeId = place.id
        this.mainText = { text: place.name }
        this.secondaryText = { text: place.address }
        this.text = { text: place.name }
      }

      toPlace() {
        const fixture = this.place
        return {
          id: fixture.id,
          displayName: fixture.name,
          formattedAddress: fixture.address,
          location: new MockLatLng(fixture.lat, fixture.lng),
          async fetchFields() {},
        }
      }
    }

    class MockAutocompleteSuggestion {
      static async fetchAutocompleteSuggestions(request: { input: string }) {
        if (request.input.trim() === '触发搜索失败') {
          const error = new Error(
            'Requests to this API places.googleapis.com method google.maps.places.v1.Places.AutocompletePlaces are blocked.',
          ) as Error & { code: number }
          error.name = 'RpcError'
          error.code = 7
          throw error
        }
        const match = placeFixtures.find((place) => place.name === request.input.trim())
        return {
          suggestions: match
            ? [{ placePrediction: new MockPlacePrediction(match) }]
            : [],
        }
      }
    }

    const maps = {
      Map: MockMap,
      Marker: MockMarker,
      Polyline: MockPolyline,
      LatLng: MockLatLng,
      LatLngBounds: MockLatLngBounds,
      OverlayView: MockOverlayView,
      SymbolPath: { CIRCLE: 0 },
      event: { clearInstanceListeners() {} },
      importLibrary: async (libraryName: string) => {
        if (libraryName === 'maps') return { Map: MockMap, Polyline: MockPolyline }
        if (libraryName === 'marker') return { AdvancedMarkerElement: MockMarker }
        if (libraryName === 'places') {
          return {
            Place: MockPlace,
            PlaceAutocompleteElement: MockPlaceAutocompleteElement,
            AutocompleteSessionToken: MockAutocompleteSessionToken,
            AutocompleteSuggestion: MockAutocompleteSuggestion,
          }
        }
        if (libraryName === 'geometry') {
          return {
            encoding: {
              decodePath: () => [
                new MockLatLng(31.2304, 121.4705),
                new MockLatLng(31.2400, 121.4900),
              ],
            },
          }
        }
        return {}
      },
    }

    Object.assign(window, {
      google: { maps },
      __wanderlineMapsMock: mockState,
    })
  }, places)
}

async function installRouteOptionsMock(
  page: Page,
  failures: Partial<Record<TravelMode, RouteFailure>> = {},
) {
  await page.route('**/api/routes/compute', async (route) => {
    const request = route.request().postDataJSON() as { travelMode: TravelMode }
    const mode = request.travelMode
    const failure = failures[mode]
    if (failure) {
      const now = new Date().toISOString()
      await route.fulfill({
        status: failure.status,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          data: null,
          error: { code: failure.code, message: failure.message, details: {} },
          timestamp: now,
          requestId: `stage8-failure-${mode.toLowerCase()}`,
        }),
      })
      return
    }
    const modeDetails: Record<TravelMode, { distance: string; recommended: string; alternative: string }> = {
      WALK: { distance: '1.8 公里', recommended: '24 分钟', alternative: '27 分钟' },
      DRIVE: { distance: '2.2 公里', recommended: '12 分钟', alternative: '15 分钟' },
      TRANSIT: { distance: '2.5 公里', recommended: '18 分钟', alternative: '21 分钟' },
    }
    const detail = modeDetails[mode]
    const now = new Date()
    const routeOption = (suffix: string, recommended: boolean, durationText: string) => ({
      optionId: `stage8-${mode.toLowerCase()}-${suffix}`,
      recommended,
      travelMode: mode,
      distanceMeters: mode === 'WALK' ? 1800 : mode === 'DRIVE' ? 2200 : 2500,
      durationSeconds: mode === 'WALK' ? 1440 : mode === 'DRIVE' ? 720 : 1080,
      distanceText: detail.distance,
      durationText,
      encodedPolyline: 'stage8-polyline',
      steps: [{
        travelMode: mode,
        instruction: `${mode === 'WALK' ? '步行' : mode === 'DRIVE' ? '驾车' : '乘坐公交'}测试路线`,
        distanceMeters: 1000,
        durationSeconds: 600,
        distanceText: '1.0 公里',
        durationText: '10 分钟',
        transitLine: mode === 'TRANSIT' ? '阶段8测试线' : null,
        transitHeadsign: null,
        departureStop: null,
        arrivalStop: null,
        departureTime: null,
        arrivalTime: null,
        stopCount: mode === 'TRANSIT' ? 3 : null,
      }],
      warnings: mode === 'TRANSIT' ? ['计划日期超出 Google 公交时刻表范围，显示未来同星期同时间的参考班次。'] : [],
    })

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          travelMode: mode,
          options: [
            routeOption('recommended', true, detail.recommended),
            routeOption('alternative', false, detail.alternative),
          ],
          cached: false,
          stale: false,
          generatedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
        },
        error: null,
        timestamp: now.toISOString(),
        requestId: `stage8-${mode.toLowerCase()}`,
      }),
    })
  })
}

async function selectDay(page: Page, dayNumber: number) {
  await page.locator('.day-route-strip').getByRole('button', {
    name: new RegExp(`DAY ${String(dayNumber).padStart(2, '0')}`),
  }).click()
}

async function addPlace(page: Page, placeName: string) {
  const search = page.getByRole('textbox', { name: '搜索 Google Maps 地点' })
  await search.fill(placeName)
  await page.locator('.place-suggestions').getByRole('button', { name: new RegExp(placeName) }).click()
  await expect(page.locator('.place-preview-card')).toContainText(placeName)
  await page.getByRole('button', { name: '加入路线' }).click()
  await expect(search).toHaveValue('')
}

async function cleanupPlans(request: APIRequestContext) {
  const response = await request.get('/api/trip-plans')
  if (!response.ok()) return
  const payload = await response.json() as { data: Array<{ id: number }> }
  for (const plan of payload.data) {
    const deletion = await request.delete(`/api/trip-plans/${plan.id}`)
    expect(deletion.ok()).toBeTruthy()
  }
}

async function createPlanWithDays(
  request: APIRequestContext,
  title: string,
  dayCount = 1,
): Promise<ApiTripPlan> {
  const startDate = new Date('2027-05-01T00:00:00Z')
  const endDate = new Date(startDate)
  endDate.setUTCDate(endDate.getUTCDate() + dayCount - 1)
  const createResponse = await request.post('/api/trip-plans', {
    data: {
      title,
      destination: '上海',
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      notes: '阶段 8 验收夹具',
    },
  })
  expect(createResponse.ok()).toBeTruthy()
  const created = await createResponse.json() as { data: ApiTripPlan }
  const generateResponse = await request.post(`/api/trip-plans/${created.data.id}/daily-routes/generate`)
  expect(generateResponse.ok()).toBeTruthy()
  const generated = await generateResponse.json() as { data: ApiTripPlan }
  return generated.data
}

async function addApiPlace(
  request: APIRequestContext,
  plan: ApiTripPlan,
  dayIndex: number,
  placeName: string,
): Promise<ApiTripPlan> {
  const place = places.find((fixture) => fixture.name === placeName)
  if (!place) throw new Error(`Missing place fixture: ${placeName}`)
  const routeId = plan.dailyRoutes[dayIndex].id
  const response = await request.post(
    `/api/trip-plans/${plan.id}/daily-routes/${routeId}/route-points`,
    {
      data: {
        googlePlaceId: place.id,
      },
    },
  )
  expect(response.ok()).toBeTruthy()
  const payload = await response.json() as { data: ApiTripPlan }
  return payload.data
}

async function preparePlanWithPlaces(
  request: APIRequestContext,
  title: string,
  placeNames: string[],
): Promise<ApiTripPlan> {
  let plan = await createPlanWithDays(request, title)
  for (const placeName of placeNames) {
    plan = await addApiPlace(request, plan, 0, placeName)
  }
  return plan
}

test.beforeEach(async ({ request }) => {
  await cleanupPlans(request)
})

test('正式版外壳：品牌、帮助、法律入口、键盘焦点与移动布局', async ({ page }) => {
  await installGoogleMapsMock(page)
  await installRouteOptionsMock(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const banner = page.getByRole('banner')
  await expect(banner).toContainText('PLAN · MAP · GO')
  await expect(page.getByText('BUILDING', { exact: true })).toHaveCount(0)
  await expect(page.getByText('STAGE 08', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/阶段八/)).toHaveCount(0)

  const footer = page.getByRole('contentinfo')
  const helpButton = footer.getByRole('button', { name: '使用帮助' })
  await helpButton.focus()
  await helpButton.click()
  const helpDialog = page.getByRole('dialog', { name: '使用帮助' })
  await expect(helpDialog).toContainText('创建一段旅程')
  await expect(helpDialog.getByRole('button', { name: '关闭对话框' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(helpButton).toBeFocused()

  await footer.getByRole('button', { name: '隐私政策' }).click()
  await expect(page.getByRole('dialog', { name: '隐私政策' })).toContainText('Google Maps')
  await page.keyboard.press('Escape')

  await footer.getByRole('button', { name: '服务条款' }).click()
  await expect(page.getByRole('dialog', { name: '服务条款' })).toContainText('路线仅供规划参考')
  await page.keyboard.press('Escape')

  await expect(footer.getByRole('link', { name: '意见反馈' })).toHaveAttribute(
    'href',
    'mailto:ChanceT66@outlook.com',
  )
  await expect(footer).toContainText('Wanderline 1.0.0')

  const hasHorizontalOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth
  ))
  expect(hasHorizontalOverflow).toBe(false)

  const footerTextContrast = await footer.getByRole('button', { name: '使用帮助' }).evaluate((element) => {
    const parseColor = (value: string) => value.match(/\d+/g)!.slice(0, 3).map(Number)
    const luminance = (rgb: number[]) => rgb
      .map((channel) => channel / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0)
    const foreground = luminance(parseColor(getComputedStyle(element).color))
    const background = luminance(parseColor(getComputedStyle(document.body).backgroundColor))
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
  })
  expect(footerTextContrast).toBeGreaterThanOrEqual(4.5)

  await page.getByRole('button', { name: '创建旅游计划' }).click()
  await page.getByLabel('计划名称').fill('移动端验收旅程')
  await page.getByLabel('主要目的地').fill('上海')
  await page.getByLabel('开始日期').fill('2027-09-20')
  await page.getByLabel('结束日期').fill('2027-09-20')
  await page.getByRole('button', { name: /创建计划/ }).click()
  await expect(page.getByRole('heading', { name: '移动端验收旅程' })).toBeVisible()
  await addPlace(page, '上海博物馆')
  await addPlace(page, '外滩')
  await page.getByRole('button', { name: '规划 上海博物馆 到 外滩 的导航' }).click()
  await expect(page.getByRole('radiogroup', { name: '步行备选方案' })).toBeVisible()
  await page.getByRole('button', { name: '预览全部路线' }).click()
  await expect(page.getByRole('button', { name: /返回按日编辑/ })).toBeVisible()
})

test('旅程菜单：桌面收起后悬停临时展开，移开后恢复收起', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')

  const sidebar = page.locator('.plan-sidebar')
  const workspace = page.locator('.workspace-panel')
  const collapseButton = sidebar.getByRole('button', { name: '收起我的旅程' })
  await expect(collapseButton).toHaveAttribute('aria-expanded', 'true')

  await collapseButton.click()
  const expandButton = sidebar.getByRole('button', { name: '展开我的旅程' })
  await expect(expandButton).toHaveAttribute('aria-expanded', 'false')
  await page.mouse.move(1100, 500)
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThanOrEqual(73)
  const collapsedWorkspaceX = (await workspace.boundingBox())!.x

  await sidebar.hover()
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThanOrEqual(317)
  expect((await workspace.boundingBox())!.x).toBeCloseTo(collapsedWorkspaceX, 0)

  await page.mouse.move(1100, 500)
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThanOrEqual(73)

  await expandButton.click()
  await page.mouse.move(1100, 500)
  await expect(sidebar.getByRole('button', { name: '收起我的旅程' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThanOrEqual(317)
})

test('旅程菜单：移动端可手动收起并保留标题栏', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const sidebar = page.locator('.plan-sidebar')
  await sidebar.getByRole('button', { name: '收起我的旅程' }).click()

  await expect(sidebar.getByRole('heading', { name: '我的旅程' })).toBeVisible()
  await expect(sidebar.locator('.plan-list')).toBeHidden()
  await expect(sidebar.getByRole('button', { name: '展开我的旅程' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
})

test('阶段 8：三日计划、实时导航、总览与 Pin 变更', async ({ page }) => {
  await installGoogleMapsMock(page)
  await installRouteOptionsMock(page)

  await page.goto('/')
  await expect(page.getByText('服务已连接')).toBeVisible()

  await page.locator('.plan-sidebar').getByRole('button', { name: '创建旅游计划' }).click()
  await page.getByLabel('计划名称').fill('上海三日自动化旅程')
  await page.getByLabel('主要目的地').fill('上海')
  await page.getByLabel('开始日期').fill('2026-12-01')
  await page.getByLabel('结束日期').fill('2026-12-03')
  await page.getByLabel('计划备注').fill('阶段 8 浏览器完整工作流')
  await page.getByRole('button', { name: /创建计划/ }).click()

  await expect(page.getByRole('heading', { name: '上海三日自动化旅程' })).toBeVisible()
  await expect(page.locator('.day-route-tab')).toHaveCount(3)
  const firstDayBox = await page.locator('.day-route-tab').nth(0).boundingBox()
  const secondDayBox = await page.locator('.day-route-tab').nth(1).boundingBox()
  expect(secondDayBox!.y).toBeGreaterThanOrEqual(firstDayBox!.y + firstDayBox!.height)
  expect(secondDayBox!.x).toBeCloseTo(firstDayBox!.x, 0)

  const dailyPlaces = [
    ['上海博物馆', '外滩'],
    ['豫园', '东方明珠'],
    ['武康大楼', '上海动物园'],
  ]
  for (let dayIndex = 0; dayIndex < dailyPlaces.length; dayIndex += 1) {
    await selectDay(page, dayIndex + 1)
    for (const placeName of dailyPlaces[dayIndex]) {
      await addPlace(page, placeName)
    }
    await expect(page.locator('.route-point-list .route-point')).toHaveCount(2)
  }

  await selectDay(page, 1)
  await expect(page.locator('.route-point-list .point-copy strong')).toHaveText(['上海博物馆', '外滩'])
  await page.getByRole('button', { name: '下移 上海博物馆' }).click()
  await expect(page.locator('.route-point-list .point-copy strong')).toHaveText(['外滩', '上海博物馆'])

  await page.getByRole('button', { name: '规划 外滩 到 上海博物馆 的导航' }).click()
  await page.getByRole('button', { name: '驾车' }).click()
  const driveAlternatives = page.getByRole('radiogroup', { name: '驾车备选方案' }).getByRole('radio')
  await expect(driveAlternatives).toHaveCount(2)
  await page.getByRole('radio', { name: /备选 01.*15 分钟/ }).click()
  await expect(page.getByRole('button', { name: '保存交通偏好' })).toHaveCount(0)

  const plansResponse = await page.request.get('/api/trip-plans')
  expect(plansResponse.ok()).toBeTruthy()
  const plansPayload = await plansResponse.json() as { data: Array<{ id: number }> }
  const planId = plansPayload.data[0].id

  await page.reload()
  await expect(page.getByRole('heading', { name: '上海三日自动化旅程' })).toBeVisible()
  await expect(page.locator('.day-route-tab')).toHaveCount(3)
  await expect(page.locator('.route-point-list .point-copy strong')).toHaveText(['外滩', '上海博物馆'])
  await page.getByRole('button', { name: '规划 外滩 到 上海博物馆 的导航' }).click()
  await expect(page.getByRole('button', { name: '步行' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('radiogroup', { name: '步行备选方案' }).getByRole('radio')).toHaveCount(2)

  await page.getByRole('button', { name: '预览全部路线' }).click()
  await expect(page.getByRole('heading', { name: '旅程总览' })).toBeVisible()
  await expect(page.getByLabel('总览统计')).toContainText('3 days')
  await expect(page.getByLabel('总览统计')).toContainText('6 pins')
  await expect(page.getByLabel('总览统计')).toContainText('0/3 routes')
  await expect(page.getByLabel('每日路线图例').locator('.preview-day-card')).toHaveCount(3)
  const previewColors = await page.locator('.preview-day-card').evaluateAll((cards) => (
    cards.map((card) => card.getAttribute('style'))
  ))
  expect(new Set(previewColors).size).toBe(3)
  await expect(page.getByRole('button', { name: /聚焦 Day 1/ })).toContainText('DAY 01')
  await expect(page.getByRole('button', { name: /聚焦 Day 2/ })).toContainText('DAY 02')
  await expect(page.getByRole('button', { name: /聚焦 Day 3/ })).toContainText('DAY 03')
  await expect(page.getByLabel('地图线型说明')).toContainText('实时导航')
  await expect(page.getByLabel('地图线型说明')).toContainText('Pin 顺序连线')
  const previewFitBoundsCalls = await page.evaluate(() => (
    (window as typeof window & { __wanderlineMapsMock: { fitBoundsCalls: number } })
      .__wanderlineMapsMock.fitBoundsCalls
  ))
  expect(previewFitBoundsCalls).toBeGreaterThan(0)

  await page.getByRole('button', { name: /返回按日编辑/ }).click()
  await page.getByRole('button', { name: '下移 外滩' }).click()
  await expect(page.locator('.route-point-list .point-copy strong')).toHaveText(['上海博物馆', '外滩'])

  const selectionsResponse = await page.request.get(`/api/navigation/selections/trip-plan/${planId}`)
  expect(selectionsResponse.ok()).toBeTruthy()
  const selectionsPayload = await selectionsResponse.json() as { data: { selections: unknown[] } }
  expect(selectionsPayload.data.selections).toHaveLength(0)

  await page.reload()
  await expect(page.locator('.route-point-list .point-copy strong')).toHaveText(['上海博物馆', '外滩'])
  await page.getByRole('button', { name: '规划 上海博物馆 到 外滩 的导航' }).click()
  await expect(page.getByRole('button', { name: '保存交通偏好' })).toHaveCount(0)
})

test('计划管理：单日创建、扩展日期、补齐 Day 并删除计划', async ({ page }) => {
  await installGoogleMapsMock(page)
  await installRouteOptionsMock(page)
  await page.goto('/')

  await page.locator('.plan-sidebar').getByRole('button', { name: '创建旅游计划' }).click()
  await page.getByLabel('计划名称').fill('杭州一日计划')
  await page.getByLabel('主要目的地').fill('杭州')
  await page.getByLabel('开始日期').fill('2027-06-03')
  await page.getByLabel('结束日期').fill('2027-06-01')
  expect(await page.getByLabel('结束日期').evaluate((input: HTMLInputElement) => (
    input.validity.valid
  ))).toBe(false)
  await page.getByRole('button', { name: /创建计划/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.getByLabel('结束日期').fill('2027-06-03')
  await page.getByRole('button', { name: /创建计划/ }).click()
  await expect(page.getByRole('heading', { name: '杭州一日计划' })).toBeVisible()
  await expect(page.locator('.day-route-tab')).toHaveCount(1)
  await expect(page.locator('.day-route-tab')).toContainText('DAY 01')
  await expect(page.locator('.day-route-tab')).toContainText('06/03')

  await page.getByRole('button', { name: '编辑计划' }).click()
  await page.getByLabel('计划名称').fill('杭州三日计划')
  await page.getByLabel('结束日期').fill('2027-06-05')
  await page.getByRole('button', { name: /保存计划/ }).click()
  await expect(page.getByRole('heading', { name: '杭州三日计划' })).toBeVisible()
  await page.getByRole('button', { name: '补齐剩余 2 天' }).click()
  await expect(page.locator('.day-route-tab')).toHaveCount(3)
  await expect(page.locator('.day-route-tab').nth(2)).toContainText('DAY 03')
  await expect(page.locator('.day-route-tab').nth(2)).toContainText('06/05')

  await page.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('计划内的所有每日路线也会一起删除')
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByRole('heading', { name: '每一段路线，都从一个日期开始。' })).toBeVisible()
  await expect(page.locator('.plan-list-item')).toHaveCount(0)
})

test('地点与连线：景点、酒店、车站、临时 Pin、拖拽和搜索异常', async ({ page, request }) => {
  const plan = await createPlanWithDays(request, '地点与连线验收')
  await installGoogleMapsMock(page)
  await installRouteOptionsMock(page)
  await page.goto('/')

  await expect(page.getByText('搜索并加入第一个地点。')).toBeVisible()
  const search = page.getByRole('textbox', { name: '搜索 Google Maps 地点' })
  await search.fill('上海博物馆')
  await page.locator('.place-suggestions').getByRole('button', { name: /上海博物馆/ }).click()
  await expect(page.locator('.place-preview-card')).toContainText('上海市黄浦区人民大道201号')
  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & {
      __wanderlineMapsMock: { markers: Array<{ title?: string }> }
    }).__wanderlineMapsMock.markers.some((marker) => marker.title === '待添加：上海博物馆')
  ))).toBeTruthy()
  await page.getByRole('button', { name: '加入路线' }).click()
  await expect(page.locator('.route-point')).toHaveCount(1)

  await addPlace(page, '上海和平饭店')
  await addPlace(page, '上海虹桥火车站')
  await expect(page.locator('.route-point-list .point-copy strong')).toHaveText([
    '上海博物馆',
    '上海和平饭店',
    '上海虹桥火车站',
  ])
  await expect(page.locator('.route-segment-nav-button')).toHaveCount(2)
  await expect(page.locator('.route-segment-nav-button img')).toHaveCount(2)

  const mapGeometry = await page.evaluate(() => {
    const state = (window as typeof window & {
      __wanderlineMapsMock: {
        markers: Array<{ content?: HTMLElement }>
        polylines: Array<{ strokeWeight?: number }>
      }
    }).__wanderlineMapsMock
    return {
      pinLabels: state.markers.map((marker) => marker.content?.textContent).filter(Boolean),
      hitAreaCount: state.polylines.filter((line) => line.strokeWeight === 24).length,
    }
  })
  expect(mapGeometry.pinLabels).toEqual(expect.arrayContaining(['1', '2', '3']))
  expect(mapGeometry.hitAreaCount).toBeGreaterThanOrEqual(2)

  const dragHandle = page.getByRole('button', { name: '拖动 上海博物馆' })
  const secondStopId = await page.locator('.route-point').nth(1).getAttribute('data-stop-id')
  const thirdStopId = await page.locator('.route-point').nth(2).getAttribute('data-stop-id')
  await dragHandle.focus()
  await page.keyboard.press('Space')
  await expect(dragHandle).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('status')).toContainText(`over droppable area ${secondStopId}`)
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('status')).toContainText(`over droppable area ${thirdStopId}`)
  await page.keyboard.press('Space')
  await expect(page.locator('.route-point-list .point-copy strong')).toHaveText([
    '上海和平饭店',
    '上海虹桥火车站',
    '上海博物馆',
  ])
  await expect(page.getByRole('button', { name: '规划 上海和平饭店 到 上海虹桥火车站 的导航' })).toBeVisible()
  await expect(page.getByRole('button', { name: '规划 上海虹桥火车站 到 上海博物馆 的导航' })).toBeVisible()

  await page.getByRole('button', { name: '删除 上海虹桥火车站' }).click()
  await expect(page.locator('.route-segment-nav-button')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '规划 上海和平饭店 到 上海博物馆 的导航' })).toBeVisible()

  await search.fill('不存在的测试地点')
  await expect(page.locator('.place-suggestions button')).toHaveCount(0)
  await expect(page.locator('.route-point-list .route-point')).toHaveCount(2)
  await search.fill('触发搜索失败')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('.route-point-list .route-point')).toHaveCount(2)

  await page.reload()
  await expect(page.locator('.route-point-list .point-copy strong')).toHaveText(['上海和平饭店', '上海博物馆'])
  const persistedResponse = await request.get(`/api/trip-plans/${plan.id}`)
  const persisted = await persistedResponse.json() as { data: ApiTripPlan & {
    dailyRoutes: Array<ApiDailyRoute & {
      routePoints: Array<ApiRoutePoint & {
        formattedAddress: string
        latitude: number
        longitude: number
      }>
    }>
  } }
  const savedPoint = persisted.data.dailyRoutes[0].routePoints[0]
  expect(savedPoint.googlePlaceId).toBe('stage8-peace-hotel')
  for (const field of ['name', 'formattedAddress', 'latitude', 'longitude']) {
    expect(savedPoint).not.toHaveProperty(field)
  }
})

test('排序保存失败时保持页面与后端原顺序', async ({ page, request }) => {
  const plan = await preparePlanWithPlaces(
    request,
    '排序回滚验收',
    ['上海博物馆', '外滩', '豫园'],
  )
  await installGoogleMapsMock(page)
  await installRouteOptionsMock(page)
  await page.route('**/route-points/reorder', async (route) => {
    const now = new Date().toISOString()
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        data: null,
        error: { code: 'INTERNAL_ERROR', message: '排序保存失败', details: {} },
        timestamp: now,
        requestId: 'stage8-reorder-failure',
      }),
    })
  })
  await page.goto('/')

  const expectedOrder = ['上海博物馆', '外滩', '豫园']
  await expect(page.locator('.route-point-list .point-copy strong')).toHaveText(expectedOrder)
  await page.getByRole('button', { name: '下移 上海博物馆' }).click()
  await expect(page.getByRole('alert')).toContainText('排序保存失败')
  await expect(page.locator('.route-point-list .point-copy strong')).toHaveText(expectedOrder)

  const response = await request.get(`/api/trip-plans/${plan.id}`)
  const payload = await response.json() as { data: ApiTripPlan }
  expect(payload.data.dailyRoutes[0].routePoints.map((point) => point.googlePlaceId))
    .toEqual(['stage8-shanghai-museum', 'stage8-bund', 'stage8-yuyuan'])
})

test('导航验收：步行、驾车、公交换乘、滚动时间选择且不保存交通偏好', async ({ page, request }) => {
  const plan = await preparePlanWithPlaces(request, '三种导航方式验收', ['上海博物馆', '外滩'])
  await installGoogleMapsMock(page)
  await installRouteOptionsMock(page)
  let saveRequestCount = 0
  page.on('request', (browserRequest) => {
    if (browserRequest.method() === 'PUT' && browserRequest.url().endsWith('/api/navigation/selections')) {
      saveRequestCount += 1
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '规划 上海博物馆 到 外滩 的导航' }).click()

  await expect(page.getByRole('radiogroup', { name: '步行备选方案' }).getByRole('radio')).toHaveCount(2)
  await expect(page.locator('.navigation-summary')).toContainText('1.8 公里')
  await expect(page.locator('.navigation-summary')).toContainText('24 分钟')
  await page.getByRole('button', { name: '驾车' }).click()
  await expect(page.getByRole('radiogroup', { name: '驾车备选方案' }).getByRole('radio')).toHaveCount(2)
  await expect(page.locator('.navigation-summary')).toContainText('2.2 公里')
  await page.getByRole('button', { name: '公交', exact: true }).click()
  await expect(page.getByRole('radiogroup', { name: '乘车备选方案' }).getByRole('radio')).toHaveCount(2)
  await expect(page.getByText(/阶段8测试线 · 3 站/)).toBeVisible()
  await expect(page.getByText(/参考班次/)).toBeVisible()

  await page.getByRole('button', { name: /路段出发时间/ }).click()
  await page.getByLabel(/路段出发时间.*小时/).selectOption('12')
  await page.getByLabel(/路段出发时间.*分钟/).selectOption('30')
  await page.getByRole('button', { name: '完成时间选择' }).click()
  await expect(page.getByRole('button', { name: /路段出发时间/ })).toContainText('12:30')
  await expect(page.getByRole('button', { name: '保存交通偏好' })).toHaveCount(0)
  await expect(page.getByText('交通偏好已保存')).toHaveCount(0)
  expect(saveRequestCount).toBe(0)

  const selections = await request.get(`/api/navigation/selections/trip-plan/${plan.id}`)
  const payload = await selections.json() as {
    data: { selections: Array<{ travelMode: TravelMode; selectedRoute: { optionId: string } }> }
  }
  expect(payload.data.selections).toHaveLength(0)
})

test('导航异常：公交无方案不影响驾车，超时与额度状态可区分', async ({ page, request }) => {
  await preparePlanWithPlaces(request, '导航异常验收', ['上海博物馆', '外滩'])
  await installGoogleMapsMock(page)
  await installRouteOptionsMock(page, {
    WALK: { status: 504, code: 'MAP_TIMEOUT', message: '地图服务响应超时' },
    DRIVE: { status: 503, code: 'MAP_RATE_LIMITED', message: 'Google Routes API 额度暂时耗尽' },
  })
  await page.goto('/')
  await page.getByRole('button', { name: '规划 上海博物馆 到 外滩 的导航' }).click()
  await expect(page.getByRole('alert')).toContainText('地图服务响应超时')
  await page.getByRole('button', { name: '驾车' }).click()
  await expect(page.getByRole('alert')).toContainText('地图项目额度暂时耗尽')
  await page.getByRole('button', { name: '公交', exact: true }).click()
  await expect(page.getByRole('radiogroup', { name: '乘车备选方案' }).getByRole('radio')).toHaveCount(2)

  await cleanupPlans(request)
  await preparePlanWithPlaces(request, '公交无方案验收', ['上海博物馆', '外滩'])
  await page.reload()
  await page.unroute('**/api/routes/compute')
  await installRouteOptionsMock(page, {
    TRANSIT: { status: 404, code: 'MAP_ROUTE_NOT_FOUND', message: '当前时间没有可用的公共交通方案' },
  })
  await page.reload()
  await page.getByRole('button', { name: '规划 上海博物馆 到 外滩 的导航' }).click()
  await page.getByRole('button', { name: '公交', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('两点之间暂无公交方案')
  await page.getByRole('button', { name: '查看驾车' }).click()
  await expect(page.getByRole('radiogroup', { name: '驾车备选方案' }).getByRole('radio')).toHaveCount(2)
})

test('时区、地点备注时间和跨日移动刷新后保留', async ({ page, request }) => {
  let plan = await createPlanWithDays(request, '编辑旅行意图', 2)
  plan = await addApiPlace(request, plan, 0, '上海博物馆')
  const stopId = plan.dailyRoutes[0].routePoints[0].id
  await installGoogleMapsMock(page)
  await installRouteOptionsMock(page)
  await page.goto('/')
  await page.getByRole('button', { name: '编辑计划', exact: true }).click()
  await page.getByLabel(/时区/).fill('Asia/Shanghai')
  await page.getByRole('button', { name: /保存计划/ }).click()
  const pointRow = page.locator('.route-point').filter({ hasText: '上海博物馆' })
  await expect(page.getByRole('button', { name: '编辑 上海博物馆' })).toHaveCount(0)
  await page.getByRole('button', { name: '编辑地点 上海博物馆' }).click()
  await expect(pointRow).toHaveClass(/route-point--editing/)
  await page.getByLabel('自定义名称').fill('预约的博物馆')
  await page.getByLabel('地点备注').fill('带上预约凭证')
  await page.getByRole('button', { name: '预计到达' }).click()
  await page.getByLabel('预计到达小时').selectOption('10')
  await page.getByLabel('预计到达分钟').selectOption('00')
  await page.getByRole('button', { name: '完成时间选择' }).click()
  await page.getByRole('button', { name: '预计离开' }).click()
  await page.getByLabel('预计离开小时').selectOption('12')
  await page.getByLabel('预计离开分钟').selectOption('30')
  await page.getByRole('button', { name: '完成时间选择' }).click()
  await page.getByLabel('移至日期').selectOption(String(plan.dailyRoutes[1].id))
  await page.getByRole('button', { name: '保存地点' }).click()
  await selectDay(page, 2)
  await expect(page.locator('.point-copy strong')).toHaveText(['预约的博物馆'])
  await page.reload()
  await selectDay(page, 2)
  await expect(page.locator('.point-copy strong')).toHaveText(['预约的博物馆'])
  const response = await request.get(`/api/trips/${plan.id}`)
  const { data } = await response.json()
  expect(data.timezone).toBe('Asia/Shanghai')
  expect(data.dailyRoutes[0].routePoints).toHaveLength(0)
  expect(data.dailyRoutes[1].routePoints[0]).toMatchObject({
    id: stopId, customName: '预约的博物馆', note: '带上预约凭证', arrivalTime: '10:00', departureTime: '12:30',
  })
})
