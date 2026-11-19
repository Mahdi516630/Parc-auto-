import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { adminResetFormConfig, adminUpdateFormConfig } from '../api';
import { createDefaultFormConfig, formatDateTimeFr } from '../constants';
import type {
  AdminOverviewPayload,
  CustomFieldDefinition,
  CustomFieldType,
  FormConfig,
} from '../types';

interface FormBuilderPanelProps {
  formConfig: FormConfig;
  onConfigSaved: (config: FormConfig, overview: AdminOverviewPayload) => void;
  onNotify: (msg: string) => void;
  onError: (msg: string) => void;
}

const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Texte court (à saisir)',
  date: 'Date',
  checkbox: 'Case à cocher',
  number: 'Nombre',
  textarea: 'Texte long (observations)',
};

function makeLocalId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const FormBuilderPanel: React.FC<FormBuilderPanelProps> = ({
  formConfig,
  onConfigSaved,
  onNotify,
  onError,
}) => {
  const [draft, setDraft] = useState<FormConfig>(() => ({
    coreFields: formConfig.coreFields.map((f) => ({ ...f })),
    customFields: formConfig.customFields.map((f) => ({ ...f })),
    checklistItems: [...formConfig.checklistItems],
    updatedAt: formConfig.updatedAt,
    updatedBy: formConfig.updatedBy,
  }));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Add/Edit custom column state
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [colLabel, setColLabel] = useState('');
  const [colType, setColType] = useState<CustomFieldType>('text');
  const [colPlaceholder, setColPlaceholder] = useState('');
  const [colRequired, setColRequired] = useState(false);
  const [colShowInTable, setColShowInTable] = useState(true);

  // Checklist add/edit state
  const [newCheckLabel, setNewCheckLabel] = useState('');
  const [editingCheckIdx, setEditingCheckIdx] = useState<number | null>(null);
  const [editingCheckValue, setEditingCheckValue] = useState('');

  useEffect(() => {
    if (!dirty) {
      setDraft({
        coreFields: formConfig.coreFields.map((f) => ({ ...f })),
        customFields: formConfig.customFields.map((f) => ({ ...f })),
        checklistItems: [...formConfig.checklistItems],
        updatedAt: formConfig.updatedAt,
        updatedBy: formConfig.updatedBy,
      });
    }
  }, [formConfig, dirty]);

  const resetCustomColumnEditor = () => {
    setEditingFieldId(null);
    setColLabel('');
    setColType('text');
    setColPlaceholder('');
    setColRequired(false);
    setColShowInTable(true);
  };

  const handleSaveCustomColumn = (e: React.FormEvent) => {
    e.preventDefault();
    onError('');
    const label = colLabel.trim();
    if (!label) {
      onError('Veuillez saisir le nom de la colonne ou du champ.');
      return;
    }

    if (editingFieldId) {
      setDraft((prev) => ({
        ...prev,
        customFields: prev.customFields.map((f) =>
          f.id === editingFieldId
            ? {
                ...f,
                label,
                type: colType,
                placeholder: colType === 'checkbox' ? '' : colPlaceholder.trim(),
                required: colRequired,
                showInTable: colShowInTable,
              }
            : f,
        ),
      }));
    } else {
      const nextField: CustomFieldDefinition = {
        id: makeLocalId('col'),
        label,
        type: colType,
        placeholder: colType === 'checkbox' ? '' : colPlaceholder.trim(),
        required: colRequired,
        showInTable: colShowInTable,
        enabled: true,
      };
      setDraft((prev) => ({
        ...prev,
        customFields: [...prev.customFields, nextField],
      }));
    }

    setDirty(true);
    resetCustomColumnEditor();
  };

  const startEditCustomColumn = (field: CustomFieldDefinition) => {
    setEditingFieldId(field.id);
    setColLabel(field.label);
    setColType(field.type);
    setColPlaceholder(field.placeholder || '');
    setColRequired(field.required);
    setColShowInTable(field.showInTable);
  };

  const moveCustomColumn = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= draft.customFields.length) return;
    setDraft((prev) => {
      const copy = [...prev.customFields];
      const [removed] = copy.splice(index, 1);
      copy.splice(target, 0, removed);
      return { ...prev, customFields: copy };
    });
    setDirty(true);
  };

  const deleteCustomColumn = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      customFields: prev.customFields.filter((f) => f.id !== id),
    }));
    if (editingFieldId === id) {
      resetCustomColumnEditor();
    }
    setDirty(true);
  };

  const toggleCustomColumnFlag = (id: string, key: 'enabled' | 'required' | 'showInTable') => {
    setDraft((prev) => ({
      ...prev,
      customFields: prev.customFields.map((f) =>
        f.id === id ? { ...f, [key]: !f[key] } : f,
      ),
    }));
    setDirty(true);
  };

  const updateCoreField = (
    key: string,
    patch: Partial<{ label: string; placeholder: string; required: boolean; visible: boolean }>,
  ) => {
    setDraft((prev) => ({
      ...prev,
      coreFields: prev.coreFields.map((f) => (f.key === key ? { ...f, ...patch } : f)),
    }));
    setDirty(true);
  };

  const handleAddChecklistItem = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newCheckLabel.trim();
    if (!text) return;
    setDraft((prev) => ({
      ...prev,
      checklistItems: [...prev.checklistItems, text],
    }));
    setNewCheckLabel('');
    setDirty(true);
  };

  const saveChecklistEdit = (idx: number) => {
    const text = editingCheckValue.trim();
    if (!text) return;
    setDraft((prev) => ({
      ...prev,
      checklistItems: prev.checklistItems.map((item, i) => (i === idx ? text : item)),
    }));
    setEditingCheckIdx(null);
    setEditingCheckValue('');
    setDirty(true);
  };

  const moveChecklistItem = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= draft.checklistItems.length) return;
    setDraft((prev) => {
      const copy = [...prev.checklistItems];
      const [removed] = copy.splice(idx, 1);
      copy.splice(target, 0, removed);
      return { ...prev, checklistItems: copy };
    });
    setDirty(true);
  };

  const deleteChecklistItem = (idx: number) => {
    if (draft.checklistItems.length <= 1) {
      onError('Le formulaire doit conserver au moins un point de contrôle.');
      return;
    }
    setDraft((prev) => ({
      ...prev,
      checklistItems: prev.checklistItems.filter((_, i) => i !== idx),
    }));
    setDirty(true);
  };

  const handlePersistConfig = async () => {
    onError('');
    onNotify('');
    setSaving(true);
    try {
      const res = await adminUpdateFormConfig(draft);
      setDirty(false);
      onConfigSaved(res.formConfig, res.overview);
      onNotify('Formulaire d’enregistrement mis à jour et diffusé en temps réel.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    onError('');
    onNotify('');
    setSaving(true);
    try {
      const res = await adminResetFormConfig();
      setDirty(false);
      setConfirmReset(false);
      resetCustomColumnEditor();
      onConfigSaved(res.formConfig, res.overview);
      onNotify('Formulaire rétabli selon le modèle officiel par défaut.');
    } catch (err) {
      const fallback = createDefaultFormConfig();
      setDraft(fallback);
      onError(err instanceof Error ? err.message : 'Erreur lors de la réinitialisation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sticky Save / Status Bar */}
      <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-[var(--fg)] m-0">
            Éditeur du formulaire d’enregistrement
          </h3>
          <p className="text-xs text-[var(--mut)] mt-0.5 tabular-nums">
            {draft.customFields.length} colonne(s) personnalisée(s) · {draft.checklistItems.length}{' '}
            point(s) de contrôle · Dernière modification : {formatDateTimeFr(formConfig.updatedAt)}
            {formConfig.updatedBy ? ` par ${formConfig.updatedBy}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {confirmReset ? (
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                disabled={saving}
                onClick={handleResetDefault}
                className="min-h-[38px] px-3 py-1.5 rounded-md bg-[var(--red)] text-white text-xs font-semibold cursor-pointer"
              >
                Confirmer la réinitialisation
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="min-h-[38px] px-3 py-1.5 rounded-md border border-[var(--bd)] bg-[var(--card)] text-xs font-semibold cursor-pointer"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirmReset(true)}
              className="min-h-[38px] px-3 py-1.5 rounded-md border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] text-xs font-semibold inline-flex items-center gap-1.5 hover:border-[var(--red)] hover:text-[var(--red)] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Rétablir par défaut
            </button>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={handlePersistConfig}
            className="min-h-[38px] px-4 py-1.5 rounded-md bg-[var(--pri)] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-95 disabled:opacity-60 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {saving
              ? 'Enregistrement…'
              : dirty
                ? 'Enregistrer les modifications *'
                : 'Enregistrer le formulaire'}
          </button>
        </div>
      </div>

      {/* SECTION 1: Custom Columns / Fields (Text, Date, Checkbox, Number, Textarea) */}
      <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-4 sm:p-5 space-y-4">
        <div>
          <h4 className="font-display text-base font-bold text-[var(--fg)] m-0">
            1. Colonnes et champs personnalisés (texte, date, case à cocher)
          </h4>
          <p className="text-xs text-[var(--mut)] mt-0.5">
            Ajoutez de nouvelles informations à saisir ou à cocher sur chaque ordre de réparation et
            choisissez si elles doivent apparaître comme colonnes dans le tableau partagé et les
            exports.
          </p>
        </div>

        <form
          onSubmit={handleSaveCustomColumn}
          className="bg-[var(--inp)] border border-[var(--bd)] rounded-md p-3.5 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block text-xs font-semibold text-[var(--mut)]">
              Nom du champ / de la colonne *
              <input
                type="text"
                value={colLabel}
                onChange={(e) => setColLabel(e.target.value)}
                placeholder="ex. Date de sortie, N° Bon, Accord chef…"
                className="mt-1 block w-full min-h-[38px] px-3 py-1.5 rounded border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] text-sm font-normal focus:outline-none focus:border-[var(--pri)]"
              />
            </label>

            <label className="block text-xs font-semibold text-[var(--mut)]">
              Type de saisie *
              <select
                value={colType}
                onChange={(e) => setColType(e.target.value as CustomFieldType)}
                className="mt-1 block w-full min-h-[38px] px-2.5 py-1.5 rounded border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] text-sm font-normal focus:outline-none focus:border-[var(--pri)]"
              >
                {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-[var(--mut)]">
              Texte d’aide (optionnel)
              <input
                type="text"
                disabled={colType === 'checkbox' || colType === 'date'}
                value={colPlaceholder}
                onChange={(e) => setColPlaceholder(e.target.value)}
                placeholder={colType === 'checkbox' ? 'Non applicable' : 'ex. Saisir la référence…'}
                className="mt-1 block w-full min-h-[38px] px-3 py-1.5 rounded border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] text-sm font-normal disabled:opacity-50 focus:outline-none focus:border-[var(--pri)]"
              />
            </label>

            <div className="flex flex-col justify-end gap-1.5 pb-0.5">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--fg)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={colRequired}
                  onChange={(e) => setColRequired(e.target.checked)}
                  className="w-4 h-4 accent-[var(--pri)]"
                />
                Champ obligatoire
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--fg)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={colShowInTable}
                  onChange={(e) => setColShowInTable(e.target.checked)}
                  className="w-4 h-4 accent-[var(--pri)]"
                />
                Afficher comme colonne du tableau
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="min-h-[36px] px-3.5 py-1.5 rounded bg-[var(--ink)] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {editingFieldId ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {editingFieldId ? 'Appliquer la modification' : 'Ajouter cette colonne / ce champ'}
            </button>
            {editingFieldId && (
              <button
                type="button"
                onClick={resetCustomColumnEditor}
                className="min-h-[36px] px-3 py-1.5 rounded border border-[var(--bd)] bg-[var(--card)] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Annuler l’édition
              </button>
            )}
          </div>
        </form>

        {draft.customFields.length === 0 ? (
          <div className="text-xs text-[var(--mut)] py-3 text-center border border-dashed border-[var(--bd)] rounded-md">
            Aucune colonne personnalisée ajoutée pour le moment. Utilisez le bloc ci-dessus pour
            ajouter un champ texte, date, nombre ou case à cocher.
          </div>
        ) : (
          <div className="overflow-x-auto border border-[var(--bd)] rounded-md">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-[var(--row)] bg-[var(--inp)]/50">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Libellé
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Type
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Obligatoire
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Colonne tableau
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Actif
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.customFields.map((field, idx) => (
                  <tr
                    key={field.id}
                    className={`border-b border-[var(--row)] last:border-b-0 ${
                      !field.enabled ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-sm">
                      <div className="font-semibold text-[var(--fg)]">{field.label}</div>
                      {field.placeholder && (
                        <div className="text-xs text-[var(--mut)]">{field.placeholder}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold text-[var(--pri)]">
                      {FIELD_TYPE_LABELS[field.type]}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={() => toggleCustomColumnFlag(field.id, 'required')}
                        className="w-4 h-4 accent-[var(--pri)] cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={field.showInTable}
                        onChange={() => toggleCustomColumnFlag(field.id, 'showInTable')}
                        className="w-4 h-4 accent-[var(--pri)] cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={field.enabled}
                        onChange={() => toggleCustomColumnFlag(field.id, 'enabled')}
                        className="w-4 h-4 accent-[var(--ink)] cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveCustomColumn(idx, -1)}
                          className="p-1.5 rounded border border-[var(--bd)] bg-[var(--card)] disabled:opacity-40 cursor-pointer"
                          title="Monter"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === draft.customFields.length - 1}
                          onClick={() => moveCustomColumn(idx, 1)}
                          className="p-1.5 rounded border border-[var(--bd)] bg-[var(--card)] disabled:opacity-40 cursor-pointer"
                          title="Descendre"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditCustomColumn(field)}
                          className="px-2 py-1 text-xs font-semibold rounded border border-[var(--bd)] bg-[var(--card)] hover:border-[var(--pri)] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCustomColumn(field.id)}
                          className="p-1.5 rounded border border-[var(--bd)] bg-[var(--card)] text-[var(--red)] hover:border-[var(--red)] cursor-pointer"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 2: Core Order Fields Customization */}
      <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-4 sm:p-5 space-y-3">
        <div>
          <h4 className="font-display text-base font-bold text-[var(--fg)] m-0">
            2. Champs principaux du formulaire d’ordre
          </h4>
          <p className="text-xs text-[var(--mut)] mt-0.5">
            Renommez les libellés, modifiez les indications de saisie ou rendez certains champs
            facultatifs ou masqués.
          </p>
        </div>

        <div className="overflow-x-auto border border-[var(--bd)] rounded-md">
          <table className="w-full border-collapse min-w-[680px]">
            <thead>
              <tr className="border-b border-[var(--row)] bg-[var(--inp)]/50">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                  Champ système
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                  Libellé affiché
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                  Indication (placeholder)
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                  Obligatoire
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-[var(--mut)]">
                  Visible
                </th>
              </tr>
            </thead>
            <tbody>
              {draft.coreFields.map((cf) => (
                <tr key={cf.key} className="border-b border-[var(--row)] last:border-b-0">
                  <td className="px-3 py-2 text-xs font-mono text-[var(--mut)]">{cf.key}</td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={cf.label}
                      onChange={(e) => updateCoreField(cf.key, { label: e.target.value })}
                      className="w-full min-h-[34px] px-2.5 py-1 rounded border border-[var(--bd)] bg-[var(--inp)] text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--pri)]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={cf.placeholder}
                      disabled={cf.key === 'date'}
                      onChange={(e) => updateCoreField(cf.key, { placeholder: e.target.value })}
                      className="w-full min-h-[34px] px-2.5 py-1 rounded border border-[var(--bd)] bg-[var(--inp)] text-sm text-[var(--fg)] disabled:opacity-50 focus:outline-none focus:border-[var(--pri)]"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={cf.required}
                      disabled={!cf.visible}
                      onChange={(e) => updateCoreField(cf.key, { required: e.target.checked })}
                      className="w-4 h-4 accent-[var(--pri)] cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={cf.visible}
                      onChange={(e) =>
                        updateCoreField(cf.key, {
                          visible: e.target.checked,
                          required: e.target.checked ? cf.required : false,
                        })
                      }
                      className="w-4 h-4 accent-[var(--ink)] cursor-pointer"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3: Checklist Items ("Description du travail") */}
      <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-4 sm:p-5 space-y-3">
        <div>
          <h4 className="font-display text-base font-bold text-[var(--fg)] m-0">
            3. Points de contrôle à cocher (« Description du travail »)
          </h4>
          <p className="text-xs text-[var(--mut)] mt-0.5">
            Modifiez, supprimez ou ajoutez de nouveaux points de vérification technique. Ces cases
            apparaissent dans le formulaire, la fiche imprimable et les exports PDF / Excel.
          </p>
        </div>

        <form onSubmit={handleAddChecklistItem} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={newCheckLabel}
            onChange={(e) => setNewCheckLabel(e.target.value)}
            placeholder="Nouveau point de contrôle (ex. Contrôle des plaquettes de frein)"
            className="flex-1 min-w-[240px] min-h-[38px] px-3 py-1.5 rounded border border-[var(--bd)] bg-[var(--inp)] text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--pri)]"
          />
          <button
            type="submit"
            className="min-h-[38px] px-3.5 py-1.5 rounded bg-[var(--ink)] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter un point
          </button>
        </form>

        <div className="divide-y divide-[var(--row)] border border-[var(--bd)] rounded-md">
          {draft.checklistItems.map((item, idx) => (
            <div
              key={`${idx}-${item}`}
              className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 hover:bg-[var(--inp)]/40"
            >
              <div className="flex items-center gap-2.5 flex-1 min-w-[220px]">
                <span className="text-xs font-mono tabular-nums text-[var(--mut)] w-6 shrink-0">
                  {idx + 1}.
                </span>
                {editingCheckIdx === idx ? (
                  <input
                    type="text"
                    value={editingCheckValue}
                    onChange={(e) => setEditingCheckValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveChecklistEdit(idx);
                      } else if (e.key === 'Escape') {
                        setEditingCheckIdx(null);
                      }
                    }}
                    autoFocus
                    className="flex-1 min-h-[34px] px-2.5 py-1 rounded border border-[var(--pri)] bg-[var(--card)] text-sm text-[var(--fg)] focus:outline-none"
                  />
                ) : (
                  <span className="text-sm text-[var(--fg)]">{item}</span>
                )}
              </div>

              <div className="inline-flex items-center gap-1">
                {editingCheckIdx === idx ? (
                  <>
                    <button
                      type="button"
                      onClick={() => saveChecklistEdit(idx)}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-[var(--pri)] text-white cursor-pointer"
                    >
                      Valider
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCheckIdx(null)}
                      className="px-2 py-1 text-xs font-semibold rounded border border-[var(--bd)] bg-[var(--card)] cursor-pointer"
                    >
                      Annuler
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveChecklistItem(idx, -1)}
                      className="p-1.5 rounded border border-[var(--bd)] bg-[var(--card)] disabled:opacity-40 cursor-pointer"
                      title="Monter"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === draft.checklistItems.length - 1}
                      onClick={() => moveChecklistItem(idx, 1)}
                      className="p-1.5 rounded border border-[var(--bd)] bg-[var(--card)] disabled:opacity-40 cursor-pointer"
                      title="Descendre"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCheckIdx(idx);
                        setEditingCheckValue(item);
                      }}
                      className="px-2 py-1 text-xs font-semibold rounded border border-[var(--bd)] bg-[var(--card)] hover:border-[var(--pri)] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteChecklistItem(idx)}
                      className="p-1.5 rounded border border-[var(--bd)] bg-[var(--card)] text-[var(--red)] hover:border-[var(--red)] cursor-pointer"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
