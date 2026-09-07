import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLockProvider } from './context/AppLockContext';
import { RealtimeProvider } from '@hubsight/realtime/react';
import { TimezoneProvider } from './context/TimezoneContext';
import { I18nProvider } from './i18n';
import { LocaleSync } from './components/LocaleSync';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Playback from './pages/Playback';
import Devices from './pages/Devices';
import NvrMonitor from './pages/NvrMonitor';
import Members from './pages/Members';
import { PoolMonitor } from './pages/PoolMonitor';
import { AccessControl } from './pages/AccessControl';
import { AppLoadingSkeleton } from './components/common/Skeleton';
import { AuthRealtimeWatcher } from './components/auth/AuthRealtimeWatcher';

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AppLoadingSkeleton />;
  }
  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AppLoadingSkeleton />;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/playback" replace />;

  return <>{children}</>;
};

const IndexRedirect = () => {
  const { user } = useAuth();
  return <Navigate to={user?.role === 'viewer' ? '/playback' : '/devices'} replace />;
};

const App = () => {
  return (
    <I18nProvider>
      <AuthProvider>
        <LocaleSync />
        <TimezoneProvider>
          <AppLockProvider>
            <RealtimeProvider baseUrl={import.meta.env.VITE_API_URL}>
              <AuthRealtimeWatcher />
              <BrowserRouter>
                <Routes>
                  <Route path="/login" element={<Login />} />

                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <MainLayout />
                      </ProtectedRoute>
                    }
                  >
                  <Route index element={<IndexRedirect />} />
                  <Route
                    path="devices"
                    element={
                      <AdminRoute>
                        <Devices />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="members"
                    element={
                      <AdminRoute>
                        <Members />
                      </AdminRoute>
                    }
                  />
                  <Route path="playback" element={<Playback />} />
                  <Route
                    path="recorder"
                    element={
                      <AdminRoute>
                        <NvrMonitor />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="pool"
                    element={
                      <AdminRoute>
                        <PoolMonitor />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="access"
                    element={
                      <AdminRoute>
                        <AccessControl />
                      </AdminRoute>
                    }
                  />
                </Route>
              </Routes>
            </BrowserRouter>
          </RealtimeProvider>
        </AppLockProvider>
      </TimezoneProvider>
    </AuthProvider>
  </I18nProvider>
);
};

export default App;

