import { getErrorCode } from '@hubsight/sdk';
import type { TranslationKey } from '../i18n';

/**
 * Translates an API error or machine-readable error code using the UI translation function `t`.
 * Looks up `errors.<CODE>` in the locale dictionary (vi/en).
 * If found, returns the localized message.
 * Otherwise, returns the specified fallback or general error.
 */
export function getLocalizedErrorMessage(
  err: unknown,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  fallback?: string
): string {
  const code = getErrorCode(err);
  if (code) {
    const translationKey = `errors.${code}` as TranslationKey;
    const translated = t(translationKey);
    // If the key exists in dictionary, translated will not equal the raw key string
    if (translated && translated !== translationKey) {
      return translated;
    }
  }

  return fallback || t('errors.UNKNOWN');
}
