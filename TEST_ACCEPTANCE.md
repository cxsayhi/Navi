# Rectify 架构对齐验收

验收日期：2026-09-20。需求来源：`temp/rectify.md` 与 `temp/go-live-readiness.md`。

## 设计核对

| 项目 | 原实现 | 调整后 |
| --- | --- | --- |
| Java | 17 | Maven 与 Docker 均使用 21 |
| UI/交互 | 自定义 CSS、原生拖拽、局部状态 | 保留视觉样式，接入 Tailwind、dnd-kit、TanStack Query、Zustand |
| 地点 | 永久保存名称、地址、坐标 | 只保存 Place ID 和用户名称/备注/到达/离开时间；显示时 Place.fetchFields |
| 搜索/Marker | 自定义 AutocompleteSuggestion、普通 Marker 回退 | PlaceAutocompleteElement 与 AdvancedMarkerElement，本地 DEMO_MAP_ID |
| 导航 | 持久化 Google 完整路线与折线，服务端缓存 | 当前编辑器不保存交通偏好；编辑和预览逐段实时计算，旧偏好接口仅保留兼容 |
| 计划时间 | 无目的地时区，公交按现在 | IANA 时区与滚动式时分选择；过去的驾车计划忽略历史出发时间并使用 `TRAFFIC_UNAWARE` |
| 排序/删除 | 整天导航清空 | 仅使不再相邻的地点对失效 |
| 地点编辑 | 无直接跨日移动 | 自定义名称/备注/时间编辑、跨日移动保留地点 ID |
| 再次到访 | 同日 Place ID 唯一 | 可重复到访相同地点，不同 Stop ID |
| 接口 | trip-plans/navigation | 新增文档 trips/stops/routes 路径，旧接口保留兼容别名 |
| 数据库 | V1–V4 | V5 保留业务 ID，移除 Google 内容字段 |
| 预览 | 复用持久化折线 | 逐段实时获取，失败时提示并使用顺序连线 |
| 安全边界 | 两个独立 Google 密钥 | 保留，服务器密钥不进入前端 |

表名继续使用 trip_plans / daily_routes / route_points / navigation_selections；不为示意图名称执行无功能收益的重命名。自行车、摩托车和完整 timeline 属于文档明确的后续范围。

## 验证与隔离

- 后端 Java 21：41 项测试通过，包括部分 PATCH、时区、DST、时间优先级、地点跨日移动、重复到访、过去驾车时间的无交通感知回退、过期公交计划的同星期参考班次映射，以及确定性 Routes 测试网关契约。
- PostgreSQL 17：在独立数据库 wanderline_rectify_check 中从真实 V4 备份恢复，Flyway V5 升级通过。
- `node scripts/check-rectify-migration.mjs`：实际 PostgreSQL 排序、跨日 ID 保留、重复到访、用户字段及选择性路段失效通过。脚本仅指向 8083 迁移检查服务。
- 前端：生产构建与 ESLint 检查通过。
- Chrome E2E：10 项全部通过；覆盖正式版品牌与法律入口、桌面/移动端旅程菜单折叠、移动布局、三日计划、地点搜索、键盘拖拽、排序失败、三种交通方式、滚动式时分选择、当前编辑器不保存交通偏好、服务异常、时区/地点时间及跨日移动。
- Safari 人工验收：正式品牌、`READY TO GO`、1.0.0、帮助弹窗与反馈入口正常；Escape 关闭弹窗后焦点返回触发按钮。
- E2E 使用 8082/5174 与 H2；Google SDK 与 Routes 使用测试替身，不读写用户 PostgreSQL，也不消耗真实 Google 配额。
- Docker 后端构建执行 `mvn package`（包含测试），前端构建运行 TypeScript 与 Vite。
- 实际 Docker 部署完成：后端与 PostgreSQL 健康，前端运行；正式数据库 V1–V5 均成功，1 个计划、13 天和当前 3 个地点保留。
- Safari 刷新验证：真实 Google 地图、原有两个地点的名称/地址和标记成功加载，新版原生地点搜索与编辑区已显示。
- 实机发现日期栏继承旧横向 Grid；改为纵向滚动列表，并加入日期卡片纵向位置回归断言（修复前失败）。
- 过去日期 2026-08-05 12:30 的真实驾车请求返回 HTTP 200 和 2 个候选；Safari 显示实时驾车方案、滚动式小时/分钟菜单，且不再显示交通偏好保存入口。

## 复验

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

Java 命令需要 JDK 21。当前电脑原有 JDK 是 17；本次测试使用 /tmp/wanderline-jdk21/Contents/Home 的临时 JDK 21。Docker 用户不需要安装宿主机 JDK。

## 数据与 Google 服务边界

升级前备份：/tmp/wanderline-before-rectify-20260919.dump。Google 名称/地址/坐标和旧路线结果字段会在 V5 删除；计划、日期、Place ID、排序及交通偏好保留。旧计划时区默认 UTC，请编辑为实际目的地时区。

公交支持窗口、交通信息与地点可用性由 Google 决定；超过过去 7 天的计划使用未来 7 天内相同星期和时间的参考班次并明确提示，超过未来 100 天仍会报错。实时 Google 计费/配额与所有国家的公交覆盖不属于 mock 测试的验证范围。

官方依据：[Routes 数据政策](https://developers.google.com/maps/documentation/routes/policies)、[Places 数据政策](https://developers.google.com/maps/documentation/places/web-service/policies)、[新地点自动补全](https://developers.google.com/maps/documentation/javascript/place-autocomplete-new)。

## 阶段二：本地质量门槛验收（2026-09-21）

| 验收项 | 本地结果 |
| --- | --- |
| 固定工具链 | Node 22.22.1、npm 10.9.9、Java 21、Maven Wrapper 3.9.16 |
| 后端 | 41 项测试通过，0 失败 |
| 前端 | `npm ci`、ESLint、TypeScript/Vite 生产构建通过；`npm audit --audit-level=high` 为 0 漏洞 |
| E2E 稳定性 | 10 个场景连续 3 轮，共 30/30 通过 |
| 质量脚本 | 8/8 Node 测试通过 |
| 计划列表 | 24/24 成功，P95 30.22 ms |
| 计划详情 | 24/24 成功，P95 3.26 ms |
| 地点写入 | 8/8 成功，P95 12.65 ms |
| 路线计算 | 8/8 成功，P95 12.30 ms |
| 容器 | Compose 配置通过；后端和前端镜像构建成功 |

发布基础镜像已固定到以下不可变引用：

- `maven:3.9.16-eclipse-temurin-21@sha256:c2a2c58516d160f43b50f12baa427ca86989e0bc942609e04aff61da5d9a7d74`
- `eclipse-temurin:21.0.12_8-jre-jammy@sha256:61d6c7b34d36aee3f45d043101259f97f3c6d428dc2a6f75513789983c5e254f`
- `node:22.22.1-alpine3.22@sha256:9f96f09f127f06feaff1e7faa4a34a3020cf5c1138c988782e59959641facabe`
- `nginx:1.28.3-alpine3.23@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236`
- `postgres:17.11-alpine3.24@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`

GitHub Actions 自动质量门槛与受保护的真实 Google 冒烟工作流已经在本地定义并通过 YAML、动作固定和密钥边界静态检查。远程 Actions、Trivy 容器扫描、CycloneDX SBOM、发布产物以及真实 Google 冒烟尚未执行，不能把本地验收解释为这些项目已经通过。

**阶段二结论**：本地质量门槛通过；待分支推送后取得 GitHub Actions 成功运行链接、提交哈希、扫描/SBOM/发布产物和受保护 Google 冒烟证据，才能将阶段二标记为全部完成。
