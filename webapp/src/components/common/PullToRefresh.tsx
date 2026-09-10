import React, { useState, useRef } from 'react';
import { ArrowDown, RefreshCw } from '@/components/icons';
import { useTranslation } from '../../i18n';

interface PullToRefreshProps {
  onRefresh: () => Promise<any> | void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  pullDownThreshold?: number;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  className = '',
  disabled = false,
  pullDownThreshold = 65,
}) => {
  const { t } = useTranslation();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasTriggeredHaptic, setHasTriggeredHaptic] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (disabled || isRefreshing) return;

    const container = containerRef.current;
    if (!container) return;

    // Only start pull if container is at or very close to top
    if (container.scrollTop <= 2) {
      touchStartY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
      isDragging.current = true;
      setHasTriggeredHaptic(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (disabled || isRefreshing || !isDragging.current) return;

    const container = containerRef.current;
    if (!container) return;

    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const deltaY = currentY - touchStartY.current;
    const deltaX = Math.abs(currentX - touchStartX.current);

    // If horizontal scroll is dominant, don't trigger pull to refresh
    if (deltaX > Math.abs(deltaY) && deltaX > 10) {
      isDragging.current = false;
      setPullDistance(0);
      return;
    }

    if (deltaY > 0 && container.scrollTop <= 2) {
      // Apply rubber-band damping
      const damped = Math.min(Math.pow(deltaY, 0.82) * 0.9, 110);
      setPullDistance(damped);

      // Trigger light haptic once when passing threshold
      if (damped >= pullDownThreshold && !hasTriggeredHaptic) {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(10);
          } catch {
            // ignore
          }
        }
        setHasTriggeredHaptic(true);
      }
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = async () => {
    if (disabled || isRefreshing || !isDragging.current) return;
    isDragging.current = false;

    if (pullDistance >= pullDownThreshold) {
      setIsRefreshing(true);
      setPullDistance(50); // Lock to loading height

      try {
        await onRefresh();
      } catch (err) {
        console.error('Pull to refresh failed:', err);
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  };

  const progress = Math.min(pullDistance / pullDownThreshold, 1);
  const rotation = progress * 180;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`relative overflow-y-auto ${className}`}
    >
      {/* Pull Indicator Header */}
      <div
        style={{
          height: `${pullDistance}px`,
          opacity: pullDistance > 8 ? Math.min(pullDistance / 30, 1) : 0,
        }}
        className={`w-full flex items-center justify-center overflow-hidden shrink-0 pointer-events-none transition-height ${
          isDragging.current ? 'duration-0' : 'duration-300 ease-out'
        }`}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/95 border border-slate-200 shadow-md backdrop-blur-md text-xs font-semibold text-slate-700 transform">
          {isRefreshing ? (
            <>
              <RefreshCw size={14} className="animate-spin text-orange-600" />
              <span className="text-slate-600">{t('refresh')}...</span>
            </>
          ) : (
            <>
              <ArrowDown
                size={14}
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: 'transform 0.15s ease',
                }}
                className={`transition-colors ${
                  pullDistance >= pullDownThreshold ? 'text-orange-600' : 'text-slate-500'
                }`}
              />
              <span className={pullDistance >= pullDownThreshold ? 'text-orange-600 font-bold' : 'text-slate-600'}>
                {pullDistance >= pullDownThreshold ? t('releaseToRefresh') : t('pullToRefresh')}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Page Content */}
      {children}
    </div>
  );
};
