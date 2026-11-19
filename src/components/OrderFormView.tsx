import React, { useEffect, useState } from 'react';
import { CheckSquare, FilePenLine, Save, Square, X } from 'lucide-react';
import type { OrderSavePayload } from '../api';
import { DEFAULT_CORE_FIELDS, padOrderId, todayIso } from '../constants';
import type { CoreFieldConfig, CoreFieldKey, FormConfig, RepairOrder, UserRecord } from '../types';

interface OrderFormViewProps {
  existingOrder?: RepairOrder | null;
  currentUser: UserRecord;
  formConfig: FormConfig;
  onSave: (payload: OrderSavePayload) => Promise<void>;
  onCancel: () => void;
  onOpenFormBuilder?: () => void;
}

export const OrderFormView: React.FC<OrderFormViewProps> = ({
  existingOrder,
  currentUser,
  formConfig,
  onSave,
  onCancel,
  onOpenFormBuilder,
}) => {
  const checklistItems = formConfig.checklistItems;
  const activeCustomFields = formConfig.customFields.filter((f) => f.enabled);

  const getCore = (key: CoreFieldKey): CoreFieldConfig =>
    formConfig.coreFields.find((f) => f.key === key) ||
    DEFAULT_CORE_FIELDS.find((f) => f.key === key)!;

  const [marque, setMarque] = useState(existingOrder?.marque || '');
  const [modele, setModele] = useState(existingOrder?.modele || '');
  const [immat, setImmat] = useState(existingOrder?.immat || '');
  const [vin, setVin] = useState(existingOrder?.vin || '');
  const [kmStr, setKmStr] = useState(existingOrder ? String(existingOrder.km) : '');
  const [date, setDate] = useState(existingOrder?.date || todayIso());
  const [checks, setChecks] = useState<boolean[]>(() =>
    Array.from({ length: checklistItems.length }, (_, i) =>
      Boolean(existingOrder?.checks?.[i]),
    ),
  );
  const [remarque, setRemarque] = useState(existingOrder?.remarque || '');
  const [tech, setTech] = useState(
    existingOrder?.tech ?? (currentUser.roleId === 'technicien' ? currentUser.fullName : ''),
  );
  const [ctrl, setCtrl] = useState(
    existingOrder?.ctrl ?? (currentUser.roleId === 'controleur' ? currentUser.fullName : ''),
  );

  const [customValues, setCustomValues] = useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {};
    for (const f of formConfig.customFields) {
      const existingVal = existingOrder?.customValues?.[f.id];
      if (f.type === 'checkbox') {
        initial[f.id] = Boolean(existingVal);
      } else {
        initial[f.id] = existingVal !== undefined && existingVal !== null ? String(existingVal) : '';
      }
    }
    return initial;
  });

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync array length if admin updates checklist items live via SSE
  useEffect(() => {
    setChecks((prev) =>
      Array.from({ length: checklistItems.length }, (_, i) => Boolean(prev[i])),
    );
  }, [checklistItems.length]);

  // Ensure any newly added custom fields have an initialized slot
  useEffect(() => {
    setCustomValues((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const f of formConfig.customFields) {
        if (!(f.id in next)) {
          next[f.id] = f.type === 'checkbox' ? false : '';
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [formConfig.customFields]);

  const completedCount = checks.filter(Boolean).length;

  const toggleCheck = (index: number) => {
    setChecks((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  const setAllChecks = (val: boolean) => {
    setChecks(new Array<boolean>(checklistItems.length).fill(val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const coreValues: Record<CoreFieldKey, string> = {
      marque: marque.trim(),
      modele: modele.trim(),
      immat: immat.trim(),
      vin: vin.trim().toUpperCase(),
      km: kmStr.trim(),
      date: date.trim(),
      remarque: remarque.trim(),
      tech: tech.trim(),
      ctrl: ctrl.trim(),
    };

    for (const cf of formConfig.coreFields) {
      if (cf.visible && cf.required && !coreValues[cf.key]) {
        setError(`Le champ « ${cf.label} » est obligatoire.`);
        return;
      }
    }

    const kmCfg = getCore('km');
    const km = kmStr.trim() === '' ? 0 : Number(kmStr);
    if ((kmCfg.visible && kmCfg.required && kmStr.trim() === '') || Number.isNaN(km) || km < 0) {
      setError('Indiquez un kilométrage valide.');
      return;
    }

    for (const field of activeCustomFields) {
      if (!field.required) continue;
      const val = customValues[field.id];
      if (field.type === 'checkbox') {
        if (val !== true) {
          setError(`La case « ${field.label} » doit être cochée.`);
          return;
        }
      } else if (!String(val || '').trim()) {
        setError(`Le champ « ${field.label} » est obligatoire.`);
        return;
      }
    }

    const normalizedCustom: Record<string, string | boolean> = {};
    for (const field of formConfig.customFields) {
      const val = customValues[field.id];
      if (field.type === 'checkbox') {
        normalizedCustom[field.id] = Boolean(val);
      } else {
        normalizedCustom[field.id] = String(val || '').trim();
      }
    }

    setSaving(true);
    try {
      await onSave({
        date: date || todayIso(),
        marque: marque.trim(),
        modele: modele.trim(),
        immat: immat.trim(),
        vin: vin.trim().toUpperCase(),
        km,
        checks,
        remarque: remarque.trim(),
        tech: tech.trim(),
        ctrl: ctrl.trim(),
        customValues: normalizedCustom,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  const marqueCfg = getCore('marque');
  const modeleCfg = getCore('modele');
  const immatCfg = getCore('immat');
  const vinCfg = getCore('vin');
  const kmCfg = getCore('km');
  const dateCfg = getCore('date');
  const remarqueCfg = getCore('remarque');
  const techCfg = getCore('tech');
  const ctrlCfg = getCore('ctrl');

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

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold tabular-nums text-[var(--pri)]">
            {completedCount} / {checklistItems.length} contrôles effectués
          </span>
          {currentUser.permissions.manageUsers && onOpenFormBuilder && (
            <button
              type="button"
              onClick={onOpenFormBuilder}
              className="min-h-[36px] px-3 py-1.5 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-xs font-semibold text-[var(--fg)] hover:border-[var(--pri)] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FilePenLine className="w-3.5 h-3.5 text-[var(--pri)]" />
              Modifier ce formulaire
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {marqueCfg.visible && (
            <label className="block text-[13px] font-semibold text-[var(--mut)]">
              {marqueCfg.label}
              {marqueCfg.required ? ' *' : ''}
              <input
                type="text"
                value={marque}
                onChange={(e) => setMarque(e.target.value)}
                placeholder={marqueCfg.placeholder}
                className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] focus:outline-none focus:border-[var(--pri)]"
              />
            </label>
          )}

          {modeleCfg.visible && (
            <label className="block text-[13px] font-semibold text-[var(--mut)]">
              {modeleCfg.label}
              {modeleCfg.required ? ' *' : ''}
              <input
                type="text"
                value={modele}
                onChange={(e) => setModele(e.target.value)}
                placeholder={modeleCfg.placeholder}
                className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] focus:outline-none focus:border-[var(--pri)]"
              />
            </label>
          )}

          {immatCfg.visible && (
            <label className="block text-[13px] font-semibold text-[var(--mut)]">
              {immatCfg.label}
              {immatCfg.required ? ' *' : ''}
              <input
                type="text"
                value={immat}
                onChange={(e) => setImmat(e.target.value)}
                placeholder={immatCfg.placeholder}
                className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] tabular-nums focus:outline-none focus:border-[var(--pri)]"
              />
            </label>
          )}

          {vinCfg.visible && (
            <label className="block text-[13px] font-semibold text-[var(--mut)]">
              {vinCfg.label}
              {vinCfg.required ? ' *' : ''}
              <input
                type="text"
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                placeholder={vinCfg.placeholder}
                className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-mono text-sm uppercase focus:outline-none focus:border-[var(--pri)]"
              />
            </label>
          )}

          {kmCfg.visible && (
            <label className="block text-[13px] font-semibold text-[var(--mut)]">
              {kmCfg.label}
              {kmCfg.required ? ' *' : ''}
              <input
                type="number"
                min={0}
                value={kmStr}
                onChange={(e) => setKmStr(e.target.value)}
                placeholder={kmCfg.placeholder}
                className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] tabular-nums focus:outline-none focus:border-[var(--pri)]"
              />
            </label>
          )}

          {dateCfg.visible && (
            <label className="block text-[13px] font-semibold text-[var(--mut)]">
              {dateCfg.label}
              {dateCfg.required ? ' *' : ''}
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] tabular-nums focus:outline-none focus:border-[var(--pri)]"
              />
            </label>
          )}
        </div>

        {/* Dynamic Admin-Configured Custom Fields / Columns */}
        {activeCustomFields.length > 0 && (
          <div className="pt-1 border-t border-[var(--row)]">
            <div className="font-bold text-[15px] text-[var(--fg)] mb-3">
              Informations complémentaires
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {activeCustomFields.map((field) => {
                const value = customValues[field.id];
                if (field.type === 'checkbox') {
                  return (
                    <label
                      key={field.id}
                      className="flex items-center gap-2.5 min-h-[42px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-sm font-semibold text-[var(--fg)] cursor-pointer hover:border-[var(--pri)]"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(e) =>
                          setCustomValues((prev) => ({
                            ...prev,
                            [field.id]: e.target.checked,
                          }))
                        }
                        className="w-[18px] h-[18px] accent-[var(--pri)] shrink-0 cursor-pointer"
                      />
                      <span>
                        {field.label}
                        {field.required ? ' *' : ''}
                      </span>
                    </label>
                  );
                }

                if (field.type === 'textarea') {
                  return (
                    <label
                      key={field.id}
                      className="block text-[13px] font-semibold text-[var(--mut)] sm:col-span-2 lg:col-span-3"
                    >
                      {field.label}
                      {field.required ? ' *' : ''}
                      <textarea
                        rows={2}
                        value={String(value || '')}
                        onChange={(e) =>
                          setCustomValues((prev) => ({
                            ...prev,
                            [field.id]: e.target.value,
                          }))
                        }
                        placeholder={field.placeholder || ''}
                        className="mt-1 block w-full min-h-[68px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] focus:outline-none focus:border-[var(--pri)]"
                      />
                    </label>
                  );
                }

                return (
                  <label
                    key={field.id}
                    className="block text-[13px] font-semibold text-[var(--mut)]"
                  >
                    {field.label}
                    {field.required ? ' *' : ''}
                    <input
                      type={
                        field.type === 'date'
                          ? 'date'
                          : field.type === 'number'
                            ? 'number'
                            : 'text'
                      }
                      value={String(value || '')}
                      onChange={(e) =>
                        setCustomValues((prev) => ({
                          ...prev,
                          [field.id]: e.target.value,
                        }))
                      }
                      placeholder={field.placeholder || ''}
                      className={`mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] focus:outline-none focus:border-[var(--pri)] ${
                        field.type === 'date' || field.type === 'number' ? 'tabular-nums' : ''
                      }`}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}

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
            {checklistItems.map((item, idx) => (
              <label
                key={`${idx}-${item}`}
                className="flex items-center gap-2.5 py-2.5 px-1 border-b border-[var(--row)] text-sm font-normal text-[var(--fg)] cursor-pointer hover:bg-[var(--inp)]/60"
              >
                <input
                  type="checkbox"
                  checked={Boolean(checks[idx])}
                  onChange={() => toggleCheck(idx)}
                  className="w-[18px] h-[18px] accent-[var(--pri)] shrink-0 cursor-pointer"
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </div>

        {remarqueCfg.visible && (
          <label className="block text-[13px] font-semibold text-[var(--mut)]">
            {remarqueCfg.label}
            {remarqueCfg.required ? ' *' : ''}
            <textarea
              value={remarque}
              onChange={(e) => setRemarque(e.target.value)}
              rows={3}
              placeholder={remarqueCfg.placeholder}
              className="mt-1 block w-full min-h-[76px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] focus:outline-none focus:border-[var(--pri)]"
            />
          </label>
        )}

        {(techCfg.visible || ctrlCfg.visible) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {techCfg.visible && (
              <label className="block text-[13px] font-semibold text-[var(--mut)]">
                {techCfg.label}
                {techCfg.required ? ' *' : ''}
                <input
                  type="text"
                  value={tech}
                  onChange={(e) => setTech(e.target.value)}
                  placeholder={techCfg.placeholder}
                  className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] focus:outline-none focus:border-[var(--pri)]"
                />
              </label>
            )}
            {ctrlCfg.visible && (
              <label className="block text-[13px] font-semibold text-[var(--mut)]">
                {ctrlCfg.label}
                {ctrlCfg.required ? ' *' : ''}
                <input
                  type="text"
                  value={ctrl}
                  onChange={(e) => setCtrl(e.target.value)}
                  placeholder={ctrlCfg.placeholder}
                  className="mt-1 block w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] font-normal text-[15px] focus:outline-none focus:border-[var(--pri)]"
                />
              </label>
            )}
          </div>
        )}

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
