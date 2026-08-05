/** 全局基础样式；Ant Design 组件主题保持官方默认值。 */
export const globalStyles = `
:root {
  --tdy-color-primary: #1677ff;
  --tdy-color-success: #52c41a;
  --tdy-color-error: #ff4d4f;
  --tdy-color-bg-layout: #f5f5f5;
  --tdy-color-bg-container: #ffffff;
  --tdy-color-header-bg: #001529;
  --tdy-color-text: rgba(0, 0, 0, 0.88);
  --tdy-color-text-secondary: rgba(0, 0, 0, 0.45);
  --tdy-color-border: #d9d9d9;
  --tdy-border-radius-container: 6px;
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
