import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, UserPlus } from 'lucide-react';
import { ApiError, fetchPublicRoles, loginUser, registerUser, type PublicRoleOption } from '../api';
import type { UserRecord } from '../types';
import { DjiboutiFlag } from './DjiboutiFlag';

interface AuthScreenProps {
  onAuthenticated: (token: string, user: UserRecord, requiresValidation: boolean) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onAuthenticated,
  darkMode,
  onToggleDarkMode,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [roles, setRoles] = useState<PublicRoleOption[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Login fields
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Parc Auto Protocole');
  const [roleId, setRoleId] = useState('technicien');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  useEffect(() => {
    fetchPublicRoles()
      .then((list) => {
        setRoles(list);
        if (list.length > 0 && !list.some((r) => r.id === roleId)) {
          setRoleId(list[0].id);
        }
      })
      .catch(() => {
        setRoles([
          { id: 'technicien', label: 'Technicien', description: 'Saisie des interventions' },
          { id: 'controleur', label: 'Contrôleur', description: 'Contrôle qualité' },
          { id: 'gestionnaire', label: 'Gestionnaire', description: 'Suivi et exports' },
          { id: 'consultant', label: 'Consultant', description: 'Consultation' },
        ]);
      });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim() || !loginPassword) {
      setError('Veuillez saisir votre identifiant (ou e-mail) et votre mot de passe.');
      return;
    }
    setLoading(true);
    try {
      const res = await loginUser(identifier.trim(), loginPassword);
      onAuthenticated(res.token, res.user, res.requiresValidation);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Impossible de joindre le serveur.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim() || !username.trim() || !email.trim() || !regPassword) {
      setError('Tous les champs obligatoires doivent être renseignés.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (regPassword !== regConfirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      const res = await registerUser({
        fullName: fullName.trim(),
        username: username.trim(),
        email: email.trim(),
        department: department.trim(),
        roleId,
        password: regPassword,
      });
      onAuthenticated(res.token, res.user, res.requiresValidation);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Erreur lors de l’inscription.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--fg)]">
      <div className="tri-bar w-full" />

      <div className="flex justify-end px-5 pt-4">
        <button
          type="button"
          onClick={onToggleDarkMode}
          className="px-3 py-1.5 text-xs font-semibold rounded-md border border-[var(--bd)] bg-[var(--card)] text-[var(--fg)] hover:border-[var(--pri)] transition-colors cursor-pointer"
        >
          {darkMode ? 'Mode clair' : 'Mode sombre'}
        </button>
      </div>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[480px]">
          <div className="bg-[var(--card)] border border-[var(--bd)] rounded-lg p-6 sm:p-7">
            <div className="flex items-center gap-2.5 text-xs font-semibold text-[var(--mut)] mb-3">
              <DjiboutiFlag />
              <span>République de Djibouti · Présidence de la République</span>
            </div>

            <h1 className="font-display text-2xl sm:text-[26px] font-bold text-[var(--fg)] leading-tight mb-1">
              Parc Auto Protocole
            </h1>
            <p className="text-sm text-[var(--mut)] mb-5">
              Plateforme centralisée des ordres de réparation et de contrôle technique.
            </p>

            {/* Tab Switcher */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-[var(--inp)] border border-[var(--bd)] mb-5">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
                className={`min-h-[40px] rounded px-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'bg-[var(--pri)] text-white'
                    : 'text-[var(--mut)] hover:text-[var(--fg)]'
                }`}
              >
                <Lock className="w-4 h-4" />
                Connexion
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError('');
                }}
                className={`min-h-[40px] rounded px-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'bg-[var(--pri)] text-white'
                    : 'text-[var(--mut)] hover:text-[var(--fg)]'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                Inscription
              </button>
            </div>

            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-[13px] font-semibold text-[var(--mut)] mb-1">
                    Identifiant ou adresse e-mail
                  </label>
                  <input
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Identifiant ou adresse e-mail"
                    className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] text-[15px] focus:outline-none focus:border-[var(--pri)]"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-[var(--mut)] mb-1">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full min-h-[42px] pl-3 pr-10 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] text-[15px] focus:outline-none focus:border-[var(--pri)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label="Afficher ou masquer le mot de passe"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--mut)] hover:text-[var(--fg)] p-1 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="text-sm font-semibold text-[var(--red)] bg-[var(--red)]/10 border border-[var(--red)]/30 rounded-md px-3 py-2">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[44px] rounded-md bg-[var(--pri)] hover:opacity-95 disabled:opacity-60 text-white font-semibold text-sm px-4 py-2.5 transition-opacity cursor-pointer"
                >
                  {loading ? 'Vérification en cours…' : 'Se connecter'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div className="text-xs text-[var(--mut)] bg-[var(--inp)] border border-[var(--bd)] rounded-md p-3">
                  Après votre inscription, votre compte sera placé en attente jusqu’à validation
                  par un administrateur du Parc Auto Protocole.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-semibold text-[var(--mut)] mb-1">
                      Nom complet *
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="ex. Ahmed Hassan"
                      className="w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--pri)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-semibold text-[var(--mut)] mb-1">
                      Identifiant *
                    </label>
                    <input
                      type="text"
                      autoCapitalize="none"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="ex. ahmed.h"
                      className="w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--pri)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-semibold text-[var(--mut)] mb-1">
                      Adresse e-mail *
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nom@presidence.dj"
                      className="w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--pri)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-semibold text-[var(--mut)] mb-1">
                      Service / Direction
                    </label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="Atelier / Protocole"
                      className="w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--pri)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-[var(--mut)] mb-1">
                    Profil demandé *
                  </label>
                  <select
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--pri)]"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label} — {r.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-semibold text-[var(--mut)] mb-1">
                      Mot de passe *
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="6 caractères min."
                      className="w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--pri)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-semibold text-[var(--mut)] mb-1">
                      Confirmation *
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={regConfirm}
                      onChange={(e) => setRegConfirm(e.target.value)}
                      placeholder="Répéter le mot de passe"
                      className="w-full min-h-[40px] px-3 py-2 rounded-md border border-[var(--bd)] bg-[var(--inp)] text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--pri)]"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-sm font-semibold text-[var(--red)] bg-[var(--red)]/10 border border-[var(--red)]/30 rounded-md px-3 py-2">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[44px] rounded-md bg-[var(--ink)] hover:opacity-95 disabled:opacity-60 text-white font-semibold text-sm px-4 py-2.5 transition-opacity cursor-pointer"
                >
                  {loading ? 'Envoi de la demande…' : 'Soumettre mon inscription'}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
