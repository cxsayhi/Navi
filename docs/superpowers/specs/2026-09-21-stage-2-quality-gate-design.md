# Wanderline 阶段二：质量门禁与自动化验证设计

日期：2026-09-21

状态：待用户审阅

依据：`temp/go-live-readiness.md` 阶段 2

## 1. 背景

Wanderline 已具备 39 项后端测试、前端 lint/build、10 项 Playwright E2E、Docker Compose 构建与本地浏览器验收，但尚未形成可在干净环境重复执行的持续集成门禁。2026-09-21 的 `npm audit` 报告 21 个高危、4 个中危问题；项目也缺少自动依赖/镜像扫描、SBOM、性能基线和受控的真实 Google API 冒烟测试。

阶段二的目标是让每次合并和版本发布都能产生可追踪的测试、扫描与构建证据，并在高危问题或关键回归出现时阻止发布。

## 2. 目标与非目标

### 目标

- GitHub Actions 在 pull request、`main` 推送和版本标签上自动执行质量门禁。
- 后端测试、前端 lint/build、Compose 配置、三轮 E2E、性能基线和安全扫描全部可重复运行。
- npm、仓库文件系统和发布镜像的 `HIGH/CRITICAL` 漏洞清零。
- 生成 CycloneDX SBOM、测试报告和以 Git SHA 标识的构建产物。
- 使用专用测试密钥，手动完成一次真实 Maps JavaScript、Places 和 Routes 冒烟测试。
- 固定 Java、Maven、Node、npm、Docker 基础镜像和 GitHub Actions 版本。

### 非目标

- 不推送容器镜像到远程仓库，不部署 staging/production；这些属于阶段 6 和阶段 7。
- 不修改正式 PostgreSQL，不让自动 E2E 或性能测试调用真实 Google API。
- 不通过降低审计等级、忽略高危漏洞或 `npm audit fix --force` 制造绿色结果。
- 不在本阶段实现登录、限流或生产密钥管理。

## 3. 总体架构

采用两个职责分离的 GitHub Actions 工作流：

1. `.github/workflows/quality-gate.yml` 是自动门禁，处理确定性、无外部费用的验证。
2. `.github/workflows/google-smoke.yml` 是手动真实服务验证，只有拥有 GitHub Environment 权限的人员才能触发。

本地命令和 GitHub Actions 复用相同的 npm/Maven/Node 脚本。CI 不复制业务测试逻辑，只负责编排、权限、缓存、超时和附件保存。

## 4. 自动质量门禁

### 4.1 触发条件与权限

`quality-gate.yml` 在以下事件运行：

- 针对 `main` 的 pull request；
- 推送到 `main`；
- `v*` 版本标签。

工作流默认仅授予 `contents: read`。需要上传安全报告的任务单独获得最小的 `security-events: write`。同一分支的新运行会取消旧运行；每个任务配置明确超时。

### 4.2 `verify` 任务

- 使用 Temurin Java 21。
- 使用 Maven Wrapper 3.9.16 执行 `./mvnw -B test`。
- 使用 Node.js 22.22.1 与 npm 10.9.9 执行 `npm ci`。
- 执行前端 lint、TypeScript/Vite 生产构建。
- 执行 `docker compose config --quiet`。
- 保存后端 Surefire 与前端构建日志；失败时同样上传可诊断附件。

Maven 从已批准设计中的 3.9.9 调整为 3.9.16：Apache Maven 官方在实施时将 3.9.16 列为受维护的最新 3.9.x 版本；选择受维护补丁版本更符合本阶段的安全目标。

### 4.3 `e2e-stability` 任务

- 依赖 `verify` 成功。
- 使用现有 H2、Google Maps 前端替身和 Routes 后端替身。
- 通过 `playwright test --repeat-each=3` 连续运行全部 E2E，保持单 worker，避免测试数据互相污染。
- 任一轮失败即失败；上传 Playwright HTML 报告、trace 与失败截图。
- 不读取 `.env`，不使用正式 PostgreSQL，不消耗 Google 配额。

### 4.4 `performance` 任务

- 依赖 `verify` 成功。
- 启动与 E2E 相同的隔离后端，使用 H2 与 Google 路线替身。
- 运行无第三方依赖的 `scripts/performance-smoke.mjs`。
- 覆盖计划列表、计划详情、地点写入和路线计算。
- 默认并发与请求量保持小规模，避免 GitHub Runner 噪声成为主要变量。
- 输出 JSON 报告，包含请求量、成功率、吞吐量、平均耗时与 P95。

门禁阈值：

| 操作 | 非预期错误率 | P95 |
| --- | --- | --- |
| 计划列表 | 0 | ≤ 500ms |
| 计划详情 | 0 | ≤ 500ms |
| 地点写入 | 0 | ≤ 800ms |
| 路线计算 | 0 | ≤ 1500ms |

脚本通过环境变量接受并发、请求量、持续时间和 API 地址。默认模式用于 CI；增加持续时间即可执行手动 soak，不维护第二套压测程序。

### 4.5 `security` 任务

- `npm audit --audit-level=high` 阻断高危与严重漏洞。
- 使用 Trivy 扫描仓库文件系统、后端镜像和前端镜像。
- `HIGH/CRITICAL` 结果导致任务失败。
- 输出 SARIF 供 GitHub Security 展示，并生成 CycloneDX SBOM。
- SBOM、SARIF 和人类可读报告均上传为构建附件。

前端依赖优先升级直接依赖和锁文件。仅当直接依赖尚未放宽安全版本范围时，使用最小 `overrides` 固定已修复的传递依赖，并在 `package.json` 中保留明确、可删除的覆盖项。不得使用强制降级或全局忽略规则。

### 4.6 `release-artifacts` 任务

该任务等待 `verify`、`e2e-stability`、`performance` 和 `security` 全部成功：

- 打包后端可执行 JAR；
- 打包前端 `dist`；
- 附带前后端与镜像 SBOM；
- 生成 SHA-256 校验和；
- artifact 名称包含完整 Git 提交 SHA。

本任务只上传 GitHub Actions artifacts，不推送镜像、不创建 GitHub Release、不部署。

## 5. 真实 Google 冒烟工作流

`.github/workflows/google-smoke.yml` 仅支持 `workflow_dispatch`，并绑定受保护的 `google-smoke` Environment。

必需 Secrets：

- `GOOGLE_MAPS_BROWSER_API_KEY`
- `GOOGLE_MAPS_SERVER_API_KEY`
- `GOOGLE_MAPS_MAP_ID`

工作流启动时先验证三个 Secret 非空；缺失时立即失败。测试启动独立前后端，执行专用 Playwright 用例：

1. Maps JavaScript 成功加载并渲染地图；
2. Places 搜索一个固定、稳定的公共地点并取得 Place ID；
3. Routes 对固定起终点计算一次路线并返回至少一个方案。

工作流设置单实例并发锁、短超时和最小重试，不自动按计划运行。专用测试密钥只允许对应 API，并在 Google Cloud 设置低每日配额和预算告警。GitHub 托管 Runner 没有固定出口 IP；如果服务端测试密钥必须限制 IP，该任务改用带固定出口的 self-hosted Runner。

测试失败附件不得打印密钥，不保存包含密钥的完整请求 URL。普通 `npm run test:e2e` 不发现也不运行真实 Google 用例；专用命令显式选择该项目/文件。

## 6. 工具链与供应链固定

- `.nvmrc` 固定 Node.js 22.22.1。
- `package.json` 的 `engines` 固定 Node 22.22.1，`packageManager` 固定 npm 10.9.9。
- Maven Wrapper 固定 3.9.16；Java 编译目标保持 21。
- Dockerfile 和 Compose 的基础镜像使用明确版本加 digest，而不是浮动标签。
- GitHub Actions 使用完整 commit SHA，并在注释中记录对应发布标签。
- Dependabot 每周检查 npm、Maven、Docker 和 GitHub Actions，单生态限制同时打开的更新数量，避免更新风暴。

所有版本只在验证通过后更新；Dependabot PR 仍必须经过同一质量门禁。

## 7. 测试策略

性能脚本采用 Node 内置测试框架进行 TDD，至少验证：

- P95 计算使用排序后的真实样本；
- 非 2xx、超时与响应结构错误计入失败；
- 任一阈值超限时进程退出码非零；
- 并发限制不会超过配置值。

真实 Google 冒烟保持独立，不通过 mock 断言真实服务。现有 E2E 继续测试业务流程与异常分支，不因真实冒烟而降低确定性。

## 8. 错误处理与可诊断性

- 所有网络等待都有截止时间。
- 后台服务使用健康检查，启动失败时输出日志并清理进程。
- 性能脚本遇到超时、非 2xx、无效 JSON、业务 `success: false` 或阈值超限时明确失败。
- 安全扫描失败仍上传报告。
- GitHub Actions artifact 设置有限保留期，避免长期堆积。
- Secrets 只注入需要的步骤，不作为全局环境变量。

## 9. 验收标准

阶段二只有在以下证据全部存在时才标记完成：

- 干净检出可以执行自动质量门禁。
- 后端测试、前端 lint/build 与 Compose 配置通过。
- 完整 E2E 连续三轮通过。
- 基础并发性能门禁通过并生成 JSON 报告。
- npm、仓库与两个发布镜像的 `HIGH/CRITICAL` 漏洞为零。
- CycloneDX SBOM 成功生成并可下载。
- 真实 Google 冒烟实际运行一次并留下成功记录。
- 构建产物包含 Git SHA、SHA-256 校验和和固定工具链信息。
- README、`TEST_ACCEPTANCE.md` 与 `temp/go-live-readiness.md` 更新为实际结果，不把未运行的检查标记为完成。

## 10. 风险与边界

- GitHub Hosted Runner 的性能数据只能作为回归门禁，不等同于生产容量结论。
- 真实 Google 测试受配额、网络和地点数据变化影响；它是受控冒烟，不替代业务 E2E。
- 容器基础镜像可能在锁定后出现新 CVE；Dependabot 与每次扫描负责重新暴露风险。
- 阶段二不解决身份、数据隔离、生产备份、部署和监控，因此阶段二完成不代表整个产品可以公开上线。
