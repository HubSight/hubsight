import React, { forwardRef } from 'react';
import '@fortawesome/fontawesome-svg-core/styles.css';
import { config, type IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// Prevent Font Awesome from automatically injecting CSS since we imported styles.css directly
config.autoAddCss = false;

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  color?: string;
  style?: React.CSSProperties;
  spin?: boolean;
  strokeWidth?: number | string;
}

export function createFaIcon(icon: IconDefinition, defaultClassName = '') {
  const Component = forwardRef<SVGSVGElement, IconProps>(
    (
      {
        size,
        className = '',
        color,
        style,
        spin,
        strokeWidth: _strokeWidth,
        ...props
      },
      ref,
    ) => {
      const hasSizeInClass = className && /\b(w-|h-|size-)/.test(className);
      const effectiveSize = size ?? (hasSizeInClass ? undefined : 20);

      const computedStyle: React.CSSProperties = {
        ...(typeof effectiveSize === 'number'
          ? { width: `${effectiveSize}px`, height: `${effectiveSize}px` }
          : effectiveSize
          ? { width: effectiveSize, height: effectiveSize }
          : {}),
        ...(color ? { color } : {}),
        display: 'inline-block',
        verticalAlign: 'middle',
        ...style,
      };

      return (
        <FontAwesomeIcon
          ref={ref as any}
          icon={icon}
          spin={spin}
          className={`${defaultClassName} ${className}`.trim()}
          style={computedStyle as any}
          {...(props as any)}
        />
      );
    },
  );

  Component.displayName = `FaIcon(${icon.iconName})`;
  return Component;
}
