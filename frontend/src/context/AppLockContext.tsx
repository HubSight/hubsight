import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import axiosClient from '../api/axiosClient';
import { isPwa } from '../utils/pwa';
import {
  isPlatformAuthenticatorAvailable,
  registerPlatformCredential,
  verifyPlatformCredential
} from '../utils/webauthn';

interface AppLockContextType {
  isLocked: boolean;
  appLockEnabled: boolean;
  biometricEnabled: boolean;
  biometricSupported: boolean;
  lockTimeout: number; // in seconds: 0 = immediate, 60 = 1m, 300 = 5m
  lockApp: () => void;
  unlockWithBiometrics: () => Promise<boolean>;
  unlockWithPassword: (password: string) => Promise<boolean>;
  setAppLockEnabled: (enabled: boolean) => void;
  setLockTimeout: (timeout: number) => void;
  enableBiometricUnlock: () => Promise<boolean>;
  disableBiometricUnlock: () => void;
}

const AppLockContext = createContext<AppLockContextType>({
  isLocked: false,
  appLockEnabled: false,
  biometricEnabled: false,
  biometricSupported: false,
  lockTimeout: 0,
  lockApp: () => {},
  unlockWithBiometrics: async () => false,
  unlockWithPassword: async () => false,
  setAppLockEnabled: () => {},
  setLockTimeout: () => {},
  enableBiometricUnlock: async () => false,
  disableBiometricUnlock: () => {},
});

const STORAGE_KEYS = {
  APP_LOCK_ENABLED: 'app_lock_enabled',
  BIOMETRIC_ENABLED: 'app_lock_biometric_enabled',
  CREDENTIAL_ID: 'app_lock_credential_id',
  LOCK_TIMEOUT: 'app_lock_timeout',
};

export const AppLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);

  // Settings state
  const [appLockEnabled, setAppLockEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.APP_LOCK_ENABLED);
    return saved !== null ? saved === 'true' : isPwa();
  });

  const [biometricEnabled, setBiometricEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BIOMETRIC_ENABLED);
    return saved === 'true';
  });

  const [lockTimeout, setLockTimeoutState] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.LOCK_TIMEOUT);
    return saved !== null ? Number(saved) : 0;
  });

  const lastHiddenTimeRef = useRef<number | null>(null);

  // Detect platform biometrics capability
  useEffect(() => {
    isPlatformAuthenticatorAvailable().then((supported) => {
      setBiometricSupported(supported);
    });
  }, []);

  // Update App Lock enabled
  const setAppLockEnabled = (enabled: boolean) => {
    setAppLockEnabledState(enabled);
    localStorage.setItem(STORAGE_KEYS.APP_LOCK_ENABLED, String(enabled));
    if (!enabled) {
      setIsLocked(false);
    }
  };

  // Update Lock Timeout
  const setLockTimeout = (timeout: number) => {
    setLockTimeoutState(timeout);
    localStorage.setItem(STORAGE_KEYS.LOCK_TIMEOUT, String(timeout));
  };

  // Enable Biometric Unlock via WebAuthn
  const enableBiometricUnlock = async (): Promise<boolean> => {
    if (!user) return false;
    try {
      const credId = await registerPlatformCredential(user.username, user.full_name || user.username);
      if (credId) {
        localStorage.setItem(STORAGE_KEYS.CREDENTIAL_ID, credId);
        localStorage.setItem(STORAGE_KEYS.BIOMETRIC_ENABLED, 'true');
        setBiometricEnabledState(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to register WebAuthn biometric credential:', err);
      throw err;
    }
  };

  // Disable Biometric Unlock
  const disableBiometricUnlock = () => {
    localStorage.removeItem(STORAGE_KEYS.CREDENTIAL_ID);
    localStorage.setItem(STORAGE_KEYS.BIOMETRIC_ENABLED, 'false');
    setBiometricEnabledState(false);
  };

  const lockApp = useCallback(() => {
    if (user && appLockEnabled) {
      setIsLocked(true);
    }
  }, [user, appLockEnabled]);

  // Unlock with Biometrics
  const unlockWithBiometrics = async (): Promise<boolean> => {
    try {
      const credId = localStorage.getItem(STORAGE_KEYS.CREDENTIAL_ID);
      const verified = await verifyPlatformCredential(credId);
      if (verified) {
        setIsLocked(false);
        lastHiddenTimeRef.current = null;
        return true;
      }
      return false;
    } catch (err) {
      console.warn('WebAuthn biometric verification failed or was cancelled:', err);
      return false;
    }
  };

  // Unlock with Account Password
  const unlockWithPassword = async (password: string): Promise<boolean> => {
    try {
      await axiosClient.post('/auth/verify-password', { password });
      setIsLocked(false);
      lastHiddenTimeRef.current = null;
      return true;
    } catch (err) {
      console.error('Password verification error:', err);
      return false;
    }
  };

  // Visibility / Background change listener
  useEffect(() => {
    if (!user || !appLockEnabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenTimeRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        if (lastHiddenTimeRef.current !== null) {
          const elapsed = (Date.now() - lastHiddenTimeRef.current) / 1000;
          if (elapsed >= lockTimeout) {
            setIsLocked(true);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, appLockEnabled, lockTimeout]);

  return (
    <AppLockContext.Provider
      value={{
        isLocked,
        appLockEnabled,
        biometricEnabled,
        biometricSupported,
        lockTimeout,
        lockApp,
        unlockWithBiometrics,
        unlockWithPassword,
        setAppLockEnabled,
        setLockTimeout,
        enableBiometricUnlock,
        disableBiometricUnlock,
      }}
    >
      {children}
    </AppLockContext.Provider>
  );
};

export const useAppLock = () => useContext(AppLockContext);
