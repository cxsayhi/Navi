# Rectify 实施与核对记录

依据：`temp/rectify.md`。目标：数据库保存用户旅行意图，Google 地点与路线详情按需实时获取。

## 接口约定

- 保留现有表名与原接口兼容路径，新增文档的 `/api/trips`、`/api/stops/{id}`、`/api/routes/compute` 路径。
- Trip 增加 `timezone`（IANA，旧记录默认 UTC，界面可编辑）。
- Stop 持久化字段为 `googlePlaceId`, `customName`, `note`, `arrivalTime`, `departureTime`, `position`。时间是当地 `HH:mm`。不持久化名称、地址和坐标；前端通过 Place.fetchFields 实时补全。
- Route compute 请求为 `{originPlaceId,destinationPlaceId,travelMode,departureTime}`，departureTime 为带偏移的 ISO 时间。返回现有 NavigationRouteOptions 形状。
- 保存 segment 请求为 `{dailyRouteId,originPointId,destinationPointId,travelMode,departureTime}`；响应保留标识、交通方式、departureTime、status、savedAt，不包含 selectedRoute。
- 时间顺序：segment 时间 > 出发 stop departureTime > 当天 09:00，按 Trip timezone 转成时间点。超过过去 7 天窗口的公交时间按整周顺延并标记为参考班次，远期超窗仍明确报错。
- 排序和删除只使不再相邻的 segment 失效，保留仍然相邻的交通偏好。

## 工作项

- [x] 后端：新迁移去掉 Google 内容字段、添加用户编辑字段及 timezone；路由与校验；实时 Routes；相邻 segment 失效；更新测试。
- [x] 前端：PlaceAutocompleteElement、实时 Place 详情、AdvancedMarkerElement；交通偏好与实时逐段预览；时间/时区及 stop 编辑；dnd-kit、TanStack Query、Zustand、Tailwind。
- [x] 部署配置：Java 21 构建/运行；环境配置兼容；文档更新。
- [x] 验证：36 项后端测试、前端 build/lint、8 项浏览器端到端测试与 PostgreSQL V4→V5 迁移演练。

## 实施决策

- 原业务 ID、计划、每日路线、Place ID、排序、交通方式必须保留。迁移只移除文档要求不再持久化的 Google 内容；部署前备份现有数据库。
- 表名无需按示意图重命名；名称差异不影响架构。现有 API 可以作为兼容别名。
- 颜色使用日序号稳定调色板；未来自行车/摩托车与完整 timeline 不在 MVP 范围。
- 默认 UTC 不推测旧计划所在地时区，用户可在计划编辑中选择实际时区。
- 2026-09-19 后续调整：交通方式和路段时间仅在当前页面实时使用，不再从编辑器保存；旧接口与数据表只为兼容历史数据保留。
- 历史日期驾车请求省略过去的出发时间，并以 `TRAFFIC_UNAWARE` 计算；过期公交计划使用未来相同星期和时间的参考班次以遵守 Google 的时间窗口。
