import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { HubSightProvider } from '@hubsight/sdk/react';
import api from './api/client';
import { TimezoneProvider } from './context/TimezoneContext';
import { I18nProvider } from './i18n';
import { LocaleSync } from './components/LocaleSync';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Playback from './pages/Playback';
import MultiView from './pages/MultiView';
import Devices from './pages/Devices';
import NvrMonitor from './pages/NvrMonitor';
import Members from './pages/Members';
import { PoolMonitor } from './pages/PoolMonitor';
import Users from './pages/Users';
import Roles from './pages/Roles';
import Clients from './pages/Clients';
import { AppLoadingSkeleton } from './components/common/Skeleton';
import { AuthRealtimeWatcher } from './components/auth/AuthRealtimeWatcher';
import { ForceChangePasswordModal } from './components/auth/ForceChangePasswordModal';

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AppLoadingSkeleton />;
  }
  if (!user) return <Navigate to="/login" replace />;

  if (user.must_change_password) {
    return <ForceChangePasswordModal />;
  }

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
          <HubSightProvider client={api}>
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
                    <Route path="multiview" element={<MultiView />} />
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
                      path="users"
                      element={
                        <AdminRoute>
                          <Users />
                        </AdminRoute>
                      }
                    />
                    <Route
                      path="roles"
                      element={
                        <AdminRoute>
                          <Roles />
                        </AdminRoute>
                      }
                    />
                    <Route
                      path="clients"
                      element={
                        <AdminRoute>
                          <Clients />
                        </AdminRoute>
                      }
                    />
                    <Route path="access" element={<Navigate to="/users" replace />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </HubSightProvider>
        </TimezoneProvider>
      </AuthProvider>
    </I18nProvider>
  );
};

export default App;

