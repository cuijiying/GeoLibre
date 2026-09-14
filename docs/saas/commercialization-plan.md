# GeoLibre SaaS 商业化方案（内部文档）

> 状态：v1 草案（2026-09-14）｜ 基于上游 v3.0.0（commit 990ffaf0）｜ 分支：`saas-mvp`
> 密级：内部。对外材料（官网文案、定价页）需从此文档派生并移除内部判断与成本信息。

## 1. 定位与目标市场

- **产品形态**：面向国内市场的公有云 GIS SaaS —— 浏览器内的云原生 GIS 工作台（数据可视化、空间分析、协同制图、项目分享）。
- **上游资产**：GeoLibre（MIT，opengeos/GeoLibre），已具备 Web/桌面/移动端、1000+ 浏览器端 WASM 空间分析工具、项目分享服务器、协同编辑、插件体系。
- **许可证结论**：MIT 允许商业化 SaaS，无 copyleft 义务；需在分发副本中保留版权声明。商标 "GeoLibre" 归上游作者，**商业化产品必须使用自有品牌名**（`GEOLIBRE_BRAND_NAME`），避免商标风险。
- **差异化**：私有化/国产化交付能力 + 浏览器端免安装分析 + 按租户隔离的团队空间（对标：SuperMap Online、易智瑞 GeoScene Online）。

## 2. 技术架构（MVP → 目标态）

```
浏览器 (geolibre-web, nginx 静态 + PWA)
   │  ├─ NativeGate 登录门（自建账号，VITE_GEOLIBRE_NATIVE_AUTH_URL）
   │  ├─ 品牌配置（VITE_GEOLIBRE_BRAND_NAME）
   │  └─ 分享/协同客户端（Bearer token 复用登录态）
   ▼
geolibre-server-api (FastAPI + SQLAlchemy)
   ├─ accounts(plan) / tokens(expires_at) / projects / versions
   ├─ 限流（429/Retry-After）、token 过期、套餐配额
   ▼
PostgreSQL 17（元数据） + 对象存储（本地卷 → S3/OSS 兼容）
geolibre-collab (WebSocket 协同中继, SQLite 快照)
```

**MVP 已实现（本次提交）**：
- 后端：token 过期（`GEOLIBRE_TOKEN_TTL_DAYS`）、认证路由限流（429+Retry-After）、套餐字段与项目配额（free/pro）、存量库列级迁移、`/api/account` 返回用量
- 前端：`native` 登录门（注册/登录/退出、套餐与用量展示、token 持久化）、品牌名配置
- 部署：entrypoint 校验 + 互斥（Clerk/Auth0/Native 三选一）、docker-compose 环境变量

**目标态待建（按优先级）**：
1. **组织/团队多租户**：当前账号=租户；需 Organization + Membership（owner/admin/member）+ 项目归属 org。这是 B 端售卖的前提。
2. **计费与支付**：微信支付/支付宝（国内）→ 订单/订阅表 → 支付回调写 `accounts.plan`；建议先做"人工开通 + 后台改 plan"，跑通付费闭环再接自动续费。
3. **管理后台**：用户/组织/用量/订单管理（可先用 Retool/低代码顶着）。
4. **配额扩展**：存储容量、协同房间数、AI 调用次数（ai-proxy 已支持实例 token，可按租户下发）。
5. **合规**：ICP 备案、等保二级、个人信息保护（注册即收集用户名/密码 → 隐私政策 + 密码 scrypt 已有）、地图审图合规（国内公网地图服务需用合规底图，OSM 等需替换为天地图/高德并做审图号标注）。

## 3. 商业化模型建议

| 套餐 | 定价建议 | 配额 | 目标客群 |
|---|---|---|---|
| 免费版 | ¥0 | 20 项目、公开分享、社区支持 | 个人/学生，获客漏斗 |
| 专业版 | ¥99/月 或 ¥990/年 | 500 项目、私密分享、协同编辑、优先支持 | 独立 GIS 从业者/小团队 |
| 团队版 | ¥499/月起（5 席） | 组织空间、权限管理、SSO、审计日志 | 企业/设计院 |
| 私有化 | 面议（年费 License） | 全量功能 + 离线部署 + 定制 | 政企/涉密单位 |

> 定价为内部假设，上线前需做竞品对标与 10 个潜在客户访谈验证。

## 4. 里程碑计划

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| M1 SaaS MVP（当前） | 账号体系 + 登录门 + 配额 + docker-compose 一键部署 | 新机器 `docker compose up` 后可注册/登录/建项目/超配额被拒 |
| M2 付费闭环 | 后台改 plan + 定价页 + 购买咨询入口 | 1 个真实付费用户走完人工开通流程 |
| M3 团队多租户 | Organization/Membership/角色权限 | 团队版可售：邀请成员、共享项目空间 |
| M4 在线支付 | 微信/支付宝原生支付 + 自动开通续费 | 支付成功率 ≥95%，自动对账 |
| M5 合规上线 | ICP 备案、隐私政策、合规底图替换 | 域名可正常访问，法务评审通过 |
| M6 私有化交付包 | K8s Helm Chart + License 校验 + 离线安装文档 | 首个私有化 POC 交付 |

## 5. 风险清单

| 风险 | 等级 | 缓解 |
|---|---|---|
| 上游快速迭代导致 fork 冲突 | 中 | main 保持只同步上游；SaaS 改动集中在新增文件/独立模块（本次改动 90% 为新增），每月 rebase 一次 |
| 国内地图合规（审图号/底图） | 高 | M5 前替换默认底图为天地图/高德；禁用不合规境外底图预设；必要时咨询测绘资质合作方 |
| 商标风险（GeoLibre 名称） | 中 | 产品用自有品牌；代码保留 MIT 声明；README 注明 "based on GeoLibre (MIT)" |
| 单进程限流/单机 SQLite 协同 | 低 | 文档已注明多副本需代理层限流；协同可换 collab-node + 外置存储 |
| 支付资质（个体工商户/公司主体） | 中 | 先人工收款闭环，主体资质并行办理 |

## 6. 与上游的同步策略

- `main`：仅 fast-forward 上游，永不提交自有代码。
- `saas-mvp`：商业化开发主线；定期 `git merge upstream/main`，冲突集中在 docker-compose/entrypoint/README 三处，可控。
- 改动原则：**新增文件优先，修改原文件最小化**；通用修复（如 bug fix）反哺上游 PR，减少分叉。
