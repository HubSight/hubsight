import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '@hubsight/sdk';
import { api } from '../api/client';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  checkAuth: () => Promise<void>;
  can: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  setUser: () => {},
  checkAuth: async () => {},
  can: () => false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(api.auth.getUser());
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const u = await api.auth.me();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();

    const unsub = api.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      unsub();
    };
  }, []);

  const can = (...permissions: string[]): boolean => {
    return api.auth.can(...permissions);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, setUser, checkAuth, can }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
