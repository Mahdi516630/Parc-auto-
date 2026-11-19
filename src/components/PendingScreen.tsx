import React, { useState } from 'react';
import { Clock, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { formatDateTimeFr } from '../constants';
import type { RoleDefinition, UserRecord } from '../types';
import { DjiboutiFlag } from './DjiboutiFlag';

interface PendingScreenProps {
  user: UserRecord;
  roles: RoleDefinition[];
  onRefreshStatus: () => Promise<void>;
  onLogout: () => void;
}

export const PendingScreen: React.FC<PendingScreenProps> = ({
  user,
  roles,
  onRefreshStatus,
  onLogout,
}) => {
  const [checking, setChecking] = useState(false);

  const roleLabel = roles.find((r) => r.id === user.roleId)?.label || user.roleId;
  const isBlocked = user.status === 'rejected' || user.status === 'suspended';

  const handleCheck = async () => {
    setChecking(true);
    try {
      await onRefreshStatus();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--fg)]">
      <div className="tri-bar w-full" />

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[540px] bg-[var(--card)] border border-[var(--bd)] rounded-lg p-6 sm:p-8">
          <div className="flex items-center gap-2.5 text-xs font-semibold text-[var(--mut)] mb-4">
            <DjiboutiFlag />
            <span>République de Djibouti · Présidence de la République · Parc Auto Protocole</span>
          </div>

          <div className="flex items-start gap-3 mb-4">
            <div
              className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 border ${
                isBlocked
                  ? 'border-[var(--red)]/30 bg-[var(--red)]/10 text-[var(--red)]'
                  : 'border-[var(--pri)]/30 bg-[var(--pri)]/10 text-[var(--pri)]'
              }`}
            >
              {isBlocked ? <ShieldAlert className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-[var(--fg)] leading-tight">
                {user.status === 'rejected'
                  ? 'Demande d’accès refusée'
                  : user.status === 'suspended'
                    ? 'Compte suspendu'
                    : 'Compte en attente de validation'}
              </h1>
              <p className="text-sm text-[var(--mut)] mt-1">
                {isBlocked
                  ? 'L’accès à la base centrale des ordres de réparation n’est pas autorisé pour ce compte. Contactez un administrateur.'
                  : 'Votre inscription a bien été enregistrée. Un administrateur doit valider votre compte et attribuer vos droits d’accès avant votre première connexion.'}
              </p>
            </div>
          </div>

          <div className="border border-[var(--bd)] rounded-md bg-[var(--inp)] divide-y divide-[var(--row)] text-sm mb-6">
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-[var(--mut)] font-semibold">Collaborateur</span>
              <span className="font-semibold text-right">{user.fullName}</span>
            </div>
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-[var(--mut)] font-semibold">Identifiant</span>
              <span className="font-mono text-right">{user.username}</span>
            </div>
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-[var(--mut)] font-semibold">Adresse e-mail</span>
              <span className="text-right">{user.email}</span>
            </div>
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-[var(--mut)] font-semibold">Service / Profil demandé</span>
              <span className="text-right">
                {user.department} · {roleLabel}
              </span>
            </div>
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-[var(--mut)] font-semibold">Date d’inscription</span>
              <span className="tabular-nums text-right">{formatDateTimeFr(user.createdAt)}</span>
            </div>
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-[var(--mut)] font-semibold">Statut actuel</span>
              <span
                className={`font-semibold ${
                  isBlocked ? 'text-[var(--red)]' : 'text-[var(--pri)]'
                }`}
              >
                {user.status === 'pending'
                  ? 'En attente de validation'
                  : user.status === 'rejected'
                    ? 'Refusé'
                    : 'Suspendu'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {!isBlocked && (
              <button
                type="button"
                onClick={handleCheck}
                disabled={checking}
                className="min-h-[44px] px-4 py-2 rounded-md bg-[var(--pri)] text-white font-semibold text-sm flex items-center gap-2 hover:opacity-95 disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Vérification…' : 'Vérifier la validation'}
              </button>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="min-h-[44px] px-4 py-2 rounded-md border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] font-semibold text-sm flex items-center gap-2 hover:border-[var(--pri)] cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Retour à la connexion
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
