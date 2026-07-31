# tiedaoyun web Dockerfile（多阶段：Vite build → nginx serve）
# T2 阶段为骨架，T27 完成 apps/web 后填充实际构建步骤
# 当前 docker-compose.yml 使用 nginx:alpine + 占位 html 运行，此文件待 T27 后启用

# ====== Stage 1: builder ======
FROM node:20-alpine AS builder

WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/*/package.json packages/

RUN pnpm install --frozen-lockfile

COPY . .

# 构建 web（T27 后启用）
# RUN pnpm -F @tiedaoyun/web build

# ====== Stage 2: runner ======
FROM nginx:1.25-alpine AS runner

# 安装 wget 用于健康检查
RUN apk add --no-cache wget

# 复制 web 容器 nginx 配置
COPY deploy/docker/web.conf /etc/nginx/conf.d/default.conf

# 复制构建产物（T27 后启用）
# COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html

# T2 占位首页
COPY deploy/docker/placeholder.html /usr/share/nginx/html/index.html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost/__healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
