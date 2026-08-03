/**
 * 应用入口（apps/web）。
 *
 * Provider 栈：BrowserRouter > QueryClientProvider > ConfigProvider(AntD) > App
 * - AntD 中文 locale
 * - React Query 默认不重试未授权类请求（占位配置）
 * - 注入全局 CSS 变量（--tdy-*）
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { themeConfig, globalStyles } from './theme';
import './i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// 注入全局样式（CSS 变量 + 基础 reset）
const styleEl = document.createElement('style');
styleEl.textContent = globalStyles;
document.head.appendChild(styleEl);

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root not found');
}

createRoot(container).render(
  <StrictMode>
    <ConfigProvider locale={zhCN} theme={themeConfig}>
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
);
