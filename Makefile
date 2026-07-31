.PHONY: help install dev build test lint typecheck format clean

help: ## 显示所有可用目标
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## 安装依赖
	pnpm install

dev: ## 启动所有 app 的开发模式
	pnpm dev

build: ## 构建所有包与 app
	pnpm build

test: ## 运行所有单测
	pnpm test

lint: ## 运行 ESLint
	pnpm lint

typecheck: ## 运行 TypeScript 类型检查
	pnpm typecheck

format: ## 用 Prettier 格式化
	pnpm format

clean: ## 清理构建产物与 node_modules
	@echo "清理构建产物..."
	@find . -name node_modules -type d -prune -exec rm -rf {} + 2>/dev/null || true
	@find . -name dist -type d -prune -exec rm -rf {} + 2>/dev/null || true
	@find . -name build -type d -prune -exec rm -rf {} + 2>/dev/null || true
	@find . -name coverage -type d -prune -exec rm -rf {} + 2>/dev/null || true
