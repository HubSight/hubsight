import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeToDom(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    }
    return 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    const initialTheme = typeof window !== 'undefined'
      ? ((localStorage.getItem(THEME_STORAGE_KEY) as Theme) || 'system')
      : 'system';
    return initialTheme === 'system' ? getSystemTheme() : initialTheme;
  });

  // Apply resolved theme to DOM
  const updateResolvedTheme = useCallback((targetTheme: Theme) => {
    const resolved = targetTheme === 'system' ? getSystemTheme() : targetTheme;
    setResolvedTheme(resolved);
    applyThemeToDom(resolved);
  }, []);

  // Sync with user preference from DB on login / load
  useEffect(() => {
    if (user?.theme && (user.theme === 'system' || user.theme === 'light' || user.theme === 'dark')) {
      if (user.theme !== theme) {
        setThemeState(user.theme);
        localStorage.setItem(THEME_STORAGE_KEY, user.theme);
        updateResolvedTheme(user.theme);
      }
    }
  }, [user?.theme, theme, updateResolvedTheme]);

  // Listen to OS system color scheme changes if theme === 'system'
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      if (theme === 'system') {
        const resolved: ResolvedTheme = e.matches ? 'dark' : 'light';
        setResolvedTheme(resolved);
        applyThemeToDom(resolved);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Initial apply on mount
  useEffect(() => {
    updateResolvedTheme(theme);
  }, [theme, updateResolvedTheme]);

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      /* ignore storage errors */
    }
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
