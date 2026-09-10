import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { HubSightProvider } from '@hubsight/sdk/react';
import api from './api/client';
import { TimezoneProvider } from './context/TimezoneContext';
import { ThemeProvider } from './context/ThemeContext';
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
import GoogleServiceAccounts from './pages/GoogleServiceAccounts';
import AppConfigs from './pages/AppConfigs';
import Preferences from './pages/Preferences';
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

const PermissionRoute = ({ children, permission }: { children: ReactNode; permission: string | string[] }) => {
  const { user, isLoading, can } = useAuth();

  if (isLoading) {
    return <AppLoadingSkeleton />;
  }
  if (!user) return <Navigate to="/login" replace />;
  const hasPerm = Array.isArray(permission)
    ? permission.some((p) => can(p))
    : can(permission);
  if (user.role !== 'admin' && !hasPerm) return <Navigate to="/playback" replace />;

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
        <ThemeProvider>
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
                      <Route
                        path="service-accounts"
                        element={
                          <PermissionRoute permission="service_accounts:manage">
                            <GoogleServiceAccounts />
                          </PermissionRoute>
                        }
                      />
                      <Route path="app-configs"
                        element={
                          <PermissionRoute permission={["app_configs:manage", "mobile_configs:manage"]}>
                            <AppConfigs />
                          </PermissionRoute>
                        }
                      />
                      <Route path="preferences" element={<Preferences />} />
                      <Route path="profile" element={<Navigate to="/preferences" replace />} />
                      <Route path="settings" element={<Navigate to="/preferences" replace />} />
                      <Route path="mobile-configs" element={<Navigate to="/app-configs" replace />} />
                      <Route path="access" element={<Navigate to="/users" replace />} />
                    </Route>
                  </Routes>
                </BrowserRouter>
              </HubSightProvider>
          </TimezoneProvider>
        </ThemeProvider>
      </AuthProvider>
    </I18nProvider>
  );
};

export default App;

