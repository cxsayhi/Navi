# Wanderline / 行迹

Wanderline 是一个基于 Google Maps 的多日旅游路线规划网站。架构依据 `temp/rectify.md`：计划 → 每日行程 → 地点引用 → 相邻路段交通偏好。数据库保存用户旅行意图，Google 地点详情与路线结果在使用时获取。

## 当前能力

- React 19 + TypeScript + Vite 前端工作台
- Spring Boot 4 + Java 21 REST API
- Tailwind CSS、dnd-kit、TanStack Query 和 Zustand
- 统一成功/错误响应和请求 ID
- PostgreSQL + Flyway 数据库迁移
- 旅游计划创建、查询、编辑与删除
- 创建计划时按日期范围自动生成每日路线，并支持后续补齐、逐日编辑与删除
- Google Maps JavaScript API 动态加载与无密钥配置状态
- Places API (New) 的 PlaceAutocompleteElement、Place.fetchFields 与 AdvancedMarkerElement
- 地点引用按日持久化、支持同一天再次到访同一地点、每天最多 30 个地点
- 拖拽或箭头调整 Pin 顺序，并按当前顺序在地图上连线
- 相邻 Pin 路线段具备加宽命中区域、独立点击、选中与高亮
- 后端代理 Google Routes API，服务端密钥不会进入浏览器构建产物
- 步行、实时交通驾车与公共交通方案按需计算
- 展示 Google 默认路线及实际可用的备选路线，可在地图上逐一切换比较
- 每个相邻 Pin 段在当前编辑会话中选择交通方式与可选出发时间，并实时计算路线
- 不永久保存 Google 名称、地址、坐标或路线折线；不使用服务端 Google 内容缓存
- 真实道路折线、距离、时间、分步指引与公交线路/站点信息
- 一键在 Google Maps 中继续当前路线导航
- 一键切换“按日编辑”和“全部路线预览”模式
- 多日路线叠加预览，每一天沿用自己的路线颜色
- 每日首个 Pin 展示 Day 编号与日期票签，可点击聚焦当天路线
- 路线交通方式与路段时间只用于当前编辑会话，不再提供交通偏好保存入口
- 总览对旧数据中已有的路线意图重新请求路线；其他路段使用明确标注的顺序连线
- 地点搜索无结果时显示明确空状态，不与搜索失败混淆
- 当天无地点与只有一个 Pin 时，地图和路线面板给出对应引导
- 两点间无公交方案时可快速切换步行或驾车，不影响其他交通方式
- 地图请求超时、额度耗尽与服务异常分类展示，并提供重试操作
- Pin 重排后只删除不再相邻的路段偏好，保留仍然相邻的路段
- 历史日期的驾车路线自动使用不含实时交通的计算，避免向 Google 提交过去的出发时间
- 地点到达、离开及路段出发时间统一使用小时/分钟滚动菜单
- 日期范围、重复日期与最多 60 天的服务端校验
- 响应式旅行档案工作台及完整空状态、错误状态和删除确认
- Google Maps 前端、后端密钥配置入口
- 后端 H2 集成测试覆盖三日计划、地点排序、路线时间与按日失效边界
- Playwright 端到端测试覆盖 3 天 6 个 Pin、备选交通方案、刷新恢复与多日总览
- 端到端测试使用隔离的内存数据库和确定性 Google Maps 测试替身，不消耗真实 API 配额
- Docker Compose 本地完整运行环境

## 目录结构

```text
.
├── frontend/          React 前端
├── backend/           Spring Boot API
├── docker-compose.yml 本地容器编排
└── .env.example       环境变量模板
```

## 环境要求

- Node.js 22.22.1（见 `.nvmrc`）
- npm 10.9.9（见 `package.json` 的 `packageManager`）
- Java 21
- Maven Wrapper 3.9.16（无需全局安装 Maven）
- Docker Desktop（用于 PostgreSQL 或完整容器运行）

## 本地开发

### 1. 准备配置

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
```

没有密钥时网站仍可运行，但地图编辑区会显示配置指引。要使用真实地图和地点搜索，请手动完成下面的 Google Cloud 配置。

1. 创建或选择 Google Cloud 项目，并为项目启用结算账号。
2. 在 API Library 启用 `Maps JavaScript API`、`Places API (New)` 和 `Routes API`。
3. 创建浏览器 API key，Application restrictions 选择 `Websites`，至少添加：
   - `http://localhost:5173/*`
   - `http://127.0.0.1:5173/*`
   - `http://localhost:4173/*`
   - `http://127.0.0.1:4173/*`
   - 上线后自己的生产域名
4. API restrictions 选择 `Restrict key`，只允许 `Maps JavaScript API` 与 `Places API (New)`。
5. 另建一个仅供后端使用的 API key，API restrictions 只允许 `Routes API`。生产环境应增加服务器公网 IP restriction；本地开发密钥不要提交到版本库，并建议设置较小的每日配额。
6. 本地 Vite 开发把浏览器密钥写入 `frontend/.env.local`：

```dotenv
VITE_GOOGLE_MAPS_API_KEY=你的浏览器密钥
VITE_GOOGLE_MAPS_MAP_ID=你的JavaScript地图ID
```

后端会在本地开发时自动读取项目根目录 `.env`。也可以在当前终端设置服务端环境变量；系统环境变量的优先级更高：

```bash
export GOOGLE_MAPS_SERVER_API_KEY=你的Routes服务端密钥
```

使用 Docker Compose 时同样写入根目录 `.env`：

```dotenv
GOOGLE_MAPS_SERVER_API_KEY=你的Routes服务端密钥
VITE_GOOGLE_MAPS_API_KEY=你的浏览器密钥
VITE_GOOGLE_MAPS_MAP_ID=
```

可以在根目录 `.env` 调整 Routes 请求超时：

```dotenv
WANDERLINE_MAP_REQUEST_TIMEOUT=PT12S
```

`VITE_GOOGLE_MAPS_MAP_ID` 本地可留空，应用使用 `DEMO_MAP_ID` 加载 Advanced Marker。生产环境应在 Google Maps Platform 的 Map Management 中创建自己的 JavaScript Map ID。修改环境变量后需要重启 Vite，Docker 模式需要重新构建 frontend 镜像。

密钥用途：

- `VITE_GOOGLE_MAPS_API_KEY`：浏览器地图与 Places 搜索使用；它会进入浏览器构建产物，必须用网站来源和 API restrictions 保护。
- `VITE_GOOGLE_MAPS_MAP_ID`：Advanced Marker 使用；本地可用 DEMO_MAP_ID，生产应配置自己的 ID。
- `GOOGLE_MAPS_SERVER_API_KEY`：后端 Routes 请求使用，必须与浏览器密钥分开，也不应进入前端构建产物。
- `WANDERLINE_MAP_REQUEST_TIMEOUT`：后端调用 Routes API 的连接与读取超时，使用 ISO-8601 Duration，默认 `PT12S`。

本阶段不需要 Google OAuth 登录。计划保存 IANA 时区，路线时间优先使用路段出发时间，其次为出发地点预计离开时间，最后为当天 09:00。旧计划默认 UTC，请在编辑计划时改为目的地时区（例如 Europe/Istanbul）。超过 Google 过去 7 天窗口的公交计划按整周顺延到未来 7 天内相同星期和时间，并明确标记为参考班次；超过未来 100 天的计划仍提示不可用。

### 2. 启动 PostgreSQL

```bash
docker compose up -d database
```

### 3. 启动后端

```bash
cd backend
./mvnw spring-boot:run
```

后端地址：`http://localhost:8080`

- 基础状态：`GET http://localhost:8080/api/system/info`
- 健康检查：`GET http://localhost:8080/actuator/health`
- 旅游计划：`GET/POST http://localhost:8080/api/trip-plans`
- 计划详情：`GET/PUT/DELETE http://localhost:8080/api/trip-plans/{planId}`
- 每日路线：`POST http://localhost:8080/api/trip-plans/{planId}/daily-routes`
- 添加地点：`POST http://localhost:8080/api/trip-plans/{planId}/daily-routes/{dailyRouteId}/route-points`
- 地点重排：`PUT http://localhost:8080/api/trip-plans/{planId}/daily-routes/{dailyRouteId}/route-points/reorder`
- 移除地点：`DELETE http://localhost:8080/api/trip-plans/{planId}/daily-routes/{dailyRouteId}/route-points/{routePointId}`
- 计算路线段：`POST http://localhost:8080/api/navigation/routes`
- 计算候选路线：`POST http://localhost:8080/api/navigation/route-options`
- 旧版交通偏好查询接口仅为已有数据与兼容性保留；当前前端不再保存交通偏好

### 4. 启动前端

```bash
cd frontend
npm ci
npm run dev
```

前端地址：`http://localhost:5173`

Vite 会把本地 `/api` 请求代理到 `http://localhost:8080`。

## 使用 Docker 运行完整环境

```bash
docker compose up --build
```

前端默认地址：`http://localhost:4173`

## 验证命令

```bash
cd backend && ./mvnw -B test
cd ../frontend && npm ci && npm audit --audit-level=high
npm run lint && npm run build && npm run test:e2e:stability
cd ..
node --test scripts/performance-smoke.test.mjs scripts/require-env.test.mjs
scripts/run-performance-smoke.sh
docker compose config --quiet
docker compose build backend frontend
```

`npm run test:e2e:stability` 会把 10 个端到端场景连续执行 3 轮。测试自动启动使用 H2 内存数据库的后端、确定性的 Google Routes 测试替身和 Vite 前端，结束后自动停止，不会读写本地 PostgreSQL，也不会消耗 Google 配额。测试需要 Java 21 和本机 Google Chrome；请确保 `8082` 和 `5174` 端口未被占用。

`scripts/run-performance-smoke.sh` 会在隔离的 `8083` 端口运行计划列表、详情、地点写入和路线计算的基础性能冒烟，报告写入 `artifacts/performance/report.json`。该目录是本地产物，不提交版本库。

GitHub Actions 的 `quality-gate.yml` 在推送和拉取请求上执行构建、测试、Trivy 扫描、CycloneDX SBOM 和发布产物打包；`google-smoke.yml` 是使用受保护环境与专用密钥的手动真实 Google 冒烟。真实 Google 冒烟不属于普通本地验证，必须使用测试项目的受限密钥运行。

完整的覆盖矩阵、验收结论与已知边界见 [`TEST_ACCEPTANCE.md`](./TEST_ACCEPTANCE.md)。

## API 响应格式

成功响应：

```json
{
  "success": true,
  "data": {},
  "error": null,
  "timestamp": "2026-07-19T00:00:00Z",
  "requestId": "request-id"
}
```

失败响应：

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "请求参数校验失败",
    "details": {}
  },
  "timestamp": "2026-07-19T00:00:00Z",
  "requestId": "request-id"
}
```
