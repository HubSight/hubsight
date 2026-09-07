import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '@hubsight/api';
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
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    try {
      setUser(await api.auth.me());
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const can = (...permissions: string[]): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const userPerms = user.permissions || [];
    if (userPerms.includes('*')) return true;
    return permissions.some((p) => userPerms.includes(p));
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, setUser, checkAuth, can }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
