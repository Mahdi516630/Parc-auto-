import React, { useState } from 'react';
import { CheckSquare, Save, Square, X } from 'lucide-react';
import { CHECKLIST_ITEMS, padOrderId, todayIso } from '../constants';
import type { RepairOrder, UserRecord } from '../types';

interface OrderFormViewProps {
  existingOrder?: RepairOrder | null;
  currentUser: UserRecord;
  onSave: (payload: {
    date: string;
    marque: string;
    modele: string;
    immat: string;
    vin: string;
    km: number;
    checks: boolean[];
    remarque: string;
    tech: string;
    ctrl: string;
  }) => Promise<void>;
  onCancel: () => void;
}

export const OrderFormView: React.FC<OrderFormViewProps> = ({
  existingOrder,
  currentUser,
  onSave,
  onCancel,
}) => {
  const [marque, setMarque] = useState(existingOrder?.marque || '');
  const [modele, setModele] = useState(existingOrder?.modele || '');
  const [immat, setImmat] = useState(existingOrder?.immat || '');
  const [vin, setVin] = useState(existingOrder?.vin || '');
  const [kmStr, setKmStr] = useState(existingOrder ? String(existingOrder.km) : '');
  const [date, setDate] = useState(existingOrder?.date || todayIso());
  const [checks, setChecks] = useState<boolean[]>(
    existingOrder?.checks?.length === CHECKLIST_ITEMS.length
      ? [...existingOrder.checks]
      : new Array<boolean>(CHECKLIST_ITEMS.length).fill(false),
  );
  const [remarque, setRemarque] = useState(existingOrder?.remarque || '');
  const [tech, setTech] = useState(
    existingOrder?.tech ?? (currentUser.roleId === 'technicien' ? currentUser.fullName : ''),
  );
  const [ctrl, setCtrl] = useState(
    existingOrder?.ctrl ?? (currentUser.roleId === 'controleur' ? currentUser.fullName : ''),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const completedCount = checks.filter(Boolean).length;

  const toggleCheck = (index: number) => {
    setChecks((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  const setAllChecks = (val: boolean) => {
    setChecks(new Array<boolean>(CHECKLIST_ITEMS.length).fill(val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!marque.trim() || !modele.trim() || !immat.trim() || !date) {
      setError('Marque, modèle, immatriculation et date des travaux sont obligatoires.');
      return;
    }
    const km = Number(kmStr);
    if (kmStr.trim() === '' || Number.isNaN(km) || km < 0) {
      setError('Indiquez un kilométrage valide.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        date,
        marque: marque.trim(),
        modele: modele.trim(),
        immat: immat.trim(),
        vin: vin.trim().toUpperCase(),
        km,
        checks,
        remarque: remarque.trim(),
        tech: tech.trim(),
        ctrl: ctrl.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-2xl font-bold text-[var(--fg)] m-0">
            {existingOrder
              ? `Modifier l’ordre ${padOrderId(existingOrder.id)}`
              : 'Nouvel ordre de réparation'}
          </h2>
          <p className="text-sm text-[var(--mut)] mt-0.5">
            {existingOrder
              ? `Créé par ${existingOrder.createdByName} · Base centrale partagée`
              : `Enregistrement attribué à ${currentUser.fullName} dans la base centrale partagée`}
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums text-[var(--pri)]">
          {completedCount} / {CHECKLIST_ITEMS.length} contrôles effectués
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <label className="block text-[13px] font-semibold text-[var(--mut)]">
            Marque *
            <input
              type="text"
              value={marque}
              onChange={(e) => setMarque(e.target.value)}
              placeholder="ex. Renault"
              className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] focus:outline-none focus:border-[var(--pri)]"
            />
          </label>
          <label className="block text-[13px] font-semibold text-[var(--mut)]">
            Modèle *
            <input
              type="text"
              value={modele}
              onChange={(e) => setModele(e.target.value)}
              placeholder="ex. Safrane"
              className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] focus:outline-none focus:border-[var(--pri)]"
            />
          </label>
          <label className="block text-[13px] font-semibold text-[var(--mut)]">
            N° d’immatriculation *
            <input
              type="text"
              value={immat}
              onChange={(e) => setImmat(e.target.value)}
              placeholder="ex. 121"
              className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] tabular-nums focus:outline-none focus:border-[var(--pri)]"
            />
          </label>
          <label className="block text-[13px] font-semibold text-[var(--mut)]">
            VIN (Numéro de châssis)
            <input
              type="text"
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              placeholder="ex. VF1ABLACA3CC263895"
              className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-mono text-sm uppercase focus:outline-none focus:border-[var(--pri)]"
            />
          </label>
          <label className="block text-[13px] font-semibold text-[var(--mut)]">
            Kilométrage (km) *
            <input
              type="number"
              min={0}
              value={kmStr}
              onChange={(e) => setKmStr(e.target.value)}
              placeholder="ex. 14011"
              className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] tabular-nums focus:outline-none focus:border-[var(--pri)]"
            />
          </label>
          <label className="block text-[13px] font-semibold text-[var(--mut)]">
            Date des travaux *
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] tabular-nums focus:outline-none focus:border-[var(--pri)]"
            />
          </label>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="font-bold text-[15px] text-[var(--fg)]">Description du travail</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAllChecks(true)}
                className="px-2.5 py-1 text-xs font-semibold rounded border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] hover:border-[var(--pri)] flex items-center gap-1.5 cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5 text-[var(--ink)]" />
                Tout cocher
              </button>
              <button
                type="button"
                onClick={() => setAllChecks(false)}
                className="px-2.5 py-1 text-xs font-semibold rounded border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] hover:border-[var(--pri)] flex items-center gap-1.5 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 text-[var(--mut)]" />
                Tout décocher
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-7">
            {CHECKLIST_ITEMS.map((item, idx) => (
              <label
                key={item}
                className="flex items-center gap-2.5 py-2.5 px-1 border-b border-[var(--row)] text-sm font-normal text-[var(--fg)] cursor-pointer hover:bg-[var(--inp)]/60"
              >
                <input
                  type="checkbox"
                  checked={checks[idx]}
                  onChange={() => toggleCheck(idx)}
                  className="w-[18px] h-[18px] accent-[var(--pri)] shrink-0 cursor-pointer"
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="block text-[13px] font-semibold text-[var(--mut)]">
          Remarque
          <textarea
            value={remarque}
            onChange={(e) => setRemarque(e.target.value)}
            rows={3}
            placeholder="Observations, pièces remplacées ou recommandations de suivi…"
            className="mt-1 block w-full min-h-[76px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] focus:outline-none focus:border-[var(--pri)]"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <label className="block text-[13px] font-semibold text-[var(--mut)]">
            Nom du technicien
            <input
              type="text"
              value={tech}
              onChange={(e) => setTech(e.target.value)}
              placeholder="ex. M. Diallo"
              className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] focus:outline-none focus:border-[var(--pri)]"
            />
          </label>
          <label className="block text-[13px] font-semibold text-[var(--mut)]">
            Nom du contrôleur
            <input
              type="text"
              value={ctrl}
              onChange={(e) => setCtrl(e.target.value)}
              placeholder="ex. M. Mensah"
              className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] focus:outline-none focus:border-[var(--pri)]"
            />
          </label>
        </div>

        {error && (
          <div className="text-sm font-semibold text-[var(--red)] bg-[var(--red)]/10 border border-[var(--red)]/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2.5 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-4 py-2 rounded-md bg-[var(--pri)] text-white font-semibold text-sm flex items-center gap-2 hover:opacity-95 disabled:opacity-60 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Enregistrement…' : 'Enregistrer l’ordre'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 rounded-md border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] font-semibold text-sm flex items-center gap-2 hover:border-[var(--pri)] cursor-pointer"
          >
            <X className="w-4 h-4" />
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
};
