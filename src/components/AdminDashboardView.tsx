import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Ban,
  Check,
  Clock,
  FilePenLine,
  Plus,
  RefreshCw,
  Shield,
  Sliders,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  adminCreateRole,
  adminDeleteRole,
  adminDeleteUser,
  adminUpdateRole,
  adminUpdateUser,
} from '../api';
import {
  createDefaultFormConfig,
  emptyPermissions,
  formatDateTimeFr,
  PERMISSION_DEFINITIONS,
} from '../constants';
import type {
  AdminOverviewPayload,
  FormConfig,
  PermissionKey,
  RoleDefinition,
  UserPermissions,
  UserRecord,
  UserStatus,
} from '../types';
import { FormBuilderPanel } from './FormBuilderPanel';

export type AdminTab = 'users' | 'roles' | 'form' | 'logs';

interface AdminDashboardViewProps {
  overview: AdminOverviewPayload | null;
  formConfig: FormConfig;
  currentUser: UserRecord;
  loading: boolean;
  requestedTab?: AdminTab;
  onRefresh: () => Promise<void>;
  onOverviewChange: (next: AdminOverviewPayload) => void;
  onFormConfigChange: (next: FormConfig) => void;
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'blocked';

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  overview,
  formConfig,
  currentUser,
  loading,
  requestedTab,
  onRefresh,
  onOverviewChange,
  onFormConfigChange,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>(requestedTab || 'users');
  useEffect(() => {
    if (requestedTab) setActiveTab(requestedTab);
  }, [requestedTab]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [userSearch, setUserSearch] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draftRoleId, setDraftRoleId] = useState<string>('');
  const [draftPerms, setDraftPerms] = useState<UserPermissions | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Role customization state
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleFormLabel, setRoleFormLabel] = useState('');
  const [roleFormDesc, setRoleFormDesc] = useState('');
  const [roleFormPerms, setRoleFormPerms] = useState<UserPermissions>(emptyPermissions());
  const [syncRoleUsers, setSyncRoleUsers] = useState(true);
  const [creatingNewRole, setCreatingNewRole] = useState(false);

  const users = overview?.users || [];
  const roles = overview?.roles || [];
  const logs = overview?.logs || [];
  const stats = overview?.stats;

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter === 'pending' && u.status !== 'pending') return false;
      if (statusFilter === 'approved' && u.status !== 'approved') return false;
      if (statusFilter === 'blocked' && u.status !== 'rejected' && u.status !== 'suspended') {
        return false;
      }
      if (!q) return true;
      return [u.fullName, u.username, u.email, u.department, u.roleId]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [users, statusFilter, userSearch]);

  const roleLabel = (roleId: string) =>
    roles.find((r) => r.id === roleId)?.label || roleId;

  const openPermissionEditor = (u: UserRecord) => {
    if (editingUserId === u.id) {
      setEditingUserId(null);
      setDraftPerms(null);
      return;
    }
    setEditingUserId(u.id);
    setDraftRoleId(u.roleId);
    setDraftPerms({ ...u.permissions });
    setErrorMsg('');
  };

  const handleRolePresetChangeForUser = (newRoleId: string) => {
    setDraftRoleId(newRoleId);
    const preset = roles.find((r) => r.id === newRoleId);
    if (preset) {
      setDraftPerms({ ...preset.permissions });
    }
  };

  const handleToggleUserPerm = (key: PermissionKey) => {
    setDraftPerms((prev) => (prev ? { ...prev, [key]: !prev[key] } : prev));
  };

  const handleSaveUserPermissions = async (userId: string) => {
    if (!draftPerms) return;
    setBusyId(userId);
    setErrorMsg('');
    setFeedback('');
    try {
      const res = await adminUpdateUser(userId, {
        roleId: draftRoleId,
        permissions: draftPerms,
      });
      onOverviewChange(res.overview);
      setEditingUserId(null);
      setDraftPerms(null);
      setFeedback('Droits d’accès mis à jour en temps réel.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors de la mise à jour.');
    } finally {
      setBusyId(null);
    }
  };

  const handleUpdateStatus = async (userId: string, status: UserStatus) => {
    setBusyId(userId);
    setErrorMsg('');
    setFeedback('');
    try {
      const res = await adminUpdateUser(userId, { status });
      onOverviewChange(res.overview);
      const labelMap: Record<UserStatus, string> = {
        approved: 'Compte validé. L’utilisateur peut désormais se connecter.',
        rejected: 'Demande refusée.',
        suspended: 'Compte suspendu.',
        pending: 'Compte replacé en attente.',
      };
      setFeedback(labelMap[status]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setBusyId(userId);
    setErrorMsg('');
    try {
      const next = await adminDeleteUser(userId);
      onOverviewChange(next);
      setConfirmDeleteUserId(null);
      setFeedback('Compte supprimé.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Suppression impossible.');
    } finally {
      setBusyId(null);
    }
  };

  const startEditRole = (role: RoleDefinition) => {
    setCreatingNewRole(false);
    setEditingRoleId(role.id);
    setRoleFormLabel(role.label);
    setRoleFormDesc(role.description);
    setRoleFormPerms({ ...role.permissions });
    setSyncRoleUsers(true);
    setErrorMsg('');
  };

  const startNewRole = () => {
    setEditingRoleId(null);
    setCreatingNewRole(true);
    setRoleFormLabel('');
    setRoleFormDesc('');
    setRoleFormPerms({
      ...emptyPermissions(),
      viewOrders: true,
      printOrders: true,
    });
    setErrorMsg('');
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setFeedback('');
    if (!roleFormLabel.trim()) {
      setErrorMsg('Le nom du rôle est requis.');
      return;
    }
    setBusyId(creatingNewRole ? 'new-role' : editingRoleId);
    try {
      if (creatingNewRole) {
        const res = await adminCreateRole({
          label: roleFormLabel.trim(),
          description: roleFormDesc.trim(),
          permissions: roleFormPerms,
        });
        onOverviewChange(res.overview);
        setCreatingNewRole(false);
        setFeedback(`Rôle « ${res.role.label} » créé.`);
      } else if (editingRoleId) {
        const res = await adminUpdateRole(editingRoleId, {
          label: roleFormLabel.trim(),
          description: roleFormDesc.trim(),
          permissions: roleFormPerms,
          syncUsers: syncRoleUsers,
        });
        onOverviewChange(res.overview);
        setEditingRoleId(null);
        setFeedback(`Modèle de rôle « ${res.role.label} » enregistré.`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur sur le rôle.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    setBusyId(roleId);
    setErrorMsg('');
    try {
      const next = await adminDeleteRole(roleId);
      onOverviewChange(next);
      setFeedback('Rôle personnalisé supprimé.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Suppression impossible.');
    } finally {
      setBusyId(null);
    }
  };

  if (!overview && loading) {
    return (
      <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-8 text-center text-sm text-[var(--mut)]">
        Chargement du tableau de bord administrateur…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[var(--fg)] m-0">
            Administration & Statistiques en temps réel
          </h2>
          <p className="text-sm text-[var(--mut)] mt-0.5">
            Validation des inscriptions, personnalisation des droits d’accès et suivi du parc
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="min-h-[40px] px-3.5 py-2 rounded-md border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] font-semibold text-sm flex items-center gap-2 hover:border-[var(--pri)] cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* Real-time KPI Row */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--mut)]">
              <span>Demandes en attente</span>
              <Clock className="w-4 h-4 text-[var(--pri)]" />
            </div>
            <div className="font-display text-3xl font-bold tabular-nums mt-2 text-[var(--pri)]">
              {stats.pendingUsers}
            </div>
            <div className="text-xs text-[var(--mut)] mt-1 tabular-nums">
              {stats.suspendedOrRejectedUsers} compte(s) refusé(s) ou suspendu(s)
            </div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--mut)]">
              <span>Collaborateurs actifs</span>
              <Users className="w-4 h-4 text-[var(--ink)]" />
            </div>
            <div className="font-display text-3xl font-bold tabular-nums mt-2 text-[var(--fg)]">
              {stats.approvedUsers}{' '}
              <span className="text-base font-normal text-[var(--mut)]">/ {stats.totalUsers}</span>
            </div>
            <div className="text-xs text-[var(--mut)] mt-1">Accès validé à la base centrale</div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--mut)]">
              <span>Ordres de réparation</span>
              <Activity className="w-4 h-4 text-[var(--pri)]" />
            </div>
            <div className="font-display text-3xl font-bold tabular-nums mt-2 text-[var(--fg)]">
              {stats.totalOrders}
            </div>
            <div className="text-xs text-[var(--mut)] mt-1 tabular-nums">
              {stats.ordersThisMonth} ce mois-ci · {stats.ordersToday} aujourd’hui
            </div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--mut)]">
              <span>
                Conformité {stats.checklistCount}/{stats.checklistCount}
              </span>
              <Shield className="w-4 h-4 text-[var(--ink)]" />
            </div>
            <div className="font-display text-3xl font-bold tabular-nums mt-2 text-[var(--ink)]">
              {stats.completionRate}%
            </div>
            <div className="text-xs text-[var(--mut)] mt-1 tabular-nums">
              {stats.completeOrders} complets · {stats.incompleteOrders} incomplets
            </div>
          </div>
        </div>
      )}

      {/* Recharts Interactive Visualizations */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Chart 1: Monthly Evolution */}
          <div className="lg:col-span-5 bg-[var(--card)] border border-[var(--bd)] rounded-lg p-4 sm:p-5 flex flex-col">
            <div className="mb-3">
              <div className="font-display text-lg font-bold text-[var(--fg)]">
                Évolution mensuelle des ordres
              </div>
              <div className="text-xs text-[var(--mut)]">
                Volume mensuel enregistré et fiches conformes ({stats.checklistCount}/
                {stats.checklistCount} contrôles)
              </div>
            </div>
            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={stats.monthlyEvolution}
                  margin={{ top: 10, right: 12, left: -16, bottom: 4 }}
                >
                  <defs>
                    <linearGradient id="papGradTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1d5f96" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#1d5f96" stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="papGradComplete" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0b6b1f" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#0b6b1f" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--row)" />
                  <XAxis
                    dataKey="monthLabel"
                    tick={{ fill: 'var(--mut)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--bd)' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: 'var(--mut)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--bd)' }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      borderColor: 'var(--bd)',
                      borderRadius: '6px',
                      color: 'var(--fg)',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <Area
                    type="monotone"
                    dataKey="totalOrders"
                    name="Total des ordres"
                    stroke="#1d5f96"
                    strokeWidth={2.2}
                    fillOpacity={1}
                    fill="url(#papGradTotal)"
                  />
                  <Area
                    type="monotone"
                    dataKey="completeOrders"
                    name={`Conformes (${stats.checklistCount}/${stats.checklistCount})`}
                    stroke="#0b6b1f"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#papGradComplete)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Distribution of Repair Types Performed */}
          <div className="lg:col-span-7 bg-[var(--card)] border border-[var(--bd)] rounded-lg p-4 sm:p-5 flex flex-col">
            <div className="mb-3">
              <div className="font-display text-lg font-bold text-[var(--fg)]">
                Répartition des types de réparations effectuées
              </div>
              <div className="text-xs text-[var(--mut)]">
                Fréquence d’exécution sur les {stats.checklistCount} points de contrôle du
                formulaire
              </div>
            </div>
            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.repairTypeBreakdown}
                  layout="vertical"
                  margin={{ top: 4, right: 18, left: 10, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--row)" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fill: 'var(--mut)', fontSize: 11 }}
                    axisLine={{ stroke: 'var(--bd)' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="shortLabel"
                    width={132}
                    tick={{ fill: 'var(--fg)', fontSize: 11 }}
                    axisLine={{ stroke: 'var(--bd)' }}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const item = payload[0].payload as {
                        label: string;
                        completedCount: number;
                        pendingCount: number;
                        rate: number;
                      };
                      return (
                        <div
                          style={{
                            backgroundColor: 'var(--card)',
                            borderColor: 'var(--bd)',
                            color: 'var(--fg)',
                          }}
                          className="border rounded-md px-3 py-2 text-xs shadow-sm max-w-[260px]"
                        >
                          <div className="font-bold mb-1">{item.label}</div>
                          <div className="tabular-nums text-[var(--pri)] font-semibold">
                            Effectuées : {item.completedCount} ({item.rate}%)
                          </div>
                          <div className="tabular-nums text-[var(--mut)]">
                            Non effectuées : {item.pendingCount}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
                  <Bar
                    dataKey="completedCount"
                    name="Effectuées"
                    stackId="a"
                    fill="#1d5f96"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="pendingCount"
                    name="Non effectuées"
                    stackId="a"
                    fill="#cbd5e1"
                    radius={[0, 3, 3, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Secondary Analytics Breakdown */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-4">
            <div className="text-sm font-bold text-[var(--fg)] mb-3">
              Répartition par marque
            </div>
            <div className="space-y-2.5">
              {stats.brandBreakdown.length === 0 ? (
                <div className="text-xs text-[var(--mut)]">Aucune donnée disponible.</div>
              ) : (
                stats.brandBreakdown.map((item) => {
                  const pct = Math.max(
                    8,
                    Math.round((item.count / Math.max(1, stats.totalOrders)) * 100),
                  );
                  return (
                    <div key={item.brand}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-[var(--fg)]">{item.brand}</span>
                        <span className="tabular-nums text-[var(--mut)]">{item.count} ordre(s)</span>
                      </div>
                      <div className="h-2 rounded bg-[var(--inp)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--pri)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-4">
            <div className="text-sm font-bold text-[var(--fg)] mb-3">
              Contributions des collaborateurs
            </div>
            <div className="space-y-2.5">
              {stats.authorBreakdown.length === 0 ? (
                <div className="text-xs text-[var(--mut)]">Aucune donnée disponible.</div>
              ) : (
                stats.authorBreakdown.map((item) => {
                  const pct = Math.max(
                    8,
                    Math.round((item.count / Math.max(1, stats.totalOrders)) * 100),
                  );
                  return (
                    <div key={item.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-[var(--fg)]">{item.name}</span>
                        <span className="tabular-nums text-[var(--mut)]">{item.count} créé(s)</span>
                      </div>
                      <div className="h-2 rounded bg-[var(--inp)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--ink)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-4">
            <div className="text-sm font-bold text-[var(--fg)] mb-3">
              Contrôles les plus souvent en attente
            </div>
            <div className="space-y-2">
              {stats.checklistGapBreakdown.length === 0 ? (
                <div className="text-xs text-[var(--ink)] font-semibold">
                  Tous les points de contrôle sont validés sur l’ensemble des ordres.
                </div>
              ) : (
                stats.checklistGapBreakdown.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-2 text-xs py-1 border-b border-[var(--row)] last:border-b-0"
                  >
                    <span className="text-[var(--fg)] truncate">{item.label}</span>
                    <span className="tabular-nums font-semibold text-[var(--red)] shrink-0">
                      {item.missingCount} non coché(s)
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Feedback / Error banners */}
      {feedback && (
        <div className="text-sm font-semibold text-[var(--ink)] bg-[var(--ink)]/10 border border-[var(--ink)]/30 rounded-md px-4 py-2.5">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div className="text-sm font-semibold text-[var(--red)] bg-[var(--red)]/10 border border-[var(--red)]/30 rounded-md px-4 py-2.5">
          {errorMsg}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--bd)] pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`min-h-[40px] px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 cursor-pointer ${
            activeTab === 'users'
              ? 'bg-[var(--pri)] text-white'
              : 'border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] hover:border-[var(--pri)]'
          }`}
        >
          <Users className="w-4 h-4" />
          Utilisateurs & Droits ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('roles')}
          className={`min-h-[40px] px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 cursor-pointer ${
            activeTab === 'roles'
              ? 'bg-[var(--pri)] text-white'
              : 'border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] hover:border-[var(--pri)]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Modèles de rôles ({roles.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('form')}
          className={`min-h-[40px] px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 cursor-pointer ${
            activeTab === 'form'
              ? 'bg-[var(--pri)] text-white'
              : 'border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] hover:border-[var(--pri)]'
          }`}
        >
          <FilePenLine className="w-4 h-4" />
          Formulaire d’enregistrement
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`min-h-[40px] px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 cursor-pointer ${
            activeTab === 'logs'
              ? 'bg-[var(--pri)] text-white'
              : 'border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] hover:border-[var(--pri)]'
          }`}
        >
          <Activity className="w-4 h-4" />
          Journal d’activité en temps réel ({logs.length})
        </button>
      </div>

      {/* TAB 1: USERS & PERMISSIONS */}
      {activeTab === 'users' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: `Tous (${users.length})` },
                  {
                    id: 'pending',
                    label: `En attente (${users.filter((u) => u.status === 'pending').length})`,
                  },
                  {
                    id: 'approved',
                    label: `Validés (${users.filter((u) => u.status === 'approved').length})`,
                  },
                  {
                    id: 'blocked',
                    label: `Refusés / Suspendus (${
                      users.filter((u) => u.status === 'rejected' || u.status === 'suspended')
                        .length
                    })`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-[var(--fg)] text-[var(--card)]'
                      : 'border border-[var(--bd)] bg-[var(--card)] text-[var(--mut)] hover:text-[var(--fg)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Rechercher un utilisateur…"
              className="w-full sm:w-64 min-h-[38px] px-3 py-1.5 rounded-md border border-[var(--bd)] bg-[var(--card)] text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--pri)]"
            />
          </div>

          <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[840px]">
                <thead>
                  <tr className="border-b border-[var(--row)]">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                      Utilisateur
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                      Service
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                      Rôle
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                      Statut
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                      Droits actifs
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--mut)]">
                        Aucun utilisateur correspondant aux critères.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSelf = u.id === currentUser.id;
                      const isEditing = editingUserId === u.id;
                      const activePermLabels = PERMISSION_DEFINITIONS.filter(
                        (p) => u.permissions[p.key],
                      ).map((p) => p.shortLabel);

                      return (
                        <React.Fragment key={u.id}>
                          <tr className="border-b border-[var(--row)] hover:bg-[var(--inp)]/50">
                            <td className="px-4 py-3 text-sm">
                              <div className="font-semibold text-[var(--fg)]">
                                {u.fullName} {isSelf ? '(Vous)' : ''}
                              </div>
                              <div className="text-xs text-[var(--mut)]">
                                <span className="font-mono">{u.username}</span> · {u.email}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-sm text-[var(--mut)]">{u.department}</td>
                            <td className="px-3 py-3 text-sm font-semibold">
                              {roleLabel(u.roleId)}
                            </td>
                            <td className="px-3 py-3 text-sm">
                              {u.status === 'pending' && (
                                <span className="font-semibold text-[var(--pri)]">
                                  En attente de validation
                                </span>
                              )}
                              {u.status === 'approved' && (
                                <span className="font-semibold text-[var(--ink)]">Validé</span>
                              )}
                              {u.status === 'rejected' && (
                                <span className="font-semibold text-[var(--red)]">Refusé</span>
                              )}
                              {u.status === 'suspended' && (
                                <span className="font-semibold text-[var(--red)]">Suspendu</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-xs text-[var(--mut)] max-w-[240px]">
                              {activePermLabels.length > 0 ? activePermLabels.join(' · ') : 'Aucun'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                {u.status === 'pending' && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={busyId === u.id}
                                      onClick={() => handleUpdateStatus(u.id, 'approved')}
                                      className="px-2.5 py-1.5 text-xs font-semibold rounded bg-[var(--ink)] text-white inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <UserCheck className="w-3.5 h-3.5" />
                                      Valider
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busyId === u.id}
                                      onClick={() => handleUpdateStatus(u.id, 'rejected')}
                                      className="px-2.5 py-1.5 text-xs font-semibold rounded border border-[var(--bd)] text-[var(--red)] bg-[var(--card)] inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <UserX className="w-3.5 h-3.5" />
                                      Refuser
                                    </button>
                                  </>
                                )}

                                {u.status === 'approved' && !isSelf && (
                                  <button
                                    type="button"
                                    disabled={busyId === u.id}
                                    onClick={() => handleUpdateStatus(u.id, 'suspended')}
                                    className="px-2.5 py-1.5 text-xs font-semibold rounded border border-[var(--bd)] bg-[var(--card)] text-[var(--mut)] hover:text-[var(--red)] inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                    Suspendre
                                  </button>
                                )}

                                {(u.status === 'rejected' || u.status === 'suspended') && (
                                  <button
                                    type="button"
                                    disabled={busyId === u.id}
                                    onClick={() => handleUpdateStatus(u.id, 'approved')}
                                    className="px-2.5 py-1.5 text-xs font-semibold rounded bg-[var(--ink)] text-white inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    Réactiver
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => openPermissionEditor(u)}
                                  className={`px-2.5 py-1.5 text-xs font-semibold rounded border inline-flex items-center gap-1 cursor-pointer ${
                                    isEditing
                                      ? 'border-[var(--pri)] bg-[var(--pri)] text-white'
                                      : 'border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] hover:border-[var(--pri)]'
                                  }`}
                                >
                                  <Sliders className="w-3.5 h-3.5" />
                                  Droits
                                </button>

                                {!isSelf &&
                                  (confirmDeleteUserId === u.id ? (
                                    <span className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={busyId === u.id}
                                        onClick={() => handleDeleteUser(u.id)}
                                        className="px-2 py-1.5 text-xs font-semibold rounded bg-[var(--red)] text-white cursor-pointer"
                                      >
                                        Confirmer
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteUserId(null)}
                                        className="px-2 py-1.5 text-xs font-semibold rounded border border-[var(--bd)] bg-[var(--card)] cursor-pointer"
                                      >
                                        Non
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteUserId(u.id)}
                                      className="p-1.5 rounded border border-[var(--bd)] bg-[var(--card)] text-[var(--red)] hover:border-[var(--red)] cursor-pointer"
                                      title="Supprimer le compte"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  ))}
                              </div>
                            </td>
                          </tr>

                          {/* Expandable Customizable Rights Matrix */}
                          {isEditing && draftPerms && (
                            <tr className="border-b border-[var(--row)] bg-[var(--inp)]">
                              <td colSpan={6} className="p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                  <div>
                                    <div className="font-bold text-sm text-[var(--fg)]">
                                      Personnalisation des droits d’accès — {u.fullName}
                                    </div>
                                    <div className="text-xs text-[var(--mut)]">
                                      Choisissez un modèle de rôle ou activez individuellement
                                      chaque autorisation.
                                    </div>
                                  </div>
                                  <label className="flex items-center gap-2 text-xs font-semibold text-[var(--mut)]">
                                    Modèle de rôle :
                                    <select
                                      value={draftRoleId}
                                      onChange={(e) =>
                                        handleRolePresetChangeForUser(e.target.value)
                                      }
                                      className="min-h-[36px] px-2.5 py-1 rounded border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] text-xs font-semibold"
                                    >
                                      {roles.map((r) => (
                                        <option key={r.id} value={r.id}>
                                          {r.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
                                  {PERMISSION_DEFINITIONS.map((perm) => {
                                    const lockedSelfAdmin =
                                      isSelf && perm.key === 'manageUsers';
                                    return (
                                      <label
                                        key={perm.key}
                                        className="flex items-start gap-2.5 p-2.5 rounded border border-[var(--bd)] bg-[var(--card)] cursor-pointer"
                                      >
                                        <input
                                          type="checkbox"
                                          disabled={lockedSelfAdmin}
                                          checked={draftPerms[perm.key]}
                                          onChange={() => handleToggleUserPerm(perm.key)}
                                          className="mt-0.5 w-4 h-4 accent-[var(--pri)] shrink-0"
                                        />
                                        <span className="text-xs">
                                          <span className="block font-semibold text-[var(--fg)]">
                                            {perm.label}
                                          </span>
                                          <span className="block text-[var(--mut)] mt-0.5">
                                            {perm.description}
                                          </span>
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={busyId === u.id}
                                    onClick={() => handleSaveUserPermissions(u.id)}
                                    className="px-3.5 py-2 rounded bg-[var(--pri)] text-white text-xs font-semibold cursor-pointer"
                                  >
                                    Enregistrer ces droits
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingUserId(null);
                                      setDraftPerms(null);
                                    }}
                                    className="px-3.5 py-2 rounded border border-[var(--bd)] bg-[var(--card)] text-xs font-semibold cursor-pointer"
                                  >
                                    Fermer
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ROLE TEMPLATES */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[var(--mut)] m-0">
              Personnalisez les modèles de rôles ou créez de nouveaux profils d’accès adaptés à
              votre organisation.
            </p>
            <button
              type="button"
              onClick={startNewRole}
              className="min-h-[40px] px-3.5 py-2 rounded-md bg-[var(--pri)] text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nouveau rôle personnalisé
            </button>
          </div>

          {(creatingNewRole || editingRoleId) && (
            <form
              onSubmit={handleSaveRole}
              className="bg-[var(--card)] border border-[var(--pri)] rounded-lg p-5 space-y-4"
            >
              <div className="font-display font-bold text-lg text-[var(--fg)]">
                {creatingNewRole ? 'Créer un rôle personnalisé' : `Modifier le rôle : ${roleFormLabel}`}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="block text-xs font-semibold text-[var(--mut)]">
                  Libellé du rôle *
                  <input
                    type="text"
                    value={roleFormLabel}
                    onChange={(e) => setRoleFormLabel(e.target.value)}
                    placeholder="ex. Chef d’atelier"
                    className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded border border-[var(--bd)] bg-[var(--inp)] text-sm text-[var(--fg)] font-normal"
                  />
                </label>
                <label className="block text-xs font-semibold text-[var(--mut)]">
                  Description
                  <input
                    type="text"
                    value={roleFormDesc}
                    onChange={(e) => setRoleFormDesc(e.target.value)}
                    placeholder="Responsabilités associées à ce profil"
                    className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded border border-[var(--bd)] bg-[var(--inp)] text-sm text-[var(--fg)] font-normal"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {PERMISSION_DEFINITIONS.map((perm) => (
                  <label
                    key={perm.key}
                    className="flex items-start gap-2.5 p-2.5 rounded border border-[var(--bd)] bg-[var(--inp)] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      disabled={editingRoleId === 'admin' && perm.key === 'manageUsers'}
                      checked={roleFormPerms[perm.key]}
                      onChange={() =>
                        setRoleFormPerms((prev) => ({
                          ...prev,
                          [perm.key]: !prev[perm.key],
                        }))
                      }
                      className="mt-0.5 w-4 h-4 accent-[var(--pri)]"
                    />
                    <span className="text-xs">
                      <span className="block font-semibold text-[var(--fg)]">{perm.label}</span>
                      <span className="block text-[var(--mut)] mt-0.5">{perm.description}</span>
                    </span>
                  </label>
                ))}
              </div>

              {!creatingNewRole && (
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--fg)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncRoleUsers}
                    onChange={(e) => setSyncRoleUsers(e.target.checked)}
                    className="w-4 h-4 accent-[var(--pri)]"
                  />
                  Appliquer automatiquement ces droits à tous les utilisateurs rattachés à ce rôle
                </label>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-[var(--pri)] text-white text-sm font-semibold cursor-pointer"
                >
                  Enregistrer le rôle
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingNewRole(false);
                    setEditingRoleId(null);
                  }}
                  className="px-4 py-2 rounded border border-[var(--bd)] bg-[var(--card)] text-sm font-semibold cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {roles.map((role) => {
              const userCount = users.filter((u) => u.roleId === role.id).length;
              return (
                <div
                  key={role.id}
                  className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-4 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-base text-[var(--fg)]">{role.label}</div>
                        <div className="text-xs text-[var(--mut)] mt-0.5">{role.description}</div>
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-[var(--mut)] shrink-0">
                        {userCount} utilisateur(s)
                      </span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-[var(--row)] flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {PERMISSION_DEFINITIONS.map((perm) => (
                        <span
                          key={perm.key}
                          className={
                            role.permissions[perm.key]
                              ? 'font-semibold text-[var(--ink)]'
                              : 'text-[var(--mut)] line-through opacity-60'
                          }
                        >
                          {perm.shortLabel}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => startEditRole(role)}
                      className="px-3 py-1.5 text-xs font-semibold rounded border border-[var(--bd)] bg-[var(--inp)] hover:border-[var(--pri)] cursor-pointer"
                    >
                      Personnaliser les droits
                    </button>
                    {!role.isSystem && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRole(role.id)}
                        className="px-2.5 py-1.5 text-xs font-semibold rounded border border-[var(--bd)] text-[var(--red)] hover:border-[var(--red)] cursor-pointer"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: FORM BUILDER */}
      {activeTab === 'form' && (
        <FormBuilderPanel
          formConfig={overview?.formConfig || formConfig || createDefaultFormConfig()}
          onConfigSaved={(nextConfig, nextOverview) => {
            onFormConfigChange(nextConfig);
            onOverviewChange(nextOverview);
          }}
          onNotify={(msg) => setFeedback(msg)}
          onError={(msg) => setErrorMsg(msg)}
        />
      )}

      {/* TAB 4: LIVE ACTIVITY LOGS */}
      {activeTab === 'logs' && (
        <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-[var(--row)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Horodatage
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Collaborateur
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Opération
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Cible
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Détails
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--mut)]">
                      Aucune activité enregistrée.
                    </td>
                  </tr>
                ) : (
                  logs.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-[var(--row)] last:border-b-0 hover:bg-[var(--inp)]/50"
                    >
                      <td className="px-4 py-2.5 text-xs tabular-nums text-[var(--mut)] whitespace-nowrap">
                        {formatDateTimeFr(entry.timestamp)}
                      </td>
                      <td className="px-3 py-2.5 text-sm font-semibold">{entry.actorName}</td>
                      <td className="px-3 py-2.5 text-xs font-semibold text-[var(--pri)]">
                        {entry.action}
                      </td>
                      <td className="px-3 py-2.5 text-sm">{entry.targetLabel}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--mut)]">
                        {entry.details || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
