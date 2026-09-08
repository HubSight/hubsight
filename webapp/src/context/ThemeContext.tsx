import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ThemePreference } from '@hubsight/sdk';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

export type Theme = ThemePreference; // 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: async () => {},
});

const THEME_STORAGE_KEY = 'hs_theme';

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyThemeToDom(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }

  try {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]:not([media])') as HTMLMetaElement
      || document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    if (metaThemeColor) {
      metaThemeColor.content = resolved === 'dark' ? '#000000' : '#ffffff';
    }
  } catch {}
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme;
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          return saved;
        }
      } catch {}
    }
    return 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    let initialTheme: Theme = 'system';
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme;
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          initialTheme = saved;
        }
      } catch {}
    }
    return initialTheme === 'system' ? getSystemTheme() : initialTheme;
  });

  const themeRef = useRef<Theme>(theme);
  themeRef.current = theme;

  const lastSyncedUserThemeRef = useRef<string | null>(null);

  // Apply resolved theme to DOM
  const updateResolvedTheme = useCallback((targetTheme: Theme) => {
    const resolved = targetTheme === 'system' ? getSystemTheme() : targetTheme;
    setResolvedTheme(resolved);
    applyThemeToDom(resolved);
  }, []);

  // Sync with user preference from DB on login / user change
  // Note: Only sync when user.theme changes from an external source, NOT on internal theme state changes
  useEffect(() => {
    if (!user?.theme) return;
    if (user.theme === 'system' || user.theme === 'light' || user.theme === 'dark') {
      if (user.theme !== lastSyncedUserThemeRef.current) {
        lastSyncedUserThemeRef.current = user.theme;
        setThemeState(user.theme);
        try {
          localStorage.setItem(THEME_STORAGE_KEY, user.theme);
        } catch {}
        updateResolvedTheme(user.theme);
      }
    }
  }, [user?.theme, updateResolvedTheme]);

  // Robust, persistent listener for OS system color scheme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemThemeChange = () => {
      if (themeRef.current === 'system') {
        const isDark = mq.matches;
        const resolved: ResolvedTheme = isDark ? 'dark' : 'light';
        setResolvedTheme(resolved);
        applyThemeToDom(resolved);
      }
    };

    // Immediately evaluate on mount
    if (themeRef.current === 'system') {
      handleSystemThemeChange();
    }

    // Modern browsers
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleSystemThemeChange);
    } else if (typeof (mq as any).addListener === 'function') {
      // Legacy WebKit / Safari
      (mq as any).addListener(handleSystemThemeChange);
    }

    // Crucial for macOS / iOS: appearance often changes while tab is inactive
    const handleWindowFocusOrVisibility = () => {
      if (themeRef.current === 'system') {
        handleSystemThemeChange();
      }
    };

    window.addEventListener('focus', handleWindowFocusOrVisibility);
    document.addEventListener('visibilitychange', handleWindowFocusOrVisibility);

    return () => {
      if (typeof mq.removeEventListener === 'function') {
        mq.removeEventListener('change', handleSystemThemeChange);
      } else if (typeof (mq as any).removeListener === 'function') {
        (mq as any).removeListener(handleSystemThemeChange);
      }
      window.removeEventListener('focus', handleWindowFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleWindowFocusOrVisibility);
    };
  }, []);

  // Apply on mount / theme state changes
  useEffect(() => {
    updateResolvedTheme(theme);
  }, [theme, updateResolvedTheme]);

  const setTheme = useCallback(async (newTheme: Theme) => {
    lastSyncedUserThemeRef.current = newTheme;
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {}
    updateResolvedTheme(newTheme);

    // If logged in, save to backend
    if (user) {
      try {
        await api.auth.setTheme(newTheme);
      } catch (err) {
        console.warn('Failed to sync theme preference to server', err);
      }
    }
  }, [user, updateResolvedTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext);
