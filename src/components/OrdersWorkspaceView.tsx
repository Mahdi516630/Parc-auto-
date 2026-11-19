import React, { useMemo, useState } from 'react';
import {
  ClipboardList,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  Printer,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { formatDateFr, padOrderId, todayIso } from '../constants';
import type { PeriodFilter, RepairOrder, SortDirection, UserRecord } from '../types';
import {
  exportOfficialSheetsToPdf,
  exportOrdersToExcel,
  exportOrdersToPdf,
} from '../utils/exports';
import { OfficialSheet } from './PrintSheets';

interface OrdersWorkspaceViewProps {
  mode: 'home' | 'list';
  orders: RepairOrder[];
  currentUser: UserRecord;
  loading: boolean;
  onNavigateHome: () => void;
  onNavigateList: () => void;
  onNavigateNew: () => void;
  onNavigateEdit: (order: RepairOrder) => void;
  onNavigateAdmin: () => void;
  onDeleteOrder: (orderId: number) => Promise<void>;
  onPrintOrders: (ordersToPrint: RepairOrder[]) => void;
}

function isOrderInPeriod(orderDate: string, period: PeriodFilter, refDate: string): boolean {
  if (period === 'tout' || !refDate) return true;
  if (period === 'jour') return orderDate === refDate;
  const r = new Date(`${refDate}T00:00:00`);
  const x = new Date(`${orderDate}T00:00:00`);
  if (Number.isNaN(r.getTime()) || Number.isNaN(x.getTime())) return true;
  if (period === 'mois') {
    return r.getFullYear() === x.getFullYear() && r.getMonth() === x.getMonth();
  }
  // Semaine (Lundi - Dimanche)
  const start = new Date(r);
  start.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return x >= start && x <= end;
}

export const OrdersWorkspaceView: React.FC<OrdersWorkspaceViewProps> = ({
  mode,
  orders,
  currentUser,
  loading,
  onNavigateList,
  onNavigateNew,
  onNavigateEdit,
  onNavigateAdmin,
  onDeleteOrder,
  onPrintOrders,
}) => {
  const perms = currentUser.permissions;

  // Filters & selection state
  const [period, setPeriod] = useState<PeriodFilter>('tout');
  const [refDate, setRefDate] = useState<string>(() => todayIso());
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [authorFilter, setAuthorFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [previewOrder, setPreviewOrder] = useState<RepairOrder | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');

  const distinctAuthors = useMemo(() => {
    const names = new Set<string>();
    orders.forEach((o) => {
      if (o.createdByName) names.add(o.createdByName);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (!isOrderInPeriod(o.date, period, refDate)) return false;
        if (authorFilter !== 'all' && o.createdByName !== authorFilter) return false;
        if (!q) return true;
        const haystack = [
          padOrderId(o.id),
          o.marque,
          o.modele,
          o.immat,
          o.vin,
          o.tech,
          o.ctrl,
          o.createdByName,
          o.remarque,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const cmp = a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id;
        return sortDir === 'desc' ? -cmp : cmp;
      });
  }, [orders, period, refDate, sortDir, searchQuery, authorFilter]);

  const currentMonthPrefix = todayIso().slice(0, 7);
  const ordersThisMonth = useMemo(
    () => orders.filter((o) => o.date.startsWith(currentMonthPrefix)).length,
    [orders, currentMonthPrefix],
  );
  const incompleteOrders = useMemo(
    () => orders.filter((o) => o.checks.some((c) => !c)).length,
    [orders],
  );
  const recentOrders = useMemo(
    () =>
      [...orders]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
        .slice(0, 5),
    [orders],
  );

  const selectedFilteredOrders = useMemo(
    () => orders.filter((o) => selectedIds.has(o.id)),
    [orders, selectedIds],
  );

  const allFilteredSelected =
    filteredOrders.length > 0 && filteredOrders.every((o) => selectedIds.has(o.id));

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredOrders.forEach((o) => {
        if (checked) next.add(o.id);
        else next.delete(o.id);
      });
      return next;
    });
  };

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePrintSelection = () => {
    setFeedback('');
    if (selectedFilteredOrders.length === 0) {
      setFeedback('Sélectionnez au moins un ordre à imprimer.');
      return;
    }
    onPrintOrders(selectedFilteredOrders);
  };

  const handleExportPdf = () => {
    setFeedback('');
    const target = selectedFilteredOrders.length > 0 ? selectedFilteredOrders : filteredOrders;
    if (target.length === 0) {
      setFeedback('Aucun ordre à exporter en PDF.');
      return;
    }
    exportOrdersToPdf(target, currentUser.fullName);
  };

  const handleExportSheetsPdf = () => {
    setFeedback('');
    const target = selectedFilteredOrders.length > 0 ? selectedFilteredOrders : filteredOrders;
    if (target.length === 0) {
      setFeedback('Aucun ordre sélectionné pour les fiches PDF.');
      return;
    }
    exportOfficialSheetsToPdf(target);
  };

  const handleExportExcel = () => {
    setFeedback('');
    const target = selectedFilteredOrders.length > 0 ? selectedFilteredOrders : filteredOrders;
    if (target.length === 0) {
      setFeedback('Aucun ordre à exporter vers Excel.');
      return;
    }
    exportOrdersToExcel(target, currentUser.fullName);
  };

  const handleConfirmDelete = async (orderId: number) => {
    setDeletingId(orderId);
    try {
      await onDeleteOrder(orderId);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      setConfirmDeleteId(null);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur lors de la suppression.');
    } finally {
      setDeletingId(null);
    }
  };

  if (mode === 'home') {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="font-display text-2xl sm:text-[28px] font-bold text-[var(--fg)] m-0">
            Bonjour, {currentUser.fullName}
          </h2>
          <p className="text-sm text-[var(--mut)] mt-1">
            République de Djibouti · Présidence de la République · Parc Auto Protocole
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-5">
            <div className="font-display text-[32px] font-bold tabular-nums leading-none text-[var(--fg)]">
              {orders.length}
            </div>
            <div className="text-sm text-[var(--mut)] mt-2">
              ordres au total (base centrale partagée)
            </div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-5">
            <div className="font-display text-[32px] font-bold tabular-nums leading-none text-[var(--pri)]">
              {ordersThisMonth}
            </div>
            <div className="text-sm text-[var(--mut)] mt-2">ordres ce mois-ci</div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-5">
            <div className="font-display text-[32px] font-bold tabular-nums leading-none text-[var(--ink)]">
              {incompleteOrders}
            </div>
            <div className="text-sm text-[var(--mut)] mt-2">
              ordres avec contrôles incomplets
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {perms.createOrders && (
            <button
              type="button"
              onClick={onNavigateNew}
              className="min-h-[44px] px-4 py-2 rounded-md bg-[var(--pri)] text-white font-semibold text-sm flex items-center gap-2 hover:opacity-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nouvel ordre
            </button>
          )}
          <button
            type="button"
            onClick={onNavigateList}
            className="min-h-[44px] px-4 py-2 rounded-md border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] font-semibold text-sm flex items-center gap-2 hover:border-[var(--pri)] cursor-pointer"
          >
            <ClipboardList className="w-4 h-4" />
            Voir la liste des ordres
          </button>
          {perms.manageUsers && (
            <button
              type="button"
              onClick={onNavigateAdmin}
              className="min-h-[44px] px-4 py-2 rounded-md bg-[var(--ink)] text-white font-semibold text-sm flex items-center gap-2 hover:opacity-95 cursor-pointer"
            >
              <Shield className="w-4 h-4" />
              Tableau d’administration
            </button>
          )}
        </div>

        <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--row)] flex items-center justify-between gap-2">
            <span className="font-bold text-[15px] text-[var(--fg)]">
              Derniers ordres enregistrés dans la base centrale
            </span>
            <button
              type="button"
              onClick={onNavigateList}
              className="text-xs font-semibold text-[var(--pri)] hover:underline cursor-pointer"
            >
              Tout afficher →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-[var(--row)]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    N°
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Date
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Véhicule
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Immat.
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Contrôles
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Créé par
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Fiche
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--mut)]">
                      Chargement des enregistrements…
                    </td>
                  </tr>
                ) : recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--mut)]">
                      Aucun ordre de réparation enregistré pour le moment.
                    </td>
                  </tr>
                ) : (
                  recentOrders.map((o) => {
                    const done = o.checks.filter(Boolean).length;
                    return (
                      <tr
                        key={o.id}
                        className="border-b border-[var(--row)] last:border-b-0 hover:bg-[var(--inp)]/50"
                      >
                        <td className="px-4 py-2.5 text-sm font-mono tabular-nums">
                          {padOrderId(o.id)}
                        </td>
                        <td className="px-4 py-2.5 text-sm tabular-nums">{formatDateFr(o.date)}</td>
                        <td className="px-4 py-2.5 text-sm font-semibold">
                          {o.marque} {o.modele}
                        </td>
                        <td className="px-4 py-2.5 text-sm tabular-nums">{o.immat}</td>
                        <td className="px-4 py-2.5 text-sm tabular-nums">
                          <span
                            className={
                              done === 16
                                ? 'font-semibold text-[var(--ink)]'
                                : 'font-semibold text-[var(--pri)]'
                            }
                          >
                            {done}/16
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-[var(--mut)]">
                          {o.createdByName}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setPreviewOrder(o)}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded border border-[var(--bd)] bg-[var(--card)] hover:border-[var(--pri)] inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Aperçu
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {previewOrder && (
          <OrderPreviewModal
            order={previewOrder}
            canPrint={perms.printOrders}
            canExport={perms.exportData}
            onClose={() => setPreviewOrder(null)}
            onPrint={() => onPrintOrders([previewOrder])}
          />
        )}
      </div>
    );
  }

  // --- LIST VIEW ---
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[var(--fg)] m-0">
            Ordres de réparation
          </h2>
          <p className="text-sm text-[var(--mut)] mt-0.5">
            Base de données centrale partagée entre tous les collaborateurs habilités
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {perms.createOrders && (
            <button
              type="button"
              onClick={onNavigateNew}
              className="min-h-[40px] px-3.5 py-2 rounded-md bg-[var(--pri)] text-white font-semibold text-sm flex items-center gap-1.5 hover:opacity-95 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Nouvel ordre
            </button>
          )}
          {perms.printOrders && (
            <button
              type="button"
              onClick={handlePrintSelection}
              className="min-h-[40px] px-3.5 py-2 rounded-md border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] font-semibold text-sm flex items-center gap-1.5 hover:border-[var(--pri)] cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              Imprimer la sélection ({selectedFilteredOrders.length})
            </button>
          )}
          {perms.exportData && (
            <>
              <button
                type="button"
                onClick={handleExportPdf}
                className="min-h-[40px] px-3.5 py-2 rounded-md border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] font-semibold text-sm flex items-center gap-1.5 hover:border-[var(--pri)] cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-4 h-4 text-[var(--red)]" />
                Exporter PDF
              </button>
              {selectedFilteredOrders.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportSheetsPdf}
                  className="min-h-[40px] px-3.5 py-2 rounded-md border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] font-semibold text-sm flex items-center gap-1.5 hover:border-[var(--pri)] cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4 text-[var(--pri)]" />
                  Fiches PDF ({selectedFilteredOrders.length})
                </button>
              )}
              <button
                type="button"
                onClick={handleExportExcel}
                className="min-h-[40px] px-3.5 py-2 rounded-md bg-[var(--ink)] text-white font-semibold text-sm flex items-center gap-1.5 hover:opacity-95 cursor-pointer whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Exporter Excel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <label className="block text-[13px] font-semibold text-[var(--mut)]">
            Période
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
              className="mt-1 block w-full min-h-[40px] px-2.5 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-sm"
            >
              <option value="jour">Jour</option>
              <option value="semaine">Semaine</option>
              <option value="mois">Mois</option>
              <option value="tout">Tout afficher</option>
            </select>
          </label>

          <label className="block text-[13px] font-semibold text-[var(--mut)]">
            Date de référence
            <input
              type="date"
              value={refDate}
              disabled={period === 'tout'}
              onChange={(e) => setRefDate(e.target.value)}
              className="mt-1 block w-full min-h-[40px] px-2.5 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-sm tabular-nums disabled:opacity-50"
            />
          </label>

          <label className="block text-[13px] font-semibold text-[var(--mut)]">
            Tri par date
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as SortDirection)}
              className="mt-1 block w-full min-h-[40px] px-2.5 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-sm"
            >
              <option value="desc">Plus récent d’abord</option>
              <option value="asc">Plus ancien d’abord</option>
            </select>
          </label>

          <label className="block text-[13px] font-semibold text-[var(--mut)]">
            Créé par
            <select
              value={authorFilter}
              onChange={(e) => setAuthorFilter(e.target.value)}
              className="mt-1 block w-full min-h-[40px] px-2.5 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-sm"
            >
              <option value="all">Tous les collaborateurs</option>
              {distinctAuthors.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-[13px] font-semibold text-[var(--mut)]">
            Recherche
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Marque, immat., VIN, auteur…"
              className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-sm focus:outline-none focus:border-[var(--pri)]"
            />
          </label>
        </div>

        {feedback && (
          <div className="mt-3 text-sm font-semibold text-[var(--red)]">{feedback}</div>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[820px]">
            <thead>
              <tr className="border-b border-[var(--row)]">
                <th className="px-3.5 py-3 w-10">
                  <input
                    type="checkbox"
                    aria-label="Tout sélectionner"
                    checked={allFilteredSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    className="w-[18px] h-[18px] accent-[var(--pri)] cursor-pointer"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                  N°
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                  Date
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                  Véhicule
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                  Immat.
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                  Km
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                  Contrôles
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                  Créé par
                </th>
                <th className="px-3.5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-[var(--mut)]">
                    Aucun ordre pour cette sélection.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => {
                  const done = o.checks.filter(Boolean).length;
                  const isDeletingThis = confirmDeleteId === o.id;
                  return (
                    <tr
                      key={o.id}
                      className="border-b border-[var(--row)] last:border-b-0 hover:bg-[var(--inp)]/50"
                    >
                      <td className="px-3.5 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Sélectionner l’ordre ${padOrderId(o.id)}`}
                          checked={selectedIds.has(o.id)}
                          onChange={() => toggleOne(o.id)}
                          className="w-[18px] h-[18px] accent-[var(--pri)] cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-sm font-mono tabular-nums">
                        {padOrderId(o.id)}
                      </td>
                      <td className="px-3 py-2.5 text-sm tabular-nums whitespace-nowrap">
                        {formatDateFr(o.date)}
                      </td>
                      <td className="px-3 py-2.5 text-sm">
                        <div className="font-semibold text-[var(--fg)]">
                          {o.marque} {o.modele}
                        </div>
                        {o.vin && (
                          <div className="text-xs font-mono text-[var(--mut)]">{o.vin}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-sm tabular-nums">{o.immat}</td>
                      <td className="px-3 py-2.5 text-sm text-right tabular-nums whitespace-nowrap">
                        {o.km.toLocaleString('fr-FR')} km
                      </td>
                      <td className="px-3 py-2.5 text-sm tabular-nums">
                        <span
                          className={
                            done === 16
                              ? 'font-semibold text-[var(--ink)]'
                              : 'font-semibold text-[var(--pri)]'
                          }
                        >
                          {done}/16
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-[var(--mut)]">
                        {o.createdByName}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewOrder(o)}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded border border-[var(--bd)] bg-[var(--card)] hover:border-[var(--pri)] inline-flex items-center gap-1 cursor-pointer"
                            title="Aperçu et impression"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Aperçu
                          </button>

                          {perms.editOrders && (
                            <button
                              type="button"
                              onClick={() => onNavigateEdit(o)}
                              className="px-2.5 py-1.5 text-xs font-semibold rounded border border-[var(--bd)] bg-[var(--card)] hover:border-[var(--pri)] inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Modifier
                            </button>
                          )}

                          {perms.deleteOrders &&
                            (isDeletingThis ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={deletingId === o.id}
                                  onClick={() => handleConfirmDelete(o.id)}
                                  className="px-2 py-1.5 text-xs font-semibold rounded bg-[var(--red)] text-white cursor-pointer"
                                >
                                  Confirmer
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1.5 text-xs font-semibold rounded border border-[var(--bd)] bg-[var(--card)] cursor-pointer"
                                >
                                  Annuler
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(o.id)}
                                className="px-2 py-1.5 text-xs font-semibold rounded border border-[var(--bd)] bg-[var(--card)] text-[var(--red)] hover:border-[var(--red)] inline-flex items-center cursor-pointer"
                                title="Supprimer cet ordre"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewOrder && (
        <OrderPreviewModal
          order={previewOrder}
          canPrint={perms.printOrders}
          canExport={perms.exportData}
          onClose={() => setPreviewOrder(null)}
          onPrint={() => onPrintOrders([previewOrder])}
        />
      )}
    </div>
  );
};

interface OrderPreviewModalProps {
  order: RepairOrder;
  canPrint: boolean;
  canExport: boolean;
  onClose: () => void;
  onPrint: () => void;
}

const OrderPreviewModal: React.FC<OrderPreviewModalProps> = ({
  order,
  canPrint,
  canExport,
  onClose,
  onPrint,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg w-full max-w-[820px] max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--bd)] flex flex-wrap items-center justify-between gap-2">
          <div className="font-display font-bold text-lg text-[var(--fg)]">
            Fiche Ordre de Réparation N° {padOrderId(order.id)}
          </div>
          <div className="flex items-center gap-2">
            {canExport && (
              <button
                type="button"
                onClick={() => exportOfficialSheetsToPdf([order])}
                className="px-3 py-1.5 text-xs font-semibold rounded border border-[var(--bd)] bg-[var(--inp)] hover:border-[var(--pri)] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-[var(--red)]" />
                Télécharger PDF
              </button>
            )}
            {canPrint && (
              <button
                type="button"
                onClick={onPrint}
                className="px-3 py-1.5 text-xs font-semibold rounded bg-[var(--pri)] text-white inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimer
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer l’aperçu"
              className="p-1.5 rounded border border-[var(--bd)] bg-[var(--card)] hover:border-[var(--pri)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto p-4 bg-[#d5d9e2]">
          <div className="max-w-[740px] mx-auto border border-[#000] bg-white">
            <OfficialSheet order={order} />
          </div>
        </div>
      </div>
    </div>
  );
};
