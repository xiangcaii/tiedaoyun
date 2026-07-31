# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/spec/v2.0.0.html).

## [Unreleased]

### Added

- 初始化 monorepo 工程脚手架（T1）
  - pnpm workspace + 根 `package.json`，`packageManager` 锁定 pnpm 10
  - `tsconfig.base.json` + 根 `tsconfig.json`，统一严格模式
  - ESLint（含 `@typescript-eslint`）+ Prettier + `eslint-config-prettier`
  - Husky + lint-staged，`pre-commit` 钩子自动 eslint + prettier
  - `Makefile` 含 `dev / build / test / lint / typecheck / format / clean` 目标
  - `.gitignore`、`.env.example`、`.prettierignore`
  - `pnpm-workspace.yaml` 声明 `apps/*` 与 `packages/*`

### Notes

- 仓库目录结构遵循 HLD §3：`apps/{web,mobile,server}` + `packages/*` + `deploy/` + `scripts/`
- 具体子包与 app 骨架由 T2/T4/T5/T27 等后续任务补齐

- 搭建 Docker Compose 单机部署骨架（T2）
  - `deploy/docker-compose.yml` 编排 6 服务：postgres / redis / server / web / nginx / backup
  - `deploy/docker/nginx.conf`（入口网关：`/healthz` 200、`/api/` 反代 server、`/` 反代 web、速率限制）
  - `deploy/docker/web.conf` + `placeholder.html`（web 容器静态托管 + SPA fallback）
  - `deploy/docker/server.Dockerfile` + `web.Dockerfile`（多阶段骨架，T5/T27 后启用 build）
  - 根 `.env.example` 扩充 `POSTGRES_*` / `NGINX_PORT` 部署变量
  - 健康检查：postgres `pg_isready`、redis `redis-cli ping`、server/web/nginx `wget /healthz`
  - 数据卷：`pgdata` / `redisdata` / `backups`
  - T2 阶段 server/web/backup 用占位 image 跑通 `up -d`；T5/T26/T27 后切换为 build
  - 验收：`docker compose config` 通过；`up -d` 6 容器全 healthy；`curl localhost/healthz` 返回 200

- 搭建 CI / GitHub Actions（T3）
  - `.github/workflows/ci.yml`：PR / push 触发 4 个 job（lint / typecheck / test / build-image）
    - lint 跑 ESLint + Prettier 格式检查
    - typecheck 跑 `pnpm typecheck`
    - test 跑 `pnpm test`（vitest，T5/T27 后补测试文件）
    - build-image 用 `docker/build-push-action` 构建 server/web 镜像（不推送），含 GHA 缓存
    - apps 源码就绪前（T5/T27）build-image 自动跳过以保持 CI 全绿
    - 并发控制：同分支新推送取消旧运行
  - `.github/workflows/release.yml`：main 分支推送 / `v*` tag 触发
    - 构建并推送 server/web 镜像到 GHCR（`ghcr.io/<owner>/tiedaoyun-{server,web}`）
    - 镜像 tag：`latest`（main）/ 语义化版本（tag）/ commit sha 短码
    - 用 `GITHUB_TOKEN` 认证，`docker/metadata-action` 自动生成 tags 与 labels
    - apps 源码就绪前各 job 自动跳过
