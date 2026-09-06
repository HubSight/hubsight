import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../api/client';
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
  LAST_HIDDEN_TIME: 'app_lock_last_hidden_time',
  IS_LOCKED: 'app_lock_is_locked',
  SESSION_UNLOCKED: 'app_lock_session_unlocked',
};

export const AppLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
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

  // Calculate initial locked state on cold start / app open
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    const enabled = localStorage.getItem(STORAGE_KEYS.APP_LOCK_ENABLED);
    const isEnabled = enabled !== null ? enabled === 'true' : isPwa();
    if (!isEnabled) return false;

    // Check if explicitly locked previously
    if (localStorage.getItem(STORAGE_KEYS.IS_LOCKED) === 'true') {
      return true;
    }

    const timeout = localStorage.getItem(STORAGE_KEYS.LOCK_TIMEOUT);
    const timeoutSec = timeout !== null ? Number(timeout) : 0;

    // If timeout is 0 (Immediate), fresh launch must always be locked
    if (timeoutSec === 0) {
      return true;
    }

    // If session was never unlocked, start locked
    const sessionUnlocked = sessionStorage.getItem(STORAGE_KEYS.SESSION_UNLOCKED);
    if (sessionUnlocked !== 'true') {
      return true;
    }

    // Check elapsed time since last hidden
    const lastHidden = localStorage.getItem(STORAGE_KEYS.LAST_HIDDEN_TIME);
    if (lastHidden) {
      const elapsed = (Date.now() - Number(lastHidden)) / 1000;
      if (elapsed >= timeoutSec) {
        return true;
      }
    }

    return false;
  });

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
      localStorage.removeItem(STORAGE_KEYS.IS_LOCKED);
      localStorage.removeItem(STORAGE_KEYS.LAST_HIDDEN_TIME);
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
      localStorage.setItem(STORAGE_KEYS.IS_LOCKED, 'true');
      sessionStorage.removeItem(STORAGE_KEYS.SESSION_UNLOCKED);
    }
  }, [user, appLockEnabled]);

  // Unlock with Biometrics
  const unlockWithBiometrics = async (): Promise<boolean> => {
    try {
      const credId = localStorage.getItem(STORAGE_KEYS.CREDENTIAL_ID);
      const verified = await verifyPlatformCredential(credId);
      if (verified) {
        setIsLocked(false);
        localStorage.removeItem(STORAGE_KEYS.IS_LOCKED);
        localStorage.removeItem(STORAGE_KEYS.LAST_HIDDEN_TIME);
        sessionStorage.setItem(STORAGE_KEYS.SESSION_UNLOCKED, 'true');
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
      await api.auth.verifyPassword(password);
      setIsLocked(false);
      localStorage.removeItem(STORAGE_KEYS.IS_LOCKED);
      localStorage.removeItem(STORAGE_KEYS.LAST_HIDDEN_TIME);
      sessionStorage.setItem(STORAGE_KEYS.SESSION_UNLOCKED, 'true');
      return true;
    } catch (err) {
      console.error('Password verification error:', err);
      return false;
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Robust PWA & Mobile Background / Resume Lifecycle Listeners
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !appLockEnabled) return;

    // Called whenever app goes into background, user switches apps, locks phone, etc.
    const handleAppBackground = () => {
      const now = Date.now();
      localStorage.setItem(STORAGE_KEYS.LAST_HIDDEN_TIME, String(now));
      
      // We no longer lock IMMEDIATELY upon going to background because
      // opening a file picker or switching to a 2FA app triggers background state.
      // We evaluate the lock condition upon returning to foreground instead.
    };

    // Called whenever app returns to foreground, user unlocks phone, returns to PWA, etc.
    const handleAppForeground = () => {
      if (localStorage.getItem(STORAGE_KEYS.IS_LOCKED) === 'true') {
        setIsLocked(true);
        return;
      }

      const lastHiddenStr = localStorage.getItem(STORAGE_KEYS.LAST_HIDDEN_TIME);
      if (lastHiddenStr) {
        const elapsed = (Date.now() - Number(lastHiddenStr)) / 1000;
        
        // If timeout is 0 (Immediate), we still provide a short 10-second grace period 
        // to allow users to open the OS file picker, camera, or 2FA app.
        const effectiveTimeout = lockTimeout === 0 ? 10 : lockTimeout;
        
        if (elapsed >= effectiveTimeout) {
          setIsLocked(true);
          localStorage.setItem(STORAGE_KEYS.IS_LOCKED, 'true');
          sessionStorage.removeItem(STORAGE_KEYS.SESSION_UNLOCKED);
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleAppBackground();
      } else if (document.visibilityState === 'visible') {
        handleAppForeground();
      }
    };

    // Events for comprehensive iOS / Android / PWA coverage
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', handleAppBackground);
    window.addEventListener('pageshow', handleAppForeground);
    // Removed blur/focus events because they fire aggressively on PC (e.g. clicking outside window)
    // Page Lifecycle API support if available
    document.addEventListener('freeze' as any, handleAppBackground);
    document.addEventListener('resume' as any, handleAppForeground);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', handleAppBackground);
      window.removeEventListener('pageshow', handleAppForeground);
      window.removeEventListener('blur', handleAppBackground);
      window.removeEventListener('focus', handleAppForeground);
      document.removeEventListener('freeze' as any, handleAppBackground);
      document.removeEventListener('resume' as any, handleAppForeground);
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
