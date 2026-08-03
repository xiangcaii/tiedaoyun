/**
 * AntD 主题 token（apps/web AGENTS.md「UI 规范」）。
 *
 * - 自定义样式优先用 CSS 变量 `--tdy-*`；MVP 仅定义品牌色与基础圆角。
 * - 不引入自定义字体，使用系统字体栈。
 */
import type { ThemeConfig } from 'antd';

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 6,
  },
};

/** 全局 CSS 变量（注入到 :root） */
export const globalStyles = `
:root {
  --tdy-color-primary: #1677ff;
  --tdy-min-width: 1280px;
  --tdy-spacing-unit: 8px;
}
html, body, #root {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue',
    Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}
#root {
  min-width: var(--tdy-min-width);
}
`;
