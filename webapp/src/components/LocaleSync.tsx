import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';

/**
 * Syncs the user's locale preference from AuthContext into the I18n context.
 * Must be rendered inside both AuthProvider and I18nProvider.
 */
export const LocaleSync = () => {
  const { user } = useAuth();
  const { setLocale } = useTranslation();

  useEffect(() => {
    if (user?.locale) {
      setLocale(user.locale);
    }
  }, [user?.locale, setLocale]);

  return null;
};
