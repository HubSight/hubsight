import { useState, useEffect } from 'react';

export interface OrientationState {
  isLandscape: boolean;
  isMobile: boolean;
  angle: number;
}

export function useOrientation(): OrientationState {
  const getIsMobile = () => {
    if (typeof window === 'undefined') return false;
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    const isSmallScreen = window.innerWidth <= 1024;
    const isMobileAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    return (isTouch && isSmallScreen) || isMobileAgent;
  };

  const getIsLandscape = () => {
    if (typeof window === 'undefined') return false;
    if (window.screen?.orientation) {
      return window.screen.orientation.type.startsWith('landscape');
    }
    if (typeof window.orientation !== 'undefined') {
      return Math.abs(Number(window.orientation)) === 90;
    }
    return window.matchMedia('(orientation: landscape)').matches;
  };

  const getAngle = () => {
    if (typeof window === 'undefined') return 0;
    if (window.screen?.orientation?.angle !== undefined) {
      return window.screen.orientation.angle;
    }
    if (typeof window.orientation !== 'undefined') {
      return Number(window.orientation) || 0;
    }
    return 0;
  };

  const [state, setState] = useState<OrientationState>(() => ({
    isLandscape: getIsLandscape(),
    isMobile: getIsMobile(),
    angle: getAngle()
  }));

  useEffect(() => {
    const handleOrientationChange = () => {
      setState({
        isLandscape: getIsLandscape(),
        isMobile: getIsMobile(),
        angle: getAngle()
      });
    };

    // 1. Screen Orientation API
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', handleOrientationChange);
    }

    // 2. Media Query Listener
    const mql = window.matchMedia('(orientation: landscape)');
    const handleMql = () => handleOrientationChange();
    if (mql.addEventListener) {
      mql.addEventListener('change', handleMql);
    } else {
      mql.addListener(handleMql);
    }

    // 3. Fallback window events for older iOS / WebKit
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', handleOrientationChange);
      }
      if (mql.removeEventListener) {
        mql.removeEventListener('change', handleMql);
      } else {
        mql.removeListener(handleMql);
      }
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, []);

  return state;
}
