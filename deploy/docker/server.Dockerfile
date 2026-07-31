# tiedaoyun server Dockerfile（多阶段）
# T2 阶段为骨架，T5 完成 NestJS 实现后填充实际构建步骤
# 当前 docker-compose.yml 使用 node:20-alpine 占位运行，此文件待 T5 后启用

# ====== Stage 1: builder ======
FROM node:20-alpine AS builder

WORKDIR /repo

# 启用 pnpm
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

# 先复制 workspace 配置与 lockfile，利用缓存
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/*/package.json packages/

# 安装依赖（含 devDependencies，用于构建）
RUN pnpm install --frozen-lockfile

# 复制源码
COPY . .

# 构建 server（T5 后启用）
# RUN pnpm -F @tiedaoyun/server build

# ====== Stage 2: runner ======
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# 安装 tini 作为 init，正确处理信号
RUN apk add --no-cache tini wget

# 复制构建产物与生产依赖（T5 后启用）
# COPY --from=builder /repo/apps/server/dist ./dist
# COPY --from=builder /repo/apps/server/node_modules ./node_modules
# COPY --from=builder /repo/apps/server/package.json ./package.json

EXPOSE 3000

# T2 占位：保持容器存活，T5 后替换为 node dist/main.js
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

# T5 后启用：CMD ["node", "dist/main.js"]
CMD ["node", "-e", "require('http').createServer((req,res)=>res.end('server placeholder')).listen(3000)"]
