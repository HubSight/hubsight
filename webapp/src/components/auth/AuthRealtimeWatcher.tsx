import React from 'react';
import { useRealtimeEvent } from '@hubsight/realtime/react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { api } from '../../api/client';
import toast from 'react-hot-toast';

export const AuthRealtimeWatcher: React.FC = () => {
  const { user, setUser } = useAuth();
  const { t } = useTranslation();

  useRealtimeEvent('auth:force_logout', (payload) => {
    if (!user || user.id === payload.userId) {
      toast.error(payload.message || t('access.accountBlockedAlert'), {
        duration: 6000,
      });

      // Clear authentication cookie and state
      api.auth.logout().catch(() => {});
      setUser(null);

      // Force immediate navigation to login page
      setTimeout(() => {
        window.location.href = '/login?blocked=true';
      }, 300);
    }
  });

  return null;
};
