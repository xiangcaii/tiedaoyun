/**
 * 铁道云低代码平台 — 通用 UI 原子组件
 *
 * 提供与业务无关的基础组件，供 web / mobile / 设计器复用（HLD §4.3）。
 * 当前为骨架版本，后续按需补充组件并接入主题系统。
 */

import type { CSSProperties, ReactNode } from 'react';

/** 按钮视觉变体 */
export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

/** 按钮尺寸 */
export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps {
  /** 按钮内容 */
  children: ReactNode;
  /** 点击回调 */
  onClick?: () => void;
  /** 视觉变体，默认 default */
  variant?: ButtonVariant;
  /** 尺寸，默认 medium */
  size?: ButtonSize;
  /** 是否禁用 */
  disabled?: boolean;
  /** 透传类名 */
  className?: string;
  /** 透传行内样式 */
  style?: CSSProperties;
}

const sizeClassMap: Record<ButtonSize, string> = {
  small: 'tdy-btn--sm',
  medium: 'tdy-btn--md',
  large: 'tdy-btn--lg',
};

/** 基础按钮组件（无样式框架依赖，样式由消费方主题覆盖） */
export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'medium',
  disabled = false,
  className,
  style,
}: ButtonProps) {
  const classes = ['tdy-btn', `tdy-btn--${variant}`, sizeClassMap[size], className]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={classes} style={style} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
