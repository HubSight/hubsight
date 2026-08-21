import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import vi from './vi';
import en from './en';
import type { TranslationKey } from './vi';

export type Locale = 'vi' | 'en';

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { vi, en };

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'vi',
  setLocale: () => {},
  t: (key) => key,
});

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [locale, setLocale] = useState<Locale>('vi');

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      let text = dictionaries[locale]?.[key] || dictionaries.vi[key] || key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, String(v));
        });
      }
      return text;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTranslation = () => useContext(I18nContext);
