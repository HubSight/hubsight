import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../api/client';
import { useTranslation } from '../i18n';

export interface TimezoneOption {
  value: string;
  label: string;
  offset: string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'Asia/Ho_Chi_Minh', label: 'UTC+7 (Vietnam, Bangkok, Jakarta)', offset: '+07:00' },
  { value: 'Asia/Singapore', label: 'UTC+8 (Singapore, Hong Kong, Beijing)', offset: '+08:00' },
  { value: 'Asia/Tokyo', label: 'UTC+9 (Tokyo, Seoul)', offset: '+09:00' },
  { value: 'Asia/Dubai', label: 'UTC+4 (Dubai, Abu Dhabi)', offset: '+04:00' },
  { value: 'Europe/London', label: 'UTC+0 (London, Dublin, Lisbon)', offset: '+00:00' },
  { value: 'Europe/Paris', label: 'UTC+1 (Paris, Berlin, Rome)', offset: '+01:00' },
  { value: 'America/New_York', label: 'UTC-5 (New York, Toronto)', offset: '-05:00' },
  { value: 'America/Chicago', label: 'UTC-6 (Chicago, Dallas)', offset: '-06:00' },
  { value: 'America/Los_Angeles', label: 'UTC-8 (Los Angeles, San Francisco)', offset: '-08:00' },
  { value: 'UTC', label: 'UTC+0 (Coordinated Universal Time)', offset: '+00:00' },
];

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const STORAGE_KEY = 'app_timezone';

interface TimezoneContextType {
  timezone: string;
  setTimezone: (tz: string) => Promise<void>;
  formatTime: (date: string | Date | number) => string;
  formatDateTime: (date: string | Date | number) => string;
  formatNotificationBody: (body: string, createdAt: string | Date | number) => string;
}

const TimezoneContext = createContext<TimezoneContextType>({
  timezone: DEFAULT_TIMEZONE,
  setTimezone: async () => {},
  formatTime: () => '',
  formatDateTime: () => '',
  formatNotificationBody: () => '',
});

export const TimezoneProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, setUser } = useAuth();
  const { t, locale } = useTranslation();
  const intlLocale = locale === 'en' ? 'en-GB' : 'vi-VN';
  const [timezone, setTimezoneState] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved || DEFAULT_TIMEZONE;
  });

  // Sync with user's DB preference upon login
  useEffect(() => {
    if (user?.timezone && user.timezone !== timezone) {
      setTimezoneState(user.timezone);
      localStorage.setItem(STORAGE_KEY, user.timezone);
    }
  }, [user?.timezone]);

  const setTimezone = async (tz: string) => {
    setTimezoneState(tz);
    localStorage.setItem(STORAGE_KEY, tz);

    if (user) {
      try {
        await api.auth.setTimezone(tz);
        setUser({ ...user, timezone: tz });
      } catch (err) {
        console.error('Failed to persist timezone to database:', err);
      }
    }
  };

  const formatTime = useMemo(() => {
    return (date: string | Date | number): string => {
      try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return new Intl.DateTimeFormat(intlLocale, {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(d);
      } catch {
        return '';
      }
    };
  }, [timezone, intlLocale]);

  const formatDateTime = useMemo(() => {
    return (date: string | Date | number): string => {
      try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return new Intl.DateTimeFormat(intlLocale, {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(d);
      } catch {
        return '';
      }
    };
  }, [timezone, intlLocale]);

  const formatNotificationBody = useMemo(() => {
    return (body: string, createdAt: string | Date | number): string => {
      const timeStr = formatTime(createdAt);
      if (!timeStr) return body;

      // Clean any server-side UTC hardcoded string like "lúc 16:06:30"
      const cleanBody = body.replace(/\s*(lúc|at)\s*\d{1,2}:\d{2}(:\d{2})?/gi, '').trim();
      return `${cleanBody} ${t('common.at')} ${timeStr}`;
    };
  }, [formatTime, t]);

  return (
    <TimezoneContext.Provider
      value={{
        timezone,
        setTimezone,
        formatTime,
        formatDateTime,
        formatNotificationBody,
      }}
    >
      {children}
    </TimezoneContext.Provider>
  );
};

export const useTimezone = () => useContext(TimezoneContext);
