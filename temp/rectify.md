### 最终推荐技术栈

| 层级     | 技术                         |
| ------ | -------------------------- |
| 前端     | React + TypeScript + Vite  |
| UI     | Tailwind CSS               |
| 地图     | Google Maps JavaScript API |
| 地点搜索   | Places API (New)           |
| Marker | AdvancedMarkerElement      |
| 路线     | Google Routes API          |
| 拖拽排序   | dnd-kit                    |
| 请求状态   | TanStack Query             |
| 本地编辑状态 | Zustand 或 React Context    |
| 后端     | Spring Boot + Java 21      |
| 数据库    | PostgreSQL                 |
| 数据库迁移  | Flyway                     |
| 部署     | Docker Compose + Nginx     |

这里我现在会更倾向于 **Zustand + TanStack Query**，而不是纯 React Context。因为你后面的地图状态会比较复杂，比如：

`selectedDay → selectedStop → temporaryPlace → selectedSegment → routeOptions → previewMode`

如果全塞 Context，后面很容易产生大量 provider 和无关组件重渲染。

---

## Google Maps 下，整体架构应该这样改

你的系统核心其实不是：

> Trip → 一整条 Route

而应该是：

```text
Trip
 ├── Day 1
 │    ├── Stop A
 │    ├── Stop B
 │    ├── Stop C
 │    └── Stop D
 │
 │    A ─ Segment 1 ─ B
 │    B ─ Segment 2 ─ C
 │    C ─ Segment 3 ─ D
 │
 ├── Day 2
 │    ...
```

这是整个系统最重要的设计。

**Stop 是节点，Segment 是边。**

比如你的土耳其旅行：

```text
Day 3

Taksim Square
     ↓
Dolmabahçe Palace
     ↓
Galata Tower
     ↓
Spice Bazaar
```

数据库实际上保存：

```text
Stop 1: Taksim
Stop 2: Dolmabahçe
Stop 3: Galata
Stop 4: Spice Bazaar
```

对应：

```text
Segment 1
Taksim → Dolmabahçe
mode = WALK

Segment 2
Dolmabahçe → Galata
mode = TRANSIT

Segment 3
Galata → Spice Bazaar
mode = WALK
```

这比一次性请求：

```text
Taksim → Dolmabahçe → Galata → Spice Bazaar
```

合理很多。

因为每一段可能用不同交通方式。

---

# 一处必须修改的数据设计

你之前这里：

```text
day_stop
地点名称
地址
经纬度
POI ID
```

我建议 Google Maps 版本改成：

```text
day_stop

id
day_id

google_place_id

custom_name
user_note

sort_order
planned_arrival_time
planned_departure_time

created_at
updated_at
```

然后 Google 地点本身的数据：

```text
displayName
formattedAddress
location
photo
rating
openingHours
```

**不要默认永久复制一份进自己的数据库。**

Google 官方明确允许长期保存 `place_id`，而且建议超过约 12 个月的 Place ID 做一次刷新。([Google for Developers][2])

所以你可以把：

```text
ChIJ...
```

当作你的地点引用。

加载计划时：

```text
DB
 ↓
google_place_id
 ↓
Place Details
 ↓
name
address
location
```

再显示 Marker。

---

# 一个很重要的坑：Google 数据缓存

这一点我会改掉原方案。

之前写：

> route_segment 保存地图返回的 polyline，预览时不必重新请求地图服务。

从纯软件架构看很漂亮，但在 Google Maps 下需要谨慎。

Google Routes API 的政策明确说明：

> 大多数 Routes API 内容的缓存受到限制，而 Place ID 可以保存。([Google for Developers][3])

Places 的政策也明确把 Place ID 作为缓存限制的例外。([Google for Developers][4])

所以建议第一版不要做：

```text
数据库永久保存 Google polyline
```

而采用：

```text
route_segment

id
from_stop_id
to_stop_id

travel_mode

planned_departure_time

status
created_at
updated_at
```

例如：

```json
{
  "fromStop": 18,
  "toStop": 19,
  "travelMode": "TRANSIT"
}
```

打开计划时再请求 Routes API。

---

# 这样其实还有一个额外好处

路线天然是动态的。

例如：

```text
2026-08-12

Kaş
 ↓
Antalya
```

驾车时间可能：

```text
昨天：
3 h 05 min

今天：
3 h 45 min
```

公共交通尤其明显。

如果把：

```text
duration = 185 min
polyline = XXXXX
```

永久保存下来，过几个月可能已经失效。

所以你的数据库应该保存的是：

> **用户的旅行意图**

而不是：

> Google 当时计算出的结果。

这两个概念要分开。

---

# 地点搜索建议稍微调整

原本：

```text
AMap.AutoComplete
+
AMap.PlaceSearch
```

现在变成：

```text
PlaceAutocompleteElement
```

Google 当前推荐的新 Autocomplete 组件就是：

```ts
google.maps.places.PlaceAutocompleteElement
```

用户输入：

```text
Göreme
```

返回候选：

```text
Göreme, Nevşehir, Türkiye

Göreme Open Air Museum

Göreme Sunset Point
```

选择以后拿到 `Place`，再通过 `fetchFields()` 请求你真正需要的数据，例如：

```ts
await place.fetchFields({
    fields: [
        "id",
        "displayName",
        "formattedAddress",
        "location"
    ]
})
```

Google 现在推荐的是新的 `Place` 类，而不是旧的 Places Service 设计。([Google for Developers][1])

---

# UI 流程我建议也稍微改一下

你的编辑页面：

```text
┌────────────────────────────────────────────────────────┐
│ ← Turkey 2026                             Preview      │
├────────────┬───────────────────────────┬───────────────┤
│            │ Search places...          │ Day 3         │
│ Day 1      │                           │               │
│ Aug 06     │                           │ ☰ Taksim      │
│            │          MAP              │               │
│ Day 2      │                           │ ☰ Dolmabahçe  │
│ Aug 07     │        ●                  │               │
│            │       ╱                   │ ☰ Galata      │
│ Day 3  ←   │      ●────●               │               │
│ Aug 08     │                           │ + Add Stop    │
│            │                           │               │
│ Day 4      │                           │               │
└────────────┴───────────────────────────┴───────────────┘
```

我认为这一版比“地图为中心、所有操作都在地图里完成”更好。

---

# Pin 不建议直接 1、2、3、4

我建议：

```text
Day 3

①
②
③
④
```

Marker 内显示当天顺序。

而当天第一个 Marker：

```text
┌──────────────┐
│ Day 3        │
│ Aug 8        │
└──────┬───────┘
       ●
```

这样 Preview 页面一眼就能看懂。

---

# 点击路线 Segment

这个功能原方案基本正确。

但实现时不要只有一根线：

```text
Polyline
strokeWeight: 4
```

因为很难点。

采用：

```text
visible polyline
strokeWeight: 4
```

再覆盖：

```text
invisible hit polyline
strokeWeight: 20
opacity: 0
```

用户实际上点的是下面那条透明粗线。

这是地图交互里非常值得提前设计的一个细节。

---

# 点击 Segment 后

比如：

```text
Galata Tower
      ↓
Spice Bazaar
```

右侧打开：

```text
────────────────────────

Galata Tower
        ↓
Spice Bazaar

🚶 Walk
22 min
1.6 km

🚗 Drive
12 min
2.9 km

🚇 Transit
18 min
Metro + Walk

────────────────────────
```

Routes API 当前支持：

```text
DRIVE
WALK
BICYCLE
TWO_WHEELER
TRANSIT
```

所以未来甚至可以扩展自行车和摩托车。需要注意，Google 当前仍把 WALK/BICYCLE/TWO_WHEELER 标成 Beta，并要求显示对应提示。([Google for Developers][5])

MVP 只做：

```text
DRIVE
WALK
TRANSIT
```

完全合理。

---

# 公交路线有一个产品层面的特殊处理

比如：

```text
Day 5
2026-12-21

Tokyo Station
    ↓
Hakone
```

公共交通路线和：

```text
departureTime
```

强相关。

所以 `route_segment` 最好预留：

```text
planned_departure_time
```

例如：

```text
09:00
```

否则：

> 公交需要几点出发？

系统不知道。

第一版可以暂时设计为：

```text
如果用户没有设时间
→ 使用 DayStop 的预计离开时间

还没有时间
→ 使用默认 09:00
```

后续再做真正的 timeline。

---

# 数据库我建议最终这样

```text
trip
──────────────────
id
name
start_date
end_date
timezone
created_at
updated_at
```

例如：

```text
Turkey Trip
2026-08-06
2026-08-17
Europe/Istanbul
```

---

```text
trip_day
──────────────────
id
trip_id
day_index
date
color
```

例如：

```text
Day 1
2026-08-06
#4285F4
```

---

```text
day_stop
──────────────────
id
day_id

google_place_id

custom_name
note

sort_order

arrival_time
departure_time
```

---

```text
route_segment
──────────────────
id

day_id

from_stop_id
to_stop_id

travel_mode

departure_time

status

created_at
updated_at
```

其中：

```text
travel_mode

WALK
DRIVE
TRANSIT
```

---

# Segment 甚至可以不提前创建

这里我建议进一步简化。

例如一天：

```text
A
B
C
D
```

Segment 可以直接推导：

```ts
segments = stops.slice(0, -1).map((stop, i) => ({
    from: stop,
    to: stops[i + 1]
}))
```

也就是说：

```text
A → B
B → C
C → D
```

天然来自 stop 顺序。

只有用户选择交通方式之后，再创建：

```text
route_segment
```

例如：

```text
A → B
WALK

B → C
TRANSIT
```

这可以显著减少数据库状态同步问题。

我更推荐这种方式。

---

# 拖拽排序后的逻辑也会非常简单

原：

```text
A → B → C → D
```

修改为：

```text
A → C → B → D
```

旧 Segment：

```text
A-B ❌
B-C ❌
C-D ❌
```

新 Segment：

```text
A-C
C-B
B-D
```

如果用：

```text
(from_stop_id, to_stop_id)
```

作为 Segment 的逻辑身份，就很好处理。

数据库可以设：

```sql
UNIQUE(day_id, from_stop_id, to_stop_id)
```

---

# Preview 页面

这是我认为你这个产品最有特色的一页。

例如 Turkey Trip：

```text
         Istanbul

     Day 1
       ●────●
          ╲
           ●

                    Day 2
                     ●────●

            Day 3
             ●─────────●
```

颜色：

```text
Day 1  Blue
Day 2  Red
Day 3  Green
Day 4  Orange
Day 5  Purple
...
```

关键一点：

颜色不要随机。

应该由：

```text
day_index
```

稳定映射。

例如：

```ts
DAY_COLORS = [
  "#4285F4",
  "#EA4335",
  "#34A853",
  "#FBBC04",
  "#9C27B0",
  "#00ACC1"
]
```

这样无论重新打开多少次：

```text
Day 3 永远是绿色
```

---

# Preview 也不要一次请求“一整天路线”

仍然请求：

```text
A → B
B → C
C → D
```

这是这个项目非常值得保留的设计。

因为现实旅行往往是：

```text
Hotel
   ↓ walk
Metro
   ↓ transit
Museum
   ↓ walk
Restaurant
   ↓ taxi
Hotel
```

而不是：

```text
一天 = 一种交通模式
```

---

# API 设计我也会修改一下

### Trip

```http
POST   /api/trips
GET    /api/trips
GET    /api/trips/{tripId}
PATCH  /api/trips/{tripId}
DELETE /api/trips/{tripId}
```

### Stop

```http
POST
/api/trips/{tripId}/days/{dayId}/stops

PATCH
/api/stops/{stopId}

DELETE
/api/stops/{stopId}

PUT
/api/trips/{tripId}/days/{dayId}/stops/order
```

### Route

我更建议：

```http
POST /api/routes/compute
```

请求：

```json
{
  "originPlaceId": "xxx",
  "destinationPlaceId": "yyy",
  "travelMode": "TRANSIT",
  "departureTime": "2026-08-08T10:00:00+03:00"
}
```

后端：

```text
Spring Boot
     ↓
Google Routes API
     ↓
返回 route DTO
```

前端不需要知道 Google Routes API key。

---

# Google API Key 建议分成两个

不要一个 Key 全部解决。

### Browser Key

只给：

```text
Maps JavaScript API
Places API
```

限制：

```text
HTTP referrer

localhost
yourdomain.com
```

例如：

```text
http://localhost:5173/*
https://travel.example.com/*
```

---

### Server Key

给 Spring Boot：

```text
Routes API
Places API (如果后端需要)
```

不要暴露前端。

Google 官方也明确推荐给 API Key 加 API 和应用限制。([Google for Developers][6])

---

# 一个我会删除的字段

原设计里：

```text
map_provider
coordinate_system
```

既然已经明确：

> Google Maps only

这两个字段第一版都可以删掉。

Google Maps 的位置体系直接按其 API 数据处理即可。

没必要为了一个可能永远不会发生的：

> 未来换地图

把整个架构做复杂。

但是代码层面可以保留：

```java
RouteService
PlaceService
```

而不是：

```java
GoogleRouteService
GooglePlaceService
```

这样未来真的想换 provider，再抽象实现。

**不要为了潜在需求提前做一整套 provider architecture。**

---

# 所以最终 MVP 开发顺序我建议锁死成这样

1. **项目骨架**
   React + Spring Boot + PostgreSQL + Docker

2. **Trip CRUD**
   创建计划 → 自动生成 Day

3. **Google Maps**
   地图加载 + Advanced Marker

4. **Places**
   搜索地点 → temporary marker → 添加 Stop

5. **Day Route**
   Stop 排序 → Marker 编号 → 相邻直线

6. **Routes**
   点击 Segment → Walk / Drive / Transit

7. **保存 route preference**
   保存交通方式，而不是把 Google 返回结果当成永久业务数据

8. **Preview**
   所有 Day 同时展示 + 不同颜色 + `Day N · 日期`

9. **交互完善**
   拖拽、删除、跨 Day、地图 fitBounds

10. **测试与部署**

这套下来以后，你的第一版其实已经是一个**真正可用的旅行路线规划产品**了，而不仅是地图 Demo。
