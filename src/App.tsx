import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, Moon, Shield, Sun } from 'lucide-react';
import {
  ApiError,
  createOrder,
  deleteOrder,
  fetchAdminOverview,
  fetchFormConfig,
  fetchMe,
  fetchOrders,
  getStoredToken,
  setStoredToken,
  updateOrder,
  type OrderSavePayload,
} from './api';
import { AdminDashboardView, type AdminTab } from './components/AdminDashboardView';
import { AuthScreen } from './components/AuthScreen';
import { DjiboutiFlag } from './components/DjiboutiFlag';
import { OrderFormView } from './components/OrderFormView';
import { OrdersWorkspaceView } from './components/OrdersWorkspaceView';
import { PendingScreen } from './components/PendingScreen';
import { PrintSheetsContainer } from './components/PrintSheets';
import { createDefaultFormConfig } from './constants';
import type {
  AdminOverviewPayload,
  FormConfig,
  RepairOrder,
  RoleDefinition,
  UserRecord,
} from './types';

type ActiveRoute = 'home' | 'new' | 'edit' | 'list' | 'admin';

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pap_theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    } catch {
      return false;
    }
  });

  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<UserRecord | null>(null);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [formConfig, setFormConfig] = useState<FormConfig>(() => createDefaultFormConfig());
  const [route, setRoute] = useState<ActiveRoute>('home');
  const [adminTab, setAdminTab] = useState<AdminTab>('users');
  const [editingOrder, setEditingOrder] = useState<RepairOrder | null>(null);

  const [orders, setOrders] = useState<RepairOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [adminOverview, setAdminOverview] = useState<AdminOverviewPayload | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  const [printQueue, setPrintQueue] = useState<RepairOrder[]>([]);
  const [globalError, setGlobalError] = useState('');

  // Sync dark mode class
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem('pap_theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [darkMode]);

  const handleLogout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
    setOrders([]);
    setAdminOverview(null);
    setEditingOrder(null);
    setRoute('home');
    setGlobalError('');
  }, []);

  const loadOrders = useCallback(async (activeUser: UserRecord) => {
    if (activeUser.status !== 'approved' || !activeUser.permissions.viewOrders) {
      setOrders([]);
      return;
    }
    setOrdersLoading(true);
    try {
      const list = await fetchOrders();
      setOrders(list);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleLogout();
      } else {
        setGlobalError(
          err instanceof Error ? err.message : 'Erreur lors du chargement des ordres.',
        );
      }
    } finally {
      setOrdersLoading(false);
    }
  }, [handleLogout]);

  const loadAdminData = useCallback(async (activeUser: UserRecord) => {
    if (activeUser.status !== 'approved' || !activeUser.permissions.manageUsers) {
      setAdminOverview(null);
      return;
    }
    setAdminLoading(true);
    try {
      const data = await fetchAdminOverview();
      setAdminOverview(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleLogout();
      }
    } finally {
      setAdminLoading(false);
    }
  }, [handleLogout]);

  const refreshSession = useCallback(async () => {
    const activeToken = getStoredToken();
    if (!activeToken) {
      setBooting(false);
      return;
    }
    try {
      const me = await fetchMe();
      setUser(me.user);
      setRoles(me.roles);
      if (me.formConfig) {
        setFormConfig(me.formConfig);
      }
      if (me.user.status === 'approved') {
        await Promise.all([loadOrders(me.user), loadAdminData(me.user)]);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleLogout();
      }
    } finally {
      setBooting(false);
    }
  }, [handleLogout, loadAdminData, loadOrders]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const userRef = useRef<UserRecord | null>(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const userId = user?.id;
  const userStatus = user?.status;
  const canManageUsers = user?.permissions.manageUsers;

  // Real-time Server-Sent Events synchronization
  useEffect(() => {
    if (!token || !userId) return;
    const source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);

    const onUsersUpdated = () => {
      refreshSession();
    };
    const onOrdersUpdated = () => {
      const current = userRef.current;
      if (current && current.status === 'approved') {
        loadOrders(current);
        if (current.permissions.manageUsers) {
          loadAdminData(current);
        }
      }
    };
    const onRolesUpdated = () => {
      refreshSession();
    };
    const onFormConfigUpdated = () => {
      fetchFormConfig()
        .then((cfg) => setFormConfig(cfg))
        .catch(() => {
          // ignore transient refresh failure
        });
      const current = userRef.current;
      if (current && current.status === 'approved' && current.permissions.manageUsers) {
        loadAdminData(current);
      }
    };

    source.addEventListener('users_updated', onUsersUpdated);
    source.addEventListener('orders_updated', onOrdersUpdated);
    source.addEventListener('roles_updated', onRolesUpdated);
    source.addEventListener('form_config_updated', onFormConfigUpdated);

    return () => {
      source.removeEventListener('users_updated', onUsersUpdated);
      source.removeEventListener('orders_updated', onOrdersUpdated);
      source.removeEventListener('roles_updated', onRolesUpdated);
      source.removeEventListener('form_config_updated', onFormConfigUpdated);
      source.close();
    };
  }, [token, userId, userStatus, canManageUsers, refreshSession, loadOrders, loadAdminData]);

  const handleAuthenticated = async (
    newToken: string,
    authedUser: UserRecord,
    _requiresValidation: boolean,
  ) => {
    setStoredToken(newToken);
    setToken(newToken);
    setUser(authedUser);
    setGlobalError('');
    setRoute('home');
    try {
      const me = await fetchMe();
      setUser(me.user);
      setRoles(me.roles);
      if (me.formConfig) {
        setFormConfig(me.formConfig);
      }
      if (me.user.status === 'approved') {
        await Promise.all([loadOrders(me.user), loadAdminData(me.user)]);
      }
    } catch {
      // handled gracefully
    }
  };

  const handleSaveOrder = async (payload: OrderSavePayload) => {
    if (route === 'edit' && editingOrder) {
      await updateOrder(editingOrder.id, payload);
    } else {
      await createOrder(payload);
    }
    if (user) {
      await loadOrders(user);
      if (user.permissions.manageUsers) {
        await loadAdminData(user);
      }
    }
    setEditingOrder(null);
    setRoute('list');
  };

  const handleDeleteOrder = async (orderId: number) => {
    await deleteOrder(orderId);
    if (user) {
      await loadOrders(user);
      if (user.permissions.manageUsers) {
        await loadAdminData(user);
      }
    }
  };

  const handlePrintOrders = (ordersToPrint: RepairOrder[]) => {
    if (!ordersToPrint.length) return;
    setPrintQueue(ordersToPrint);
    setTimeout(() => {
      try {
        window.print();
      } catch {
        // Ignore if print dialog blocked in headless mode
      }
    }, 80);
  };

  if (booting) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--fg)]">
        <div className="tri-bar w-full" />
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--mut)]">
          Chargement de Parc Auto Protocole…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onAuthenticated={handleAuthenticated}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
      />
    );
  }

  if (user.status !== 'approved') {
    return (
      <PendingScreen
        user={user}
        roles={roles}
        onRefreshStatus={refreshSession}
        onLogout={handleLogout}
      />
    );
  }

  const currentRoleLabel = roles.find((r) => r.id === user.roleId)?.label || user.roleId;
  const pendingCount = adminOverview?.stats.pendingUsers || 0;

  return (
    <>
      <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--fg)]">
        <div className="tri-bar w-full" />

        {/* 3-Zone Institutional Header */}
        <header className="bg-[var(--card)] border-b border-[var(--bd)] px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <DjiboutiFlag />
            <span className="font-display font-bold text-[17px] text-[var(--fg)] whitespace-nowrap">
              Parc Auto Protocole
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingOrder(null);
                setRoute('home');
              }}
              className={`min-h-[40px] px-3.5 py-2 rounded-md text-sm font-semibold whitespace-nowrap cursor-pointer ${
                route === 'home'
                  ? 'bg-[var(--pri)] text-white'
                  : 'border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] hover:border-[var(--pri)]'
              }`}
            >
              Accueil
            </button>

            {user.permissions.createOrders && (
              <button
                type="button"
                onClick={() => {
                  setEditingOrder(null);
                  setRoute('new');
                }}
                className={`min-h-[40px] px-3.5 py-2 rounded-md text-sm font-semibold whitespace-nowrap cursor-pointer ${
                  route === 'new' || route === 'edit'
                    ? 'bg-[var(--pri)] text-white'
                    : 'border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] hover:border-[var(--pri)]'
                }`}
              >
                Nouvel ordre
              </button>
            )}

            {user.permissions.viewOrders && (
              <button
                type="button"
                onClick={() => {
                  setEditingOrder(null);
                  setRoute('list');
                }}
                className={`min-h-[40px] px-3.5 py-2 rounded-md text-sm font-semibold whitespace-nowrap cursor-pointer ${
                  route === 'list'
                    ? 'bg-[var(--pri)] text-white'
                    : 'border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] hover:border-[var(--pri)]'
                }`}
              >
                Liste
              </button>
            )}

            {user.permissions.manageUsers && (
              <button
                type="button"
                onClick={() => {
                  setEditingOrder(null);
                  setRoute('admin');
                  loadAdminData(user);
                }}
                className={`min-h-[40px] px-3.5 py-2 rounded-md text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer ${
                  route === 'admin'
                    ? 'bg-[var(--ink)] text-white'
                    : 'border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] hover:border-[var(--ink)]'
                }`}
              >
                <Shield className="w-4 h-4" />
                Administration
                {pendingCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 text-[11px] leading-none rounded bg-[var(--red)] text-white tabular-nums">
                    {pendingCount}
                  </span>
                )}
              </button>
            )}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--mut)] whitespace-nowrap">
              <strong className="text-[var(--fg)] font-semibold">{user.fullName}</strong> ·{' '}
              {currentRoleLabel}
            </span>

            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label="Changer de thème"
              className="min-h-[40px] px-2.5 py-2 rounded-md border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] hover:border-[var(--pri)] cursor-pointer"
              title={darkMode ? 'Passer en mode clair' : 'Passer en mode sombre'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[40px] px-3.5 py-2 rounded-md border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] font-semibold text-sm inline-flex items-center gap-1.5 hover:border-[var(--red)] hover:text-[var(--red)] whitespace-nowrap cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1140px] mx-auto px-4 sm:px-5 py-5">
          {globalError && (
            <div className="mb-4 text-sm font-semibold text-[var(--red)] bg-[var(--red)]/10 border border-[var(--red)]/30 rounded-md px-4 py-2.5">
              {globalError}
            </div>
          )}

          {route === 'admin' && user.permissions.manageUsers ? (
            <AdminDashboardView
              overview={adminOverview}
              formConfig={formConfig}
              currentUser={user}
              loading={adminLoading}
              requestedTab={adminTab}
              onRefresh={() => loadAdminData(user)}
              onOverviewChange={(next) => {
                setAdminOverview(next);
                if (next.formConfig) {
                  setFormConfig(next.formConfig);
                }
              }}
              onFormConfigChange={(nextCfg) => setFormConfig(nextCfg)}
            />
          ) : (route === 'new' && user.permissions.createOrders) ||
            (route === 'edit' && user.permissions.editOrders && editingOrder) ? (
            <OrderFormView
              existingOrder={route === 'edit' ? editingOrder : null}
              currentUser={user}
              formConfig={formConfig}
              onSave={handleSaveOrder}
              onCancel={() => {
                setEditingOrder(null);
                setRoute('list');
              }}
              onOpenFormBuilder={
                user.permissions.manageUsers
                  ? () => {
                      setEditingOrder(null);
                      setAdminTab('form');
                      setRoute('admin');
                      loadAdminData(user);
                    }
                  : undefined
              }
            />
          ) : user.permissions.viewOrders ? (
            <OrdersWorkspaceView
              mode={route === 'list' ? 'list' : 'home'}
              orders={orders}
              currentUser={user}
              formConfig={formConfig}
              loading={ordersLoading}
              onNavigateHome={() => setRoute('home')}
              onNavigateList={() => setRoute('list')}
              onNavigateNew={() => {
                setEditingOrder(null);
                setRoute('new');
              }}
              onNavigateEdit={(order) => {
                setEditingOrder(order);
                setRoute('edit');
              }}
              onNavigateAdmin={() => {
                setAdminTab('users');
                setRoute('admin');
                loadAdminData(user);
              }}
              onDeleteOrder={handleDeleteOrder}
              onPrintOrders={handlePrintOrders}
            />
          ) : (
            <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-8 text-center">
              <h2 className="font-display text-xl font-bold text-[var(--fg)] mb-2">
                Accès restreint
              </h2>
              <p className="text-sm text-[var(--mut)]">
                Votre compte est actif, mais aucun droit de consultation des ordres ne vous a
                encore été attribué par l’administrateur.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Hidden official print container rendered strictly for @media print */}
      <PrintSheetsContainer orders={printQueue} formConfig={formConfig} />
    </>
  );
}
